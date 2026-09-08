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
| `questoes.html` | Banco de questões: gera questões de múltipla escolha por tópico via IA (Gemini/Claude, com a chave do próprio usuário) e permite resolvê-las, estilo cursinho de questões. |
| `tempoestudo.html` | Estatísticas de tempo de estudo e painel legado de "Calibração do Ciclo" (ver nota abaixo). |
| `historico.html` | Histórico de sessões de estudo (data, matéria, duração, anotações). |
| `core.css` / `core.js` | Estilos e lógica compartilhados: perfis, tema, modelo de dados, geração do ciclo, estatísticas, revisão espaçada. |
| `manifest.json` / `sw.js` / `icon.svg` | PWA — permite instalar o app e funcionar offline (service worker *network-first*, cai para cache quando não há rede). |
| `CNAME` | Domínio customizado para deploy via GitHub Pages. |

> Não existe mais um arquivo único `PainelCicloEstudo2.html` nem servidor/login (`CICLO/CICLO`) — o projeto foi dividido nas páginas acima e é totalmente client-side.

## Como Usar

- Abra `index.html` direto no navegador (duplo clique) ou hospede os arquivos em qualquer servidor estático.
- Cadastre as matérias e pesos em **Matérias**, ajuste **Planejamento** (fases e horas semanais) e gere o cronograma em **Ciclo de Estudo**.
- Use **Ciclo Livre** para estudar fora do cronograma quando quiser.
- Registre resumos/flashcards em **Meus Resumos**, acompanhe tudo em **Lista Completa**, **Conteúdo Programático**, **Tempo de Estudo** e **Histórico**.
- Clique em **Salvar** (cabeçalho) para baixar uma cópia HTML autocontida com todos os seus dados embutidos — útil como backup ou para continuar em outro computador.

### Perfis (múltiplos usuários no mesmo navegador)

O app suporta múltiplos perfis no mesmo navegador (`estudoFiscalProfiles` / `estudoFiscalActiveProfile`). O perfil "Principal" usa as chaves de dados originais (sem sufixo); perfis extras usam as mesmas chaves com sufixo `__<id>`, então dados antigos continuam acessíveis sem migração.

## Como Funciona a Geração do Ciclo

A geração de cronograma (`generateSchedule`, em `core.js`) usa hoje o método **"Ciclo Mestre"**: a frequência de cada matéria é definida exclusivamente pelo **peso** (1 a 3) cadastrado em Matérias — peso maior gera mais blocos de estudo dessa matéria no ciclo, distribuídos evitando repetição excessiva no mesmo dia.

> O painel "Calibração do Ciclo" (em `tempoestudo.html`, parâmetros `beta`/`weightBias`/`dispersion`/`minCoverage`/`avoidConsecutive`/`minRep`/`maxRep`) é **legado**: os controles ficam desabilitados e servem apenas de preview informativo — a lógica de apportionment ponderado que eles descreviam não é mais usada. A regra atual é simples: quantidade de blocos = peso da matéria.

## Importação/Exportação de Modelo

- `index.html` permite baixar/exportar/importar o modelo (matérias, pesos, tópicos). Quando a biblioteca `xlsx.js` (carregada via CDN) está disponível, o formato é Excel; sem ela (ex.: offline sem cache do CDN), cai automaticamente para CSV.
- Também é possível extrair o conteúdo programático diretamente de um PDF de edital ("Importar Edital PDF"), em três modos: **Sem IA** (heurística local, grátis, roda 100% no navegador), **Gemini** (grátis, com chave de API do usuário) e **Claude** (pago, com chave de API do usuário). A extração usa `pdf.js` para ler o texto do PDF.
- O modelo resultante (`estudoFiscalModel`) é a mesma chave lida por todas as páginas do app — qualquer forma de importação (planilha, CSV ou PDF) fica visível automaticamente em Planejamento, Matérias, Ciclo de Estudo, Ciclo Livre, Resumos, Lista Completa, Conteúdo Programático e Questões, sem precisar repetir a importação em cada aba.

## Banco de Questões (`questoes.html`)

- Para cada tópico do conteúdo programático, gera questões inéditas de múltipla escolha (5 alternativas, A a E, com comentário explicativo) usando a IA escolhida pelo usuário — **Gemini** (grátis) ou **Claude** (pago) — com a própria chave de API dele. Não há modo "sem IA" aqui: gerar distratores plausíveis e comentários exige um modelo de linguagem.
- Geração **sob demanda, por tópico**: cada tópico aceita até 100 questões, geradas em lotes de até 20 por chamada (limite de tokens de resposta da API não permite gerar 100 de uma vez). O botão "Gerar +N" mostra quantas faltam e some quando o tópico chega a 100/100.
- Resolução estilo cursinho de questões: escolhe uma alternativa, vê o gabarito e o comentário na hora, e navega para a próxima. Prioriza questões ainda não respondidas.
- O desempenho de cada sessão (acertos/total, por matéria) é gravado em `estudoFiscalStudyHistory` — as mesmas estatísticas de "% de acerto em questões" usadas em Matérias e nas prioridades de Planejamento passam a refletir também o que foi resolvido aqui.
- As chaves de API e o modo (Gemini/Claude) são compartilhados com o modal "Importar Edital PDF" do Menu Inicial (`estudoFiscalGeminiKey` / `estudoFiscalAnthropicKey`, namespaced por perfil) — configurar uma vez vale para os dois lugares.

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
- `estudoFiscalActiveSession`: sessão de estudo (Pomodoro) em andamento.
- `ciclo_cards_v3`: resumos/flashcards.
- `estudoFiscalQuestoes`: banco de questões geradas por IA, por matéria/tópico (ver `questoes.html`).
- `estudoFiscalGeminiKey` / `estudoFiscalAnthropicKey`: chaves de API do usuário (Gemini/Claude), usadas tanto na importação de edital em PDF quanto na geração de questões.
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
