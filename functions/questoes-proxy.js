/* ==========================================================
   functions/questoes-proxy.js — Cloudflare Pages Function

   Proxy genérico ("prompt" entra, texto da IA sai) usado por duas telas do
   app: geração de questões (questoes.html) e extração de matérias/conteúdo
   programático a partir do PDF do edital (index.html, "Importar Edital PDF").
   Guarda a chave paga da OpenRouter como variável de ambiente secreta (nunca
   chega ao navegador de quem visita o site) e limita quantas chamadas por dia
   cada visitante pode fazer, pra dividir a cota de 1.000 requisições/dia da
   conta entre todo mundo sem um usuário só (ou um bot) estourar tudo sozinho.

   Isso substitui o "cloudflare-worker/questoes-proxy.js" original: como o
   projeto já está conectado ao Cloudflare Pages (deploy automático a cada
   push no GitHub), um arquivo aqui em /functions vira uma rota automaticamente
   — não precisa criar um Worker separado.

   A lógica de escolha/corrida/fallback entre modelos vive em
   functions/_shared/ai-core.js (compartilhada com functions/warmup-questoes.js).

   Rota resultante: https://<seu-projeto>.pages.dev/questoes-proxy
   (ou o domínio customizado, se você apontar um pra este projeto Pages).

   COMO CONFIGURAR (no projeto "estudo-fiscal" que você já criou em
   Workers & Pages → estudo-fiscal):
   1. Aba Settings → Environment variables → Production → Add variable:
        - OPENROUTER_API_KEY  → cole a chave da OpenRouter → marque "Encrypt"
        - ALLOWED_ORIGIN      → https://cicloestudo.com.br,https://www.cicloestudo.com.br
          (lista separada por vírgula, sem espaço, sem barra no final — inclua TODAS as
          variações de domínio pelas quais o site é acessado; com só uma, quem acessa
          pela outra tem as chamadas ao proxy bloqueadas por CORS, o que aparece no app
          como "Failed to fetch" sem nenhuma pista) — pode repetir na aba "Preview" se
          quiser testar por deployments de preview também (esses já são liberados à parte,
          ver corsHeaders em _shared/ai-core.js).
   2. (Recomendado) Aba Settings → Functions → KV namespace bindings → Add:
        - Storage & Databases → KV → Create a namespace (ex.: "QZ_RATE_LIMIT")
          se ainda não tiver uma, e vincule com Variable name: RATE_LIMIT_KV.
        Sem esse passo o proxy ainda funciona, só que sem limite por visitante E sem o
        banco compartilhado de questões (ver "Banco compartilhado de questões" abaixo —
        sem KV, toda geração cai direto na IA, sem cache) E sem o pré-aquecimento
        (functions/warmup-questoes.js também depende do mesmo KV).
   3. Faça um novo commit/push (ou "Retry deployment" no dashboard) pra esse
      arquivo entrar no ar — variáveis de ambiente e bindings só valem a
      partir do próximo deployment depois de configurados. Depois do deploy,
      confira no log de build se ele lista este arquivo como Function (se
      aparecer "No functions dir at /functions found", o Pages não achou a
      pasta — confira se o "Root directory" do projeto está na raiz do repo).
   4. `QZ_PROXY_URL` (questoes.html) e `EDITAL_PROXY_URL` (index.html) usam
      caminho relativo ('/questoes-proxy'), então funcionam automaticamente em
      qualquer domínio que sirva este mesmo projeto (apex, www, *.pages.dev)
      sem precisar de ajuste nem depender de CORS entre domínios.
   ========================================================== */

import { corsHeaders, resolveModel } from './_shared/ai-core.js';

// Quantas gerações por dia cada visitante (por IP) pode fazer. Ajuste conforme
// o tamanho do seu público — o teto da conta é 1.000/dia no total.
const DAILY_LIMIT_PER_IP = 100;

