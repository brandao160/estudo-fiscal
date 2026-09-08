/* ==========================================================
   functions/questoes-proxy.js — Cloudflare Pages Function

   Proxy entre questoes.html e a OpenRouter: guarda a chave paga da OpenRouter
   como variável de ambiente secreta (nunca chega ao navegador de quem visita
   o site) e limita quantas gerações por dia cada visitante pode fazer, pra
   dividir a cota de 1.000 requisições/dia da conta entre todo mundo sem um
   usuário só (ou um bot) estourar tudo sozinho.

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
      partir do próximo deployment depois de configurados.
   4. Copie a URL final (https://estudo-fiscal.pages.dev/questoes-proxy, ou
      o domínio customizado) e cole no campo "URL do proxy" da aba OpenRouter,
      dentro do modal "IA" de questoes.html.
   ========================================================== */

// Ajuste aqui se quiser trocar de modelo grátis mais pra frente — a lista
// muda com o tempo em openrouter.ai/models (filtro "Free").
const MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

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
                error: `Limite diário de geração automática atingido (${DAILY_LIMIT_PER_IP}/dia por visitante). Tente de novo amanhã ou use sua própria chave (Gemini/Claude/OpenRouter) no modal "IA".`
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

    let orRes;
    try {
        orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
                'HTTP-Referer': env.ALLOWED_ORIGIN || 'https://cicloestudo.com.br',
                'X-Title': 'Ciclo de Estudo'
            },
            body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt }] })
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Falha ao chamar a OpenRouter: ' + e.message }), {
            status: 502, headers: { ...cors, 'content-type': 'application/json' }
        });
    }

    const text = await orRes.text();

    // Só conta a requisição na cota do visitante se ela realmente foi processada.
    if (env.RATE_LIMIT_KV && orRes.ok) {
        await env.RATE_LIMIT_KV.put(kvKey, String(count + 1), { expirationTtl: 60 * 60 * 26 });
    }

    return new Response(text, { status: orRes.status, headers: { ...cors, 'content-type': 'application/json' } });
}
