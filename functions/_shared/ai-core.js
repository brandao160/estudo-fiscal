/* ==========================================================
   functions/_shared/ai-core.js — lógica compartilhada de chamada à OpenRouter

   Importado por functions/questoes-proxy.js e functions/warmup-questoes.js.
   O prefixo "_" na pasta faz o Cloudflare Pages NÃO tratar este arquivo como
   uma rota HTTP (mesma convenção de "_middleware.js") — é só um módulo comum,
   com bundling automático do próprio Pages Functions (sem precisar de build
   step manual, sem npm).
   ========================================================== */

// Testamos modelos pagos "de ponta" (GPT-6 Astra, Qwen3.8 Max, Claude Fable 5.1) e voltamos atrás:
// o GPT-6 Astra sozinho consumiu ~$0,83 numa única chamada (é um modelo com "reasoning" — gasta um
// monte de tokens invisíveis "pensando" antes de responder, cobrados como saída). Ruim demais pra
// uma cota compartilhada por qualquer visitante do site.
//
// Os dois modelos de RACE_MODELS são disparados em PARALELO (ver raceModels()) — usa o que responder
// primeiro, cancela o outro. Só se os dois falharem/demorarem é que a sequência de FALLBACK_MODELS
// é tentada uma a uma; o modelo pago (barato, sem reasoning) vem primeiro nela de propósito, pra
// servir de rede de segurança rápida assim que os grátis falham, em vez de esperar mais um timeout
// de um modelo grátis "de último recurso" antes de chegar nele.
//
// A OpenRouter muda os modelos grátis disponíveis toda semana — se algum parar de funcionar,
// atualize conferindo openrouter.ai/models (filtro "Price: Free"; pro pago, ordene por preço e
// confira que NÃO tem "reasoning" no nome/descrição antes de trocar).
export const RACE_MODELS = [
    'openrouter/free',              // grátis — roteador automático da própria OpenRouter
    'google/gemma-4-31b-it:free',   // grátis — 31B, uso geral
];
export const FALLBACK_MODELS = [
    'upstage/solar-pro4',           // PAGO, ~$0,03 de entrada + $0,12 de saída por MILHÃO de tokens
                                     // (sem reasoning) — um lote de questões custa frações de centavo.
                                     // Primeiro da sequência de fallback de propósito (ver comentário acima).
    'nvidia/nemotron-3-super-120b-a12b:free', // grátis — modelo grande (MoE), último recurso
    'thinkingmachines/inkling-small:free',    // grátis — 12B, último recurso
    'google/gemma-4-26b-a4b-it:free'          // grátis — último recurso
];

// Timeout por tentativa. Os dois RACE_MODELS correm ao mesmo tempo, então 6s aqui custa no máximo
// 6s de espera real (não 12s) — um pouco mais generoso que o fallback sequencial porque não há
// pena de "esperar mais" enquanto o outro candidato ainda pode vencer a corrida.
export const RACE_TIMEOUT_MS = 6000;
// Cada modelo de fallback é tentado um de cada vez (não têm com quem competir), por isso um teto
// mais apertado — eram 8s antes; baixado pra cortar o pior caso quando vários fallbacks falham em
// sequência.
export const FALLBACK_TIMEOUT_MS = 5000;

const RETRYABLE_STATUSES = [400, 402, 404, 429, 503];

/** CORS: o header Access-Control-Allow-Origin só aceita UM valor por resposta, então fixar
 *  ALLOWED_ORIGIN num domínio só quebra a outra variação (ex.: "cicloestudo.com.br" configurado,
 *  mas o site também responde em "www.cicloestudo.com.br" — quem acessa pelo www. tem a chamada
 *  bloqueada pelo navegador, o que chega no app só como "Failed to fetch", sem nenhuma pista).
 *  Em vez disso, ALLOWED_ORIGIN aceita uma lista separada por vírgula e ecoamos de volta a Origin
 *  da requisição só se ela estiver na lista (ou for um deployment de preview do próprio projeto,
 *  *.estudo-fiscal.pages.dev — sempre liberado, é o mesmo projeto). */
