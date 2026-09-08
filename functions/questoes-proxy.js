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
        Sem esse passo o proxy ainda funciona, só que sem limite por visitante.
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

// Tenta os modelos nesta ordem; o primeiro que responder sem erro de "indisponível" é o usado.
// ATENÇÃO — os 3 primeiros são PAGOS (colocados a pedido, só pra comparar qualidade/performance):
//   openai/gpt-6-astra        ~$0,01/1K tokens de entrada + ~$0,05/1K de saída
//   qwen/qwen3.8-max-0902     ~$0,002/1K de entrada + ~$0,006/1K de saída (bem mais barato)
//   anthropic/claude-fable-5.1 ~$0,01/1K de entrada + ~$0,05/1K de saída
// Um lote de 20 questões (uns 5-8 mil tokens de saída) custa a partir de ~$0,03 (Qwen) até ~$0,30
// (Astra/Fable) POR CHAMADA — e isso sai da cota compartilhada usada por QUALQUER visitante do site,
// não só de quem está testando. Com o "Key Limit" de $1 configurado na chave, isso esgota rapidinho
// (uns 3-4 lotes nos modelos caros). Pra voltar a ser 100% grátis depois do teste, é só apagar essas
// 3 linhas — os modelos grátis abaixo continuam como fallback caso os pagos falhem (sem crédito, etc).
const FREE_MODELS = [
    'openai/gpt-6-astra',
    'qwen/qwen3.8-max-0902',
    'anthropic/claude-fable-5.1',
    'openrouter/free', // roteador automático da própria OpenRouter entre modelos grátis disponíveis
    'google/gemma-4-31b-it:free',
    'nvidia/nemotron-3-super-120b-a12b:free'
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

    let body;
    try { body = await request.json(); } catch (e) {
        return new Response(JSON.stringify({ error: 'Corpo da requisição inválido (esperado JSON com "prompt").' }), {
            status: 400, headers: { ...cors, 'content-type': 'application/json' }
        });
    }
    const prompt = body && body.prompt;
    if (!prompt || typeof prompt !== 'string') {
        return new Response(JSON.stringify({ error: 'Campo "prompt" obrigatório.' }), {
            status: 400, headers: { ...cors, 'content-type': 'application/json' }
        });
    }
    // O cliente pode pedir mais tokens de saída (ex.: extração de edital grande gera JSON extenso),
    // mas com um teto pra não deixar ninguém pedir uma resposta absurdamente cara.
    const maxTokens = Math.min(Math.max(parseInt(body.max_tokens, 10) || 4000, 256), 8000);

    // Tenta os modelos da lista em ordem; se um estiver indisponível/sem crédito/fora do ar,
    // passa pro próximo em vez de já devolver erro pro usuário.
    let orRes, text;
    for (let i = 0; i < FREE_MODELS.length; i++) {
        const model = FREE_MODELS[i];
        try {
            orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
                    'HTTP-Referer': env.ALLOWED_ORIGIN || 'https://cicloestudo.com.br',
                    'X-Title': 'Ciclo de Estudo'
                },
                body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens })
            });
        } catch (e) {
            return new Response(JSON.stringify({ error: 'Falha ao chamar a OpenRouter: ' + e.message }), {
                status: 502, headers: { ...cors, 'content-type': 'application/json' }
            });
        }
        text = await orRes.text();
        // 402 = sem crédito (ex.: estourou o Key Limit) — cai pros modelos grátis da lista em vez de falhar.
        const isUnavailable = [400, 402, 404, 429, 503].includes(orRes.status);
        const isLast = i === FREE_MODELS.length - 1;
        if (orRes.ok || !isUnavailable || isLast) break;
    }

    // Só conta a requisição na cota do visitante se ela realmente foi processada.
    if (env.RATE_LIMIT_KV && orRes.ok) {
        await env.RATE_LIMIT_KV.put(kvKey, String(count + 1), { expirationTtl: 60 * 60 * 26 });
    }

    return new Response(text, { status: orRes.status, headers: { ...cors, 'content-type': 'application/json' } });
}
