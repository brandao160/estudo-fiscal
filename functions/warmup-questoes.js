/* ==========================================================
   functions/warmup-questoes.js — Cloudflare Pages Function (pré-aquecimento)

   Ideia: o banco compartilhado de questões (ver "handleQuestionBank" em
   questoes-proxy.js) só ajuda quem chega DEPOIS que alguém já gerou questões
   pra um tópico — o primeiro visitante de cada tópico sempre espera a IA na
   hora. Esta rota completa tópicos populares (mais consultados, ainda com
   banco incompleto) SEM depender de um visitante estar esperando, rodando
   em background — assim mais gente encontra o banco já cheio.

   Roda o mesmo fluxo de resolução de modelo do questoes-proxy.js
   (functions/_shared/ai-core.js), só que chamado por um agendamento em vez
   de por um clique do usuário.

   ⚠️ NÃO é chamada pelo site — é uma rota isolada, protegida por um segredo,
   pensada pra ser disparada por um Cron Trigger do Cloudflare Pages.

   COMO CONFIGURAR (depois de já ter feito os passos do topo de
   questoes-proxy.js — este arquivo reusa o mesmo OPENROUTER_API_KEY e
   RATE_LIMIT_KV):
   1. Aba Settings → Environment variables → Production → Add variable:
        - WARMUP_SECRET → qualquer string aleatória longa (ex.: gerada por
          um gerenciador de senhas) → marque "Encrypt". Sem essa variável
          configurada, esta rota se recusa a rodar (fail closed) — evita que
          qualquer visitante descubra a URL e fique gastando sua cota de IA
          de graça só de bater nela repetidamente.
   2. Aba Settings → Functions → Cron Triggers → Add Cron Trigger (recurso do
      Cloudflare Pages; se não aparecer essa opção no seu plano/dashboard, a
      alternativa é usar um serviço externo de "cron HTTP" — ex. cron-job.org
      — apontando pra URL abaixo no horário desejado. NÃO testado ao vivo
      nesta sessão — confira o comportamento após configurar).
        - Aponte para: https://<seu-projeto>.pages.dev/warmup-questoes?secret=<o mesmo WARMUP_SECRET>
        - Frequência sugerida: 1x/dia, num horário de pouco uso do site.
   3. Cada execução processa até WARMUP_TOPIC_LIMIT tópicos (o suficiente pra
      não estourar o limite de duração de uma Cloudflare Pages Function) —
      rode com mais frequência se sua lista de tópicos populares for grande.
   ========================================================== */

import { corsHeaders, resolveModel } from './_shared/ai-core.js';

const WARMUP_TOPIC_LIMIT = 8;   // quantos tópicos processar por execução
const WARMUP_TARGET_COUNT = 30; // não tenta chegar a 100 aqui — só o suficiente pra já "sobrar" cache
const WARMUP_BATCH_SIZE = 10;

export async function onRequestGet(context) {
    const { request, env } = context;
    const cors = corsHeaders(env, request);

    const url = new URL(request.url);
    const secret = request.headers.get('X-Warmup-Secret') || url.searchParams.get('secret');
    if (!env.WARMUP_SECRET || secret !== env.WARMUP_SECRET) {
        // Fail closed: sem WARMUP_SECRET configurado, esta rota nunca roda — mesmo com o segredo
        // certo, não teria como validar. Evita chamadas acidentais/mal-intencionadas gastando cota.
        return new Response(JSON.stringify({ error: 'Não autorizado.' }), {
            status: 401, headers: { ...cors, 'content-type': 'application/json' }
        });
    }
    if (!env.RATE_LIMIT_KV) {
        return new Response(JSON.stringify({ error: 'RATE_LIMIT_KV não configurado — nada a pré-aquecer.' }), {
            status: 200, headers: { ...cors, 'content-type': 'application/json' }
        });
    }
    if (!env.OPENROUTER_API_KEY) {
        return new Response(JSON.stringify({ error: 'OPENROUTER_API_KEY não configurada.' }), {
            status: 200, headers: { ...cors, 'content-type': 'application/json' }
        });
    }

    // Ranking de popularidade: qbankhit:<bankKey> é incrementado a cada bankGet real de visitante
    // (ver questoes-proxy.js) — só vale a pena pré-gerar tópicos que alguém de fato já pediu.
    const hitList = await env.RATE_LIMIT_KV.list({ prefix: 'qbankhit:' });
    const counts = await Promise.all(hitList.keys.map(async (k) => ({
        bankKey: k.name.slice('qbankhit:'.length),
        count: parseInt(await env.RATE_LIMIT_KV.get(k.name), 10) || 0
    })));
    counts.sort((a, b) => b.count - a.count);
    const top = counts.slice(0, WARMUP_TOPIC_LIMIT);

    const results = [];
    for (const { bankKey, count } of top) {
        try {
            results.push(await warmOneTopic(bankKey, count, env));
        } catch (e) {
            results.push({ bankKey, error: e.message });
        }
    }

    return new Response(JSON.stringify({ processados: results.length, results }), {
        status: 200, headers: { ...cors, 'content-type': 'application/json' }
    });
}

