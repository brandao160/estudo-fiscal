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

   Rota resultante: https://<seu-projeto>.pages.dev/questoes-proxy
   (ou o domínio customizado, se você apontar um pra este projeto Pages).

   COMO CONFIGURAR (no projeto "estudo-fiscal" que você já criou em
   Workers & Pages → estudo-fiscal):
   1. Aba Settings → Environment variables → Production → Add variable:
        - OPENROUTER_API_KEY  → cole a chave da OpenRouter → marque "Encrypt"
        - ALLOWED_ORIGIN      → https://cicloestudo.com.br (ou o domínio do
          site; sem barra no final) — pode repetir os dois na aba "Preview"
          se quiser testar por deployments de preview também.
   2. (Recomendado) Aba Settings → Functions → KV namespace bindings → Add:
        - Storage & Databases → KV → Create a namespace (ex.: "QZ_RATE_LIMIT")
          se ainda não tiver uma, e vincule com Variable name: RATE_LIMIT_KV.
        Sem esse passo o proxy ainda funciona, só que sem limite por visitante E sem o
        banco compartilhado de questões (ver "Banco compartilhado de questões" abaixo —
        sem KV, toda geração cai direto na IA, sem cache).
   3. Faça um novo commit/push (ou "Retry deployment" no dashboard) pra esse
      arquivo entrar no ar — variáveis de ambiente e bindings só valem a
      partir do próximo deployment depois de configurados. Depois do deploy,
      confira no log de build se ele lista este arquivo como Function (se
      aparecer "No functions dir at /functions found", o Pages não achou a
      pasta — confira se o "Root directory" do projeto está na raiz do repo).
   4. A URL fica fixa em código, não precisa configurar nada na interface:
      `QZ_PROXY_URL` em questoes.html e `EDITAL_PROXY_URL` em index.html —
      ajuste as duas se o domínio/projeto do Cloudflare mudar.
   ========================================================== */

// Testamos modelos pagos "de ponta" (GPT-6 Astra, Qwen3.8 Max, Claude Fable 5.1) e voltamos atrás:
// o GPT-6 Astra sozinho consumiu ~$0,83 numa única chamada (é um modelo com "reasoning" — gasta um
// monte de tokens invisíveis "pensando" antes de responder, cobrados como saída). Ruim demais pra
// uma cota compartilhada por qualquer visitante do site.
//
// Tenta os modelos nesta ordem; o primeiro que responder sem erro de "indisponível" é o usado.
// Os dois primeiros são grátis; o terceiro é pago mas CUSTA CENTAVOS DE CENTAVO (sem "reasoning",
// pra não repetir o susto do Astra) — só entra em ação se os dois grátis estiverem fora do ar/muito
// lentos/indisponíveis, servindo de rede de segurança pra sempre ter uma resposta rápida. Os últimos
// da lista são mais grátis, como último recurso caso até o pago falhe.
//
// A OpenRouter muda os modelos grátis disponíveis toda semana — se algum parar de funcionar,
// atualize conferindo openrouter.ai/models (filtro "Price: Free"; pro pago, ordene por preço e
// confira que NÃO tem "reasoning" no nome/descrição antes de trocar).
const FREE_MODELS = [
    'openrouter/free',              // grátis — roteador automático da própria OpenRouter
    'google/gemma-4-31b-it:free',   // grátis — 31B, uso geral
    'upstage/solar-pro4',           // PAGO, ~$0,03 de entrada + $0,12 de saída por MILHÃO de tokens
                                     // (sem reasoning) — um lote de questões custa frações de centavo
    'nvidia/nemotron-3-super-120b-a12b:free', // grátis — modelo grande (MoE), último recurso
    'thinkingmachines/inkling-small:free',    // grátis — 12B, último recurso
    'google/gemma-4-26b-a4b-it:free'          // grátis — último recurso
];

// Quantas gerações por dia cada visitante (por IP) pode fazer. Ajuste conforme
// o tamanho do seu público — o teto da conta é 1.000/dia no total.
const DAILY_LIMIT_PER_IP = 15;