export async function onRequestOptions(context) {
    return new Response(null, { headers: corsHeaders(context.env, context.request) });
}

export async function onRequestPost(context) {
    const { request, env } = context;
    const cors = corsHeaders(env, request);

    let body;
    try { body = await request.json(); } catch (e) {
        return new Response(JSON.stringify({ error: 'Corpo da requisição inválido (esperado JSON).' }), {
            status: 400, headers: { ...cors, 'content-type': 'application/json' }
        });
    }

    // --- Banco compartilhado de questões (questoes.html) ---
    // Antes de gerar um lote novo, o cliente consulta se ALGUÉM já gerou questões pra este
    // tópico; se sim, reaproveita em vez de gastar cota de IA de novo — e ao final grava de
    // volta as questões (velhas + novas) desse tópico, pra quem pedir depois já achar prontas.
    // Não usa IA nem a chave da OpenRouter, então fica fora do fluxo de modelos/rate-limit abaixo.
    // Usa o MESMO KV do rate limit (RATE_LIMIT_KV), só com prefixo "qbank:" pra não colidir com "rl:".
    if (body && (body.action === 'bankGet' || body.action === 'bankSave')) {
        return handleQuestionBank(body, context, cors);
    }

    if (!env.OPENROUTER_API_KEY) {
        return new Response(JSON.stringify({ error: 'Proxy sem OPENROUTER_API_KEY configurada (Settings → Environment variables).' }), {
            status: 500, headers: { ...cors, 'content-type': 'application/json' }
        });
    }

    // --- Rate limit por IP (opcional: só funciona se o KV estiver vinculado) ---
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const today = new Date().toISOString().slice(0, 10);
    const kvKey = `rl:${ip}:${today}`;
    let count = 0;
    if (env.RATE_LIMIT_KV) {
        count = parseInt(await env.RATE_LIMIT_KV.get(kvKey), 10) || 0;
        if (count >= DAILY_LIMIT_PER_IP) {
            return new Response(JSON.stringify({
                error: `Limite diário de uso automático da IA atingido (${DAILY_LIMIT_PER_IP}/dia por visitante). Tente de novo amanhã.`
            }), { status: 429, headers: { ...cors, 'content-type': 'application/json' } });
        }
    }

    const prompt = body && body.prompt;
    if (!prompt || typeof prompt !== 'string') {
        return new Response(JSON.stringify({ error: 'Campo "prompt" obrigatório.' }), {
            status: 400, headers: { ...cors, 'content-type': 'application/json' }
        });
    }
    // O cliente pode pedir mais tokens de saída (ex.: extração de edital grande gera JSON extenso),
    // mas com um teto pra não deixar ninguém pedir uma resposta absurdamente cara.
    const maxTokens = Math.min(Math.max(parseInt(body.max_tokens, 10) || 4000, 256), 10000);
    // Streaming opcional (usado por questoes.html pra mostrar progresso em vez de um spinner parado
    // até o lote inteiro terminar) — ver comentário em tryModel() no ai-core sobre a limitação que
    // isso implica (sem checagem de "conteúdo vazio" nesse modo).
    const stream = body.stream === true;

    const result = await resolveModel({ prompt, maxTokens, stream, apiKey: env.OPENROUTER_API_KEY, referer: env.ALLOWED_ORIGIN });

    if (!result.ok) {
        const status = (result.status && result.status >= 400) ? result.status : 502;
        const message = result.error
            ? ('Falha ao chamar a OpenRouter: ' + result.error.message)
            : `Todos os modelos de IA estão indisponíveis no momento (último status: ${result.status}).`;
        return new Response(JSON.stringify({ error: message }), {
            status, headers: { ...cors, 'content-type': 'application/json' }
        });
    }

    // Só conta a requisição na cota do visitante se ela realmente foi processada.
    if (env.RATE_LIMIT_KV) {
        await env.RATE_LIMIT_KV.put(kvKey, String(count + 1), { expirationTtl: 60 * 60 * 26 });
    }

    if (stream) {
        // Repassa o corpo (ReadableStream) da resposta da OpenRouter direto pro cliente, sem
        // bufferizar — é assim que o ganho de latência percebida acontece: o cliente processa o
        // texto conforme ele chega, em vez de esperar a resposta inteira se formar aqui primeiro.
        return new Response(result.res.body, {
            status: result.res.status, headers: { ...cors, 'content-type': 'text/event-stream' }
        });
    }

    return new Response(result.text, { status: result.status, headers: { ...cors, 'content-type': 'application/json' } });
}