async function warmOneTopic(bankKey, hits, env) {
    const raw = await env.RATE_LIMIT_KV.get('qbank:' + bankKey);
    let stored = null;
    try { stored = raw ? JSON.parse(raw) : null; } catch (e) { /* ignora lixo salvo */ }
    const questoes = Array.isArray(stored) ? stored : (Array.isArray(stored?.questoes) ? stored.questoes : []);
    const materia = stored?.materia, topico = stored?.topico;

    if (!materia || !topico) {
        // Bancos salvos antes desta versão não têm materia/topico legíveis salvos — sem eles não
        // dá pra montar um prompt de geração. Vão ganhar esses campos na próxima vez que alguém
        // gerar questões de verdade nesse tópico pelo site (bankSave já manda os dois agora).
        return { bankKey, hits, pulado: 'sem materia/topico salvos (ainda não regravado na versão nova)' };
    }
    if (questoes.length >= WARMUP_TARGET_COUNT) {
        return { bankKey, hits, pulado: `já tem ${questoes.length} questões` };
    }

    const deficit = Math.min(WARMUP_BATCH_SIZE, WARMUP_TARGET_COUNT - questoes.length);
    const existentes = questoes.slice(-15).map(q => q.enunciado);
    const prompt = buildWarmupPrompt(materia, topico, deficit, existentes);
    const maxTokens = Math.min(10000, Math.max(800, Math.round(320 * deficit)));

    const result = await resolveModel({ prompt, maxTokens, stream: false, apiKey: env.OPENROUTER_API_KEY, referer: env.ALLOWED_ORIGIN });
    if (!result.ok) {
        return { bankKey, hits, error: `nenhum modelo respondeu (último status: ${result.status || result.error?.message})` };
    }

    let content;
    try { content = JSON.parse(result.text)?.choices?.[0]?.message?.content; } catch (e) { /* trata como vazio abaixo */ }
    if (!content) return { bankKey, hits, error: 'IA não retornou texto.' };

    const parsed = extractJSON(content);
    const novos = (Array.isArray(parsed?.questoes) ? parsed.questoes : []).filter(isValidQuestion);
    if (!novos.length) return { bankKey, hits, error: 'IA não retornou questões válidas.' };

    const jaTemos = new Set(questoes.map(q => normEnunciado(q.enunciado)));
    const merged = questoes.slice();
    novos.forEach(q => {
        const norm = normEnunciado(q.enunciado);
        if (jaTemos.has(norm)) return;
        jaTemos.add(norm);
        merged.push({
            enunciado: q.enunciado.trim(),
            alternativas: q.alternativas,
            correta: String(q.correta).trim().toUpperCase(),
            comentario: (q.comentario || '').trim(),
            origem: 'gerada',
            fonte: null
        });
    });

    await env.RATE_LIMIT_KV.put('qbank:' + bankKey, JSON.stringify({
        materia, topico, questoes: merged.slice(0, 100), updatedAt: Date.now()
    }));

    return { bankKey, hits, adicionadas: merged.length - questoes.length, total: merged.length };
}

// Mesma regra de prompt/formato de questoes.html (buildQuestionsPrompt), reduzida pro contexto
// server-side — mantém o mesmo shape de JSON esperado pelo cliente.
function buildWarmupPrompt(materia, topico, quantidade, existingEnunciados) {
    const existentes = existingEnunciados.length
        ? existingEnunciados.map((e, i) => `${i + 1}. ${e}`).join('\n')
        : 'nenhuma ainda';
    return `Você é um professor especialista em bancas de concursos públicos brasileiros, com o mesmo padrão de qualidade de questões do tecconcursos.com.br.

Crie ${quantidade} questões INÉDITAS de múltipla escolha (exatamente 5 alternativas, A a E, apenas uma correta) sobre o tópico "${topico}" da matéria "${materia}", no nível de um concurso público brasileiro.

Regras:
- Enunciados claros e no estilo real de bancas examinadoras (afirmações para julgar, "assinale a alternativa correta", estudos de caso curtos, texto de apoio quando fizer sentido) — varie o estilo entre as questões.
- Alternativas erradas devem ser plausíveis (erros conceituais comuns, pegadinhas reais de prova), nunca absurdas ou óbvias.
- Cada questão deve ter um comentário curto e didático explicando por que a alternativa correta está certa.
- Não repita o mesmo subtema/ângulo das questões já existentes listadas abaixo.
- Responda APENAS com um JSON válido, sem nenhum texto antes ou depois, no formato exato abaixo:

{"questoes": [{"enunciado": "string", "alternativas": {"A": "string", "B": "string", "C": "string", "D": "string", "E": "string"}, "correta": "A", "comentario": "string"}]}

Questões já existentes sobre este tópico (não repetir o mesmo conteúdo):
${existentes}`;
}

function normEnunciado(s) {
    return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isValidQuestion(q) {
    if (!q || typeof q.enunciado !== 'string' || !q.enunciado.trim()) return false;
    if (!q.alternativas || typeof q.alternativas !== 'object') return false;
    const letras = ['A', 'B', 'C', 'D', 'E'];
    if (!letras.every(l => typeof q.alternativas[l] === 'string' && q.alternativas[l].trim())) return false;
    return letras.includes(String(q.correta || '').trim().toUpperCase());
}

function extractJSON(text) {
    let cleaned = text.trim();
    const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) cleaned = fenced[1].trim();
    try { return JSON.parse(cleaned); } catch (e) { return null; }
}