export function corsHeaders(env, request) {
    const configured = (env.ALLOWED_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
    const origin = request ? request.headers.get('Origin') : null;
    const isOwnPreview = origin && /^https:\/\/([a-z0-9-]+\.)?estudo-fiscal\.pages\.dev$/i.test(origin);
    const allowOrigin = origin && (configured.includes(origin) || isOwnPreview) ? origin : (configured[0] || '*');
    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Vary': 'Origin',
    };
}

/** Uma única tentativa de chamada a um modelo, com timeout e (opcional) streaming.
 *  Retorna { ok, status, text|res, emptyContent, error }. "ok" só é true se a resposta veio 2xx
 *  E (no modo não-streaming) tinha conteúdo de verdade — ver comentário sobre "reasoning" abaixo. */
export async function tryModel(model, { prompt, maxTokens, stream, apiKey, referer }, controller, timeoutMs) {
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': referer || 'https://cicloestudo.com.br',
                'X-Title': 'Ciclo de Estudo'
            },
            // reasoning:effort "none" evita que um modelo com raciocínio embutido (alguns dos
            // grátis têm isso, inclusive escolhidos pelo roteador automático "openrouter/free")
            // gaste todo o max_tokens "pensando" em silêncio e devolva o conteúdo vazio. Em modelos
            // que não suportam desligar o raciocínio, esse campo é simplesmente ignorado (sem risco).
            body: JSON.stringify({
                model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens,
                reasoning: { effort: 'none' },
                ...(stream ? { stream: true } : {})
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (stream) {
            // Em modo streaming não dá pra checar "conteúdo vazio" sem consumir o corpo inteiro
            // (o que anularia o ganho de latência do streaming) — nos limitamos a checar o status.
            // Regressão aceita: o caso raro de um modelo devolver 200 + stream vazio não cai pro
            // próximo candidato como no modo normal.
            return { ok: res.ok, status: res.status, res };
        }

        const text = await res.text();
        let emptyContent = false;
        if (res.ok) {
            try { emptyContent = !JSON.parse(text)?.choices?.[0]?.message?.content; } catch (e) { /* resposta não era JSON */ }
        }
        return { ok: res.ok && !emptyContent, status: res.status, text, emptyContent };
    } catch (e) {
        clearTimeout(timeoutId);
        return { ok: false, error: e };
    }
}

function isAuthFailure(result) {
    return result.status === 401 || result.status === 403;
}

function isRetryable(result) {
    if (result.error) return true; // timeout/falha de rede — sempre vale tentar o próximo
    if (isAuthFailure(result)) return false; // chave inválida é igual pra todo modelo, não adianta insistir
    if (result.emptyContent) return true;
    return RETRYABLE_STATUSES.includes(result.status);
}

/** Dispara vários modelos em paralelo e resolve assim que o primeiro tiver sucesso, cancelando os
 *  demais. Se nenhum tiver sucesso, resolve com o último resultado (ou o de falha de autenticação,
 *  se houver um — não adianta esperar os outros terminarem nesse caso). */
export async function raceModels(models, opts) {
    const controllers = models.map(() => new AbortController());
    return new Promise((resolve) => {
        let remaining = models.length;
        let resolved = false;
        let lastResult = null;
        models.forEach((model, i) => {
            tryModel(model, opts, controllers[i], opts.timeoutMs).then((r) => {
                const result = { model, ...r };
                remaining--;
                lastResult = result;
                if (resolved) return;
                if (result.ok || isAuthFailure(result)) {
                    resolved = true;
                    controllers.forEach((c, j) => { if (j !== i) c.abort(); });
                    resolve(result);
                } else if (remaining === 0) {
                    resolved = true;
                    resolve(lastResult);
                }
            });
        });
    });
}

/** Corrida dos modelos grátis (RACE_MODELS) seguida, se necessário, da sequência de fallback
 *  (FALLBACK_MODELS) tentada um a um. Para de tentar mais modelos assim que um falhar por
 *  autenticação (chave inválida — mesmo problema em qualquer modelo da lista). */
export async function resolveModel(opts) {
    let result = await raceModels(RACE_MODELS, { ...opts, timeoutMs: RACE_TIMEOUT_MS });
    if (result.ok || isAuthFailure(result)) return result;

    for (const model of FALLBACK_MODELS) {
        const controller = new AbortController();
        result = { model, ...(await tryModel(model, opts, controller, FALLBACK_TIMEOUT_MS)) };
        if (result.ok || isAuthFailure(result)) break;
    }
    return result;
}