function corsHeaders(env) {
    return {
        'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
}

export async function onRequestOptions(context) {
    return new Response(null, { headers: corsHeaders(context.env) });
}

export async function onRequestPost(context) {
    const { request, env } = context;
    const cors = corsHeaders(env);

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
        return handleQuestionBank(body, env, cors);
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

    // Nenhum modelo pode deixar o usuário esperando pra sempre — se demorar mais que isso, aborta e
    // cai pro próximo da lista (é assim que o pago barato de posição 3 entra em ação quando os
    // grátis estão lentos, não só quando dão erro). Mantido moderado de propósito: Cloudflare Pages
    // Functions tem um limite de duração total por requisição — encadear timeouts longos demais em
    // vários modelos seguidos poderia estourar esse limite antes mesmo de chegar no fallback pago.
    const MODEL_TIMEOUT_MS = 8000;

    // Tenta os modelos da lista em ordem; se um estiver indisponível/sem crédito/fora do ar/lento
    // demais, passa pro próximo em vez de já devolver erro pro usuário.
    let orRes, text;
    for (let i = 0; i < FREE_MODELS.length; i++) {
        const model = FREE_MODELS[i];
        const isLast = i === FREE_MODELS.length - 1;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
        try {
            orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
                    'HTTP-Referer': env.ALLOWED_ORIGIN || 'https://cicloestudo.com.br',
                    'X-Title': 'Ciclo de Estudo'
                },
                // reasoning:effort "none" evita que um modelo com raciocínio embutido (alguns dos
                // grátis têm isso, inclusive escolhidos pelo roteador automático "openrouter/free")
                // gaste todo o max_tokens "pensando" em silêncio e devolva o conteúdo vazio — foi
                // exatamente isso que causou demora enorme + "IA não retornou texto". Em modelos que
                // não suportam desligar o raciocínio, esse campo é simplesmente ignorado (sem risco).
                body: JSON.stringify({
                    model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens,
                    reasoning: { effort: 'none' }
                }),
                signal: controller.signal
            });
        } catch (e) {
            // Timeout (AbortError) ou falha de rede: tenta o próximo modelo, a não ser que seja o último.
            if (isLast) {
                return new Response(JSON.stringify({ error: 'Falha ao chamar a OpenRouter: ' + e.message }), {
                    status: 502, headers: { ...cors, 'content-type': 'application/json' }
                });
            }
            continue;
        } finally {
            clearTimeout(timeoutId);
        }
        text = await orRes.text();

        // Um 200 OK com conteúdo vazio (modelo gastou o max_tokens todo "pensando" e não sobrou nada
        // pra resposta) NÃO é sucesso de verdade — sem essa checagem, isso passava como se fosse uma
        // resposta válida e o usuário só via "IA não retornou texto" no final, sem tentar outro modelo.
        let emptyContent = false;
        if (orRes.ok) {
            try { emptyContent = !JSON.parse(text)?.choices?.[0]?.message?.content; } catch (e) { /* resposta não era JSON — deixa como está */ }
        }

        // 402 = sem crédito (ex.: estourou o Key Limit) — cai pros próximos modelos da lista em vez de falhar.
        const isUnavailable = [400, 402, 404, 429, 503].includes(orRes.status) || emptyContent;
        if ((orRes.ok && !emptyContent) || !isUnavailable || isLast) break;
    }

    // Só conta a requisição na cota do visitante se ela realmente foi processada.
    if (env.RATE_LIMIT_KV && orRes.ok) {
        await env.RATE_LIMIT_KV.put(kvKey, String(count + 1), { expirationTtl: 60 * 60 * 26 });
    }

    return new Response(text, { status: orRes.status, headers: { ...cors, 'content-type': 'application/json' } });
}

/** Lê/grava o banco compartilhado de questões de um tópico no KV (ver comentário acima). */
async function handleQuestionBank(body, env, cors) {
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
            if (raw) { try { questoes = JSON.parse(raw); } catch (e) { /* ignora lixo salvo */ } }
        }
        return new Response(JSON.stringify({ questoes }), { status: 200, headers: { ...cors, 'content-type': 'application/json' } });
    }

    // bankSave — limitado ao mesmo teto de 100 questões por tópico usado no resto do app.
    const questoes = Array.isArray(body.questoes) ? body.questoes.slice(0, 100) : [];
    if (env.RATE_LIMIT_KV) {
        await env.RATE_LIMIT_KV.put('qbank:' + bankKey, JSON.stringify(questoes));
    }
    return new Response(JSON.stringify({ ok: true, saved: questoes.length }), { status: 200, headers: { ...cors, 'content-type': 'application/json' } });
}
