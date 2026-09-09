# Ciclo de Estudo — Sistema de Estudos para Concursos

Aplicação web em HTML/CSS/JS puro (sem build, sem framework) para planejar e acompanhar estudos para concursos. Funciona 100% no navegador — os dados ficam salvos em `localStorage`, sem backend ou banco de dados. Pode ser aberta direto do disco (`file://`) ou hospedada como site estático (PWA instalável, com service worker para uso offline).

Site em produção: [cicloestudo.com.br](https://cicloestudo.com.br) (ver `CNAME`).

## Estrutura do Projeto

O app é multi-página; todas as páginas compartilham o mesmo tema visual (`core.css`) e a mesma lógica de dados (`core.js`), carregado antes do script específico de cada página.

| Arquivo | Página / Responsabilidade |
|---|---|
| `index.html` | Menu inicial: resumo do progresso, atalhos para as demais telas, importação/exportação do modelo (Excel/CSV) e extração de conteúdo de PDF (edital) via `pdf.js`. |
| `planejamento.html` | Planejamento geral: fases do plano de estudo e horas semanais (`estudoFiscalPlanPhases`, `estudoFiscalWeeklyHours`). |
| `materias.html` | Cadastro de matérias e pesos (base para a geração do ciclo). |
| `cicloestudo.html` | Ciclo de Estudo (calendário guiado): gera e exibe o cronograma diário de tarefas. |
| `cicloestudolivre.html` | Ciclo Livre: modo de estudo sem cronograma fixo, seleção manual de matéria/tópico. |
| `resumo.html` | Meus Resumos: editor de resumos e flashcards por matéria/tópico (`ciclo_cards_v3`). |
| `listacompleta.html` | Lista completa de tarefas/tópicos, filtrável por status e matéria. |
| `conteudoprogramatico.html` | Conteúdo programático (syllabus) estruturado por categoria/matéria/tópico. |
| `questoes.html` | Banco de questões: gera questões de múltipla escolha por tópico via IA (automático, sem chave do usuário — ver seção abaixo) e permite resolvê-las, estilo cursinho de questões. |
| `tempoestudo.html` | Estatísticas de tempo de estudo e painel legado de "Calibração do Ciclo" (ver nota abaixo). |
| `historico.html` | Histórico de sessões de estudo (data, matéria, duração, anotações). |
| `core.css` / `core.js` | Estilos e lógica compartilhados: perfis, tema, modelo de dados, geração do ciclo, estatísticas, revisão espaçada. |
| `profile-keys.js` | Lista única das chaves de dados "por perfil" (`PROFILE_DATA_KEYS`), carregada antes de `core.js` em toda página — inclusive `resumo.html`/`planejamento.html`, que não carregam `core.js`. |
| `manifest.json` / `sw.js` / `icon.svg` | PWA — permite instalar o app e funcionar offline (service worker *network-first*, cai para cache quando não há rede). |
| `CNAME` | Domínio customizado para deploy via GitHub Pages. |

> Não existe mais um arquivo único `PainelCicloEstudo2.html` nem servidor/login (`CICLO/CICLO`) — o projeto foi dividido nas páginas acima e é totalmente client-side.

## Como Usar

- Abra `index.html` direto no navegador (duplo clique) ou hospede os arquivos em qualquer servidor estático.
- Cadastre as matérias e pesos em **Matérias**, ajuste **Planejamento** (fases e horas semanais) e gere o cronograma em **Ciclo de Estudo**.
- Em **Planejamento → Contagem regressiva**, defina diretamente o **início e o fim do ciclo** (`inicioCiclo`/`fimCiclo` no modelo) pelos campos de data — não depende mais de importar planilha/PDF para isso; dá pra ajustar a qualquer momento.
- Em **Planejamento → Distribuição por matéria**, cada matéria tem um campo **Tipo** (Básica/Específica) editável — útil quando a extração por IA classifica errado ou não reconhece — e o nome da matéria também é editável direto na tabela (renomear migra o nome em cronograma, histórico, resumos e banco de questões já salvos, pra não deixar nada órfão). Abaixo da tabela, o formulário **"Adicionar Matéria"** cobre o caso da IA não ter encontrado alguma matéria do edital: cadastra manualmente nome, tipo e peso, e já cria a seção correspondente vazia em Conteúdo Programático.
- Em **Conteúdo Programático**, cada matéria tem um campo **"Adicionar tópico"** no fim da lista, pra completar tópicos que a IA não tiver identificado na extração do edital.
- Use **Ciclo Livre** para estudar fora do cronograma quando quiser.
- Gere e resolva questões de múltipla escolha por tópico em **Questões** — automático, sem precisar de chave própria (limitado a algumas gerações por dia por visitante).
- Registre resumos/flashcards em **Meus Resumos**, acompanhe tudo em **Lista Completa**, **Conteúdo Programático**, **Tempo de Estudo** e **Histórico**.
- Clique em **Salvar** (cabeçalho) para baixar uma cópia HTML autocontida com todos os seus dados embutidos — útil como backup ou para continuar em outro computador.

### Perfis (múltiplos usuários no mesmo navegador)

O app suporta múltiplos perfis no mesmo navegador (`estudoFiscalProfiles` / `estudoFiscalActiveProfile`). O perfil "Principal" usa as chaves de dados originais (sem sufixo); perfis extras usam as mesmas chaves com sufixo `__<id>`, então dados antigos continuam acessíveis sem migração.

## Como Funciona a Geração do Ciclo

A geração de cronograma (`generateSchedule`, em `core.js`) usa hoje o método **"Ciclo Mestre"**: a frequência de cada matéria é definida exclusivamente pelo **peso** (1 a 3) cadastrado em Matérias — peso maior gera mais blocos de estudo dessa matéria no ciclo, distribuídos evitando repetição excessiva no mesmo dia.

> O painel "Calibração do Ciclo" (em `tempoestudo.html`, parâmetros `beta`/`weightBias`/`dispersion`/`minCoverage`/`avoidConsecutive`/`minRep`/`maxRep`) é **legado**: os controles ficam desabilitados e servem apenas de preview informativo — a lógica de apportionment ponderado que eles descreviam não é mais usada. A regra atual é simples: quantidade de blocos = peso da matéria.

## Importação/Exportação de Modelo

- `index.html` permite baixar/exportar/importar o modelo (matérias, pesos, tópicos). Quando a biblioteca `xlsx.js` (carregada via CDN) está disponível, o formato é Excel; sem ela (ex.: offline sem cache do CDN), cai automaticamente para CSV.
- Também é possível extrair o conteúdo programático diretamente de um PDF de edital ("Importar Edital PDF"), automaticamente com IA — sem chave própria, usando o mesmo proxy do site que gera as questões (ver seção "Proxy de geração" abaixo). A extração usa `pdf.js` para ler o texto do PDF. Não há mais um modo "sem IA": o parser heurístico local foi removido em favor de só usar a IA, que dá resultado melhor (o heurístico exigia formatação "arrumada" no PDF e não distinguia cargos).
- **PDF escaneado (sem texto)**: se o texto extraído do PDF for muito curto (menos de 1.500 caracteres sem contar espaços), a importação para antes de chamar a IA e avisa que o PDF provavelmente é uma imagem/escaneamento sem OCR — `pdf.js` só lê texto já embutido no arquivo, não faz reconhecimento de imagem.
- **Truncamento inteligente do texto** (`truncateEditalText`, `EDITAL_AI_MAX_CHARS` = 120.000 caracteres): editais reais costumam ter dezenas de páginas de regras de inscrição/recursos ANTES do anexo com o conteúdo programático — cortar simplesmente os primeiros 120.000 caracteres (comportamento antigo) frequentemente cortava exatamente a parte que interessa, e a IA relatava "PDF muito extenso" sem achar matéria nenhuma mesmo quando o conteúdo existia, só que fora da janela enviada. Duas etapas, na ordem:
  1. **Busca por palavra-chave** (`SYLLABUS_MARKER_RE`, `findSyllabusAnchorByKeyword`): procura por várias expressões usadas por diferentes bancas pra essa seção — "conteúdo programático", "objeto(s) de avaliação" (Cebraspe — testado com um edital real da PM Alagoas, que nunca usa "conteúdo programático"), "componentes curriculares", "disciplinas e conteúdos programáticos", "conhecimentos exigidos". Menções na primeira metade do documento são tratadas como referências procedurais (comuns em regras de inscrição) e ignoradas; a primeira ocorrência real na segunda metade do documento marca onde a janela de caracteres começa (pega a primeira, não a última, porque editais com vários cargos costumam repetir a expressão uma vez por cargo dentro do próprio anexo — pegar a última pularia direto pro cargo final, perdendo os básicos e os cargos anteriores).
  2. **Varredura por IA** (`locateSyllabusViaAI`), só quando nenhuma palavra-chave bate: em vez de mandar o edital inteiro pra IA achar a posição (caro, ainda estoura contexto), o texto é dividido em pedaços de 15.000 caracteres e a IA responde SIM/NÃO pra cada um ("este pedaço já é o conteúdo de estudo?") — pergunta semântica, funciona pra qualquer nome de seção que a lista de palavras-chave não previu, inclusive nomenclatura nunca vista antes. Escaneia de trás pra frente (o anexo real quase sempre fica perto do fim) e para no primeiro "SIM", pra gastar o mínimo de chamadas possível (cada uma conta na cota diária por visitante do proxy). Teto de 20 pedaços por edital. Se mesmo assim não achar nada, cai de volta no comportamento antigo (primeiros N caracteres) com aviso claro de que o resultado é menos confiável.
- **Lista de referência de matérias no prompt** (`MATERIA_REFERENCE_HINT` em `index.html`): a IA recebe, junto do texto do edital, uma lista de nomes usuais de matérias organizadas por área de concurso (básicos comuns, fiscal/tributário/auditoria — SEFAZ e Receita Federal —, policial, judiciário, legislativo, conhecimentos regionais/estaduais) como âncora de reconhecimento — não é uma lista fechada nem obrigatória, serve pra normalizar nomes quando o edital usa abreviação/sigla/grafia diferente (ex.: "RLM" → "Raciocínio Lógico-Matemático") e pra reduzir os casos em que a IA simplesmente não reconhecia uma matéria conhecida por causa de texto malformatado pela extração do PDF. O prompt reforça explicitamente para (a) não desistir de achar matérias só porque o texto veio bagunçado, (b) extrair TODAS as matérias do edital mesmo as que não estão na lista de referência (a lista é só apoio de nomenclatura, não um filtro) — importante pra matérias específicas do estado/município do concurso (geografia, história, realidade local), fáceis de pular por não serem "genéricas".
- **Editais com mais de um cargo**: antes de extrair o conteúdo, a IA primeiro verifica se o edital cobre mais de um cargo/emprego com matérias específicas diferentes (`buildCargoDetectionPrompt`). Se detectar mais de um, mostra uma lista pra escolher qual cargo você vai prestar (`#edital-cargo-select`) e só então extrai. O prompt de extração agora distingue dois formatos comuns: editais com um único bloco de "conhecimentos básicos" comum a todos os cargos, e editais onde os básicos também são separados por cargo (ex.: "Conhecimentos Básicos para o cargo de Oficial" vs "...para o cargo de Soldado", visto no edital real de teste da PM Alagoas) — nesse segundo caso, extrai só o bloco de básicos do cargo escolhido, não misturando com o de outro. Se detectar só um cargo (ou não conseguir decidir), extrai direto sem perguntar nada. Cada uma dessas etapas (detecção de cargo, varredura por IA quando necessária, extração) consome uma chamada de IA própria por importação.
- O modelo resultante (`estudoFiscalModel`) é a mesma chave lida por todas as páginas do app — qualquer forma de importação (planilha, CSV ou PDF) fica visível automaticamente em Planejamento, Matérias, Ciclo de Estudo, Ciclo Livre, Resumos, Lista Completa, Conteúdo Programático e Questões, sem precisar repetir a importação em cada aba.

## Banco de Questões (`questoes.html`)

- Para cada tópico do conteúdo programático, gera questões de múltipla escolha (5 alternativas, A a E, com comentário explicativo) automaticamente — **sem o usuário precisar de chave de API nenhuma**. A chamada vai para um proxy próprio do site (`functions/questoes-proxy.js`, ver seção abaixo), que fala com a OpenRouter usando uma chave paga configurada só pelo administrador do site.
- Geração **sob demanda, por tópico**: cada tópico aceita até 100 questões. O botão "Gerar +N" mostra quantas faltam e some quando o tópico chega a 100/100.
- **Geração em pedaços paralelos com streaming** (`QZ_CHUNK_SIZE = 10` em `questoes.html`): um lote de até 20 questões pedido numa única chamada demorava muito (resposta grande = geração lenta, sem nenhum retorno visual até tudo terminar). Agora o lote é dividido em pedaços de até 10 questões, pedidos **em paralelo** ao proxy, cada um em modo streaming (`stream: true`) — o texto vai sendo montado e mostrado (contagem de caracteres recebidos) conforme chega, em vez de um spinner parado. Pedaços paralelos não veem as questões um do outro enquanto geram, então ocasionalmente podem coincidir num mesmo subtema — aceito como custo pelo ganho de velocidade; a deduplicação por enunciado exato continua pegando repetições.
- Resolução estilo cursinho de questões: escolhe uma alternativa, vê o gabarito e o comentário na hora, e navega para a próxima. Prioriza questões ainda não respondidas.
- O desempenho de cada sessão (acertos/total, por matéria) é gravado em `estudoFiscalStudyHistory` — as mesmas estatísticas de "% de acerto em questões" usadas em Matérias e nas prioridades de Planejamento passam a refletir também o que foi resolvido aqui.
- O resultado de cada "Gerar questões" (sucesso ou erro, incluindo o aviso de limite diário atingido) aparece de forma persistente logo abaixo dos botões do Banco de Questões — não só num toast que some sozinho.
- Como o modelo grátis usado (via OpenRouter) não tem ferramenta de busca embutida, as questões são sempre inéditas geradas pela IA — não há tentativa de buscar questões reais de provas aplicadas.
- **Banco compartilhado entre visitantes**: antes de chamar a IA, "Gerar +N" primeiro consulta se alguém (qualquer visitante do site) já gerou questões pra aquele mesmo tópico (chave = matéria+tópico normalizados) — as que esse usuário ainda não tem localmente são reaproveitadas na hora, sem gastar cota de IA nem contar no limite diário. Só o que faltar pra completar o lote é gerado de novo; ao final, o tópico inteiro (velhas + novas) é regravado no banco compartilhado pra quem pedir depois já achar tudo pronto. Guardado no mesmo KV do rate-limit (`RATE_LIMIT_KV`, prefixo `qbank:`, ver `handleQuestionBank` em `functions/questoes-proxy.js`) — sem esse KV vinculado, essa etapa é pulada silenciosamente e cai direto na IA, como antes. O status abaixo dos botões mostra quantas foram reaproveitadas vs. geradas na hora. Cada consulta ao banco também incrementa um contador de popularidade por tópico (`qbankhit:<chave>`) e o `bankSave` agora grava também o nome legível da matéria/tópico (não só a chave normalizada) — os dois usados pelo pré-aquecimento abaixo.
- **Pré-aquecimento em background** (`functions/warmup-questoes.js`, opcional): o banco compartilhado só ajuda quem chega *depois* de alguém já ter gerado questões pra um tópico — o primeiro visitante de cada tópico sempre espera a IA. Esta rota completa (até 30 questões) os tópicos mais populares (pelo contador acima) que ainda estão com o banco raso, rodando sozinha via agendamento, não a partir de um clique de usuário. Protegida por uma variável de ambiente `WARMUP_SECRET` (fail-closed: sem ela configurada, a rota se recusa a rodar) — precisa de um Cron Trigger do Cloudflare Pages (ou um cron HTTP externo) apontando pra `/warmup-questoes?secret=<WARMUP_SECRET>` configurado manualmente no dashboard; instruções completas nos comentários do topo do arquivo.

### Proxy de geração (`functions/questoes-proxy.js` + `functions/_shared/ai-core.js`)

- É uma **Cloudflare Pages Function** genérica ("prompt" entra, texto da IA sai): um arquivo em `/functions` na raiz do repositório vira uma rota automaticamente assim que o projeto está conectado ao Cloudflare Pages (deploy automático a cada push) — não precisa criar um Worker separado. Usada por **duas** telas: gerar questões (`questoes.html`) e extrair o edital em PDF (`index.html`, aba "Com IA"). A lógica de escolha/corrida entre modelos foi extraída para `functions/_shared/ai-core.js` (o prefixo `_` faz o Cloudflare Pages não tratar a pasta como rota — é só um módulo comum, importado também por `functions/warmup-questoes.js`).
- Guarda a chave paga da OpenRouter como variável de ambiente **secreta** (Settings → Variables and secrets → `OPENROUTER_API_KEY`, tipo Secret) — nunca é enviada ao navegador de quem visita o site.
- Limita quantas chamadas por dia cada visitante (por IP) pode fazer (`DAILY_LIMIT_PER_IP` no topo do arquivo), usando um KV namespace opcional (`RATE_LIMIT_KV`) — divide a cota total da conta (ex.: 1.000 req/dia com $10 de crédito na OpenRouter) entre todo mundo, em vez de deixar uma pessoa só esgotar tudo.
- O cliente pode pedir mais tokens de saída (`max_tokens` no corpo da requisição — extração de edital pede mais do que um lote de questões), com um teto de 8000 no proxy pra ninguém pedir uma resposta absurdamente cara.
- **Streaming opcional** (`stream: true` no corpo da requisição, usado por `questoes.html`): em vez de esperar a resposta inteira se formar no proxy pra só então devolver, o corpo (SSE) da OpenRouter é repassado direto pro cliente conforme chega. Limitação aceita nesse modo: não dá pra checar "conteúdo vazio" (ver `reasoning` abaixo) sem consumir o stream inteiro, então esse retry específico não se aplica — só falhas de status/timeout antes do stream começar acionam o próximo modelo.
- A URL do proxy fica fixa em código — `QZ_PROXY_URL` em `questoes.html` e `EDITAL_PROXY_URL` em `index.html` — ajuste as duas se o domínio/projeto do Cloudflare mudar.
- **`reasoning: { effort: 'none' }`** em toda chamada à OpenRouter: sem isso, um modelo com raciocínio embutido (alguns dos grátis têm isso, inclusive pode ser escolhido pelo roteador automático `openrouter/free`) gasta o `max_tokens` inteiro "pensando" em silêncio e devolve conteúdo vazio — sintoma: demora grande seguida de "A IA não retornou texto na resposta", tanto em Questões quanto na importação de Edital (as duas passam por aqui). Modelos que não suportam desligar o raciocínio simplesmente ignoram esse campo, sem risco. `max_tokens` máximo também subiu de 8000 para 10000 (mais margem pra edital grande).
- **Corrida em paralelo + fallback sequencial** (`RACE_MODELS`/`FALLBACK_MODELS` em `functions/_shared/ai-core.js`): a estratégia antiga tentava um modelo, esperava até 8s de timeout, só então tentava o próximo — se o primeiro estivesse lento, o usuário pagava esse tempo inteiro antes de qualquer alternativa entrar em ação. Agora:
  1. **`openrouter/free`** e **`google/gemma-4-31b-it:free`** (ambos grátis) são chamados **ao mesmo tempo**; o que responder primeiro com sucesso é usado, o outro é cancelado. Timeout por tentativa: 6s (`RACE_TIMEOUT_MS`) — não é aditivo, é o pior caso da dupla, não a soma.
  2. Se os dois falharem, cai numa sequência de fallback tentada um de cada vez, timeout de 5s cada (`FALLBACK_TIMEOUT_MS`, reduzido dos 8s antigos): **`upstage/solar-pro4`** (pago, ínfimo — ~$0,03 de entrada + $0,12 de saída por *milhão* de tokens, sem "reasoning") **primeiro**, de propósito — antes era o 3º da lista, então o usuário só chegava nele depois de já ter esperado dois timeouts de modelo grátis; agora é a próxima tentativa assim que a corrida gratuita falha. Depois dele, mais três modelos grátis como último recurso: `nvidia/nemotron-3-super-120b-a12b:free`, `thinkingmachines/inkling-small:free`, `google/gemma-4-26b-a4b-it:free`.
  3. Uma falha de **autenticação** (401/403 — chave inválida) interrompe a busca por outro modelo imediatamente em qualquer etapa: o problema é o mesmo em qualquer modelo da lista, não adianta insistir.
  - **Cuidado com "reasoning"**: já testamos modelos pagos "de ponta" (GPT-6 Astra, Qwen3.8 Max, Claude Fable 5.1) e voltamos atrás — o GPT-6 Astra sozinho consumiu ~$0,83 numa única chamada, porque é um modelo com "reasoning": cobra um monte de tokens invisíveis de "raciocínio" como se fossem saída, então o preço por token anunciado não reflete o custo real. Ao trocar qualquer modelo dessa lista no futuro, confira que ele NÃO tem reasoning antes de usar (a menos que seja de propósito e você aceite o risco de custo).
  - A OpenRouter muda os modelos disponíveis (grátis e preços) com frequência — se algum da lista parar de funcionar ou sumir, atualize conferindo openrouter.ai/models.
- **JSON malformado (comum em modelos menores/grátis)**: ao gerar um lote de várias questões, às vezes uma única questão no meio do lote sai com sintaxe JSON quebrada (aspas não escapadas etc.), o que travava o lote inteiro. `qzExtractJSON`/`salvageQuestoesArray` em `questoes.html` agora tentam o parse estrito primeiro e, se falhar, varrem o array manualmente extraindo cada questão individualmente — descartando só o item malformado, não o lote inteiro.
- Modelos grátis costumam ter um contexto bem menor que Gemini/Claude tinham — por isso `EDITAL_AI_MAX_CHARS` em `index.html` (120.000 caracteres) corta o texto do edital antes de mandar pra IA, pra não estourar o contexto com editais grandes cheios de regras de inscrição irrelevantes ao conteúdo programático. É uma margem generosa o bastante pra ainda cobrir o conteúdo de cargos citados mais pra frente no texto (ver "Editais com mais de um cargo" acima) — se um edital muito extenso ainda assim cortar antes do cargo desejado, o aviso "PDF muito extenso" aparece na importação.
- **Importante, e é de propósito estar assim**: essa chave nunca poderia ficar só no HTML/JS do site — qualquer texto enviado ao navegador é visível a qualquer visitante (DevTools, "ver código-fonte", bots que varrem repositórios públicos atrás de chave vazada) — "ofuscar" não resolve isso. Um servidor guardando a chave como variável de ambiente secreta é a única forma de mantê-la privada com vários usuários compartilhando o mesmo app. Instruções completas de configuração nos comentários do topo do arquivo.
- **Integração com a sessão de estudo ativa**: durante uma sessão em `cicloestudo.html`/`cicloestudolivre.html`, o botão **"Questões IA"** na barra de cronômetro pausa o timer e abre `questoes.html?materia=<matéria>` já resolvendo questões dessa matéria (ou com o acordeão dela aberto no Banco, se ainda não houver questões geradas). Cada questão respondida ali é somada em `estudoFiscalActiveSession` (campos `quizQuestions`/`quizCorrect`); ao voltar e clicar em "Salvar" o estudo, os campos **Questões Feitas** e **Acertos** já vêm preenchidos com o que foi resolvido de verdade (ainda editáveis à mão). Isso evita duplicar o mesmo desempenho no histórico: enquanto a sessão de estudo daquela matéria estiver ativa, `questoes.html` não cria um lançamento próprio para ela — só matérias sem sessão ativa no momento geram um histórico imediato.

## Persistência (localStorage)

Chaves principais (por perfil, com sufixo `__<id>` quando não é o perfil "Principal"):

- `estudoFiscalModel`: modelo atual (datas, matérias, pesos, `slotsPorDia`).
- `estudoFiscalScheduleStructure`: cronograma de dias e tarefas gerado.
- `estudoFiscalData`: status por tarefa (nota, tempo, meta, concluído).
- `estudoFiscalStudyHistory`: histórico de sessões de estudo.
- `estudoFiscalSyllabus`: conteúdo programático estruturado.
- `estudoFiscalReviews`: fila de revisão espaçada.
- `estudoFiscalPlanPhases` / `estudoFiscalWeeklyHours`: dados de planejamento geral.
- `estudoFiscalRolloverMissed` / `estudoFiscalRolloverLastRun`: controle de tarefas não cumpridas transferidas entre dias.
- `estudoFiscalActiveSession`: sessão de estudo (Pomodoro) em andamento — inclui `quizQuestions`/`quizCorrect`, acumulados a partir de `questoes.html` enquanto a sessão está ativa.
- `ciclo_cards_v3`: resumos/flashcards.
- `estudoFiscalQuestoes`: banco de questões geradas por IA, por matéria/tópico (ver `questoes.html`).
- `estudoFiscalProfiles` / `estudoFiscalActiveProfile`: registro e perfil ativo (não é namespaceada por perfil).
- `theme`, `estudoFiscalTutorialSeen`, `estudoFiscalOnboardingSeen`, `estudoFiscalConcursoName`: preferências de UI, globais (sem sufixo de perfil).

## Fluxo de Salvar e Carregar

- **Salvar** (`saveSelfContainedHTML`, no cabeçalho de `index.html`): baixa uma cópia HTML do site com todos os dados de todos os perfis embutidos.
- Reabrir esse arquivo salvo restaura cronograma, status, histórico, syllabus, resumos e modelo exatamente de onde parou.
- **Regerar Cronograma**: apaga as marcações do calendário e gera um novo cronograma; histórico, syllabus e resumos são preservados.

## PWA e Compatibilidade

- Funciona totalmente offline via `file://` ou como PWA instalável (manifest + service worker).
- `sw.js` usa estratégia *network-first*: sempre tenta buscar a versão mais recente na rede e só usa o cache quando offline. CDNs (fontes, ícones, `xlsx.js`, `pdf.js`) e eventuais rotas `/api/*` de um servidor local de desenvolvimento não são interceptadas pelo service worker.
- Sem dependência de servidor, banco de dados ou login para uso normal.

## FAQ

- **"Perco meu progresso ao fechar o navegador?"**
  Não, os dados ficam em `localStorage`. Para ter um backup portátil, use o botão **Salvar** no cabeçalho e guarde o HTML baixado.
- **"Consigo importar meu modelo de matérias?"**
  Sim, pelo menu inicial (`index.html`), em Excel (se a lib `xlsx.js` carregar) ou CSV.
- **"Como recomeço o ciclo com novas matérias/pesos?"**
  Ajuste os pesos em Matérias e use "Regerar Cronograma" em Ciclo de Estudo.
- **"Posso usar para mais de uma pessoa no mesmo computador?"**
  Sim, use o seletor de perfis no cabeçalho para criar e alternar entre perfis independentes.