/** Lê/grava o banco compartilhado de questões de um tópico no KV (ver comentário acima).
 *  Também grava um contador de popularidade por tópico (qbankhit:<key>) e o nome legível da
 *  matéria/tópico (não recuperável a partir da bankKey, que é normalizada/sem acentos) — usados
 *  por functions/warmup-questoes.js pra decidir o que vale a pena pré-gerar. */
async function handleQuestionBank(body, context, cors) {
    const { env } = context;
    const bankKey = String(body.bankKey || '');
    if (!/^[a-z0-9_-]{1,150}$/.test(bankKey)) {
        return new Response(JSON.stringify({ error: 'bankKey inválida.' }), {
            status: 400, headers: { ...cors, 'content-type': 'application/json' }
        });
    }

    if (body.action === 'bankGet') {
        let questoes = [];
        if (env.RATE_LIMIT_KV) {
            const raw = await env.RATE_LIMIT_KV.get('qbank:' + bankKey);
            if (raw) {
                try {
                    const stored = JSON.parse(raw);
                    // Compat: chaves gravadas antes desta versão guardavam só o array puro.
                    questoes = Array.isArray(stored) ? stored : (Array.isArray(stored?.questoes) ? stored.questoes : []);
                } catch (e) { /* ignora lixo salvo */ }
            }
            // Contador de popularidade, usado pelo pré-aquecimento (functions/warmup-questoes.js)
            // pra saber quais tópicos vale a pena manter com o banco cheio. "waitUntil" garante que
            // a escrita no KV termine mesmo depois da resposta já ter voltado pro cliente — sem
            // isso o Workers runtime pode matar a promise no meio, já que ela não bloqueia a resposta.
            context.waitUntil(incrementHitCounter(env, bankKey));
        }
        return new Response(JSON.stringify({ questoes }), { status: 200, headers: { ...cors, 'content-type': 'application/json' } });
    }

    // bankSave — limitado ao mesmo teto de 100 questões por tópico usado no resto do app.
    // materia/topico (nome legível, não a bankKey normalizada) ficam salvos junto especificamente
    // pra o pré-aquecimento conseguir montar um prompt de geração sem precisar adivinhar a partir
    // do slug (que perde acentos/maiúsculas).
    const questoes = Array.isArray(body.questoes) ? body.questoes.slice(0, 100) : [];
    const materia = typeof body.materia === 'string' ? body.materia.slice(0, 200) : '';
    const topico = typeof body.topico === 'string' ? body.topico.slice(0, 300) : '';
    if (env.RATE_LIMIT_KV) {
        await env.RATE_LIMIT_KV.put('qbank:' + bankKey, JSON.stringify({ materia, topico, questoes, updatedAt: Date.now() }));
    }
    return new Response(JSON.stringify({ ok: true, saved: questoes.length }), { status: 200, headers: { ...cors, 'content-type': 'application/json' } });
}

async function incrementHitCounter(env, bankKey) {
    try {
        const key = 'qbankhit:' + bankKey;
        const raw = await env.RATE_LIMIT_KV.get(key);
        await env.RATE_LIMIT_KV.put(key, String((parseInt(raw, 10) || 0) + 1));
    } catch (e) { /* contador de popularidade é só um bônus, falha não deve afetar o usuário */ }
}
