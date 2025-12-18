# Sistema de Estudos — Cronograma Inteligente

Projeto em HTML/CSS/JS focado em planejamento e acompanhamento de estudos para concursos. Funciona 100% offline (sem servidor), com calendário, distribuição inteligente por pesos, painel de calibração, Pomodoro, histórico e exportação/importação de modelo e progresso.

## Visão Geral
- Arquivo único: abra `PainelCicloEstudo2.html` diretamente no Windows (duplo clique) ou sirva em um servidor local.
- Dados persistidos no navegador (`localStorage`) e exportáveis para um HTML auto-contido via “Salvar Progresso”.
- Calendário com tarefas por dia, lista filtrável e visão por matérias.
- Controle de sessão de estudo com cronômetro e atalhos.
- Importação/Exportação do modelo (matérias, pesos, tópicos) via Excel.
- Painel de calibração para ajustar finamente a distribuição semanal e diária.

## Como Funciona o Cronograma
O sistema gera um cronograma semanal que respeita capacidade, pesos e dispersão, e seleciona diariamente as matérias com base em cotas e uma função de prioridade.

- Capacidade semanal (`weeklySlots`): soma dos `slotsPorDia` (horas ou blocos por dia).
- Número de matérias (`N`): quantidade de matérias no modelo.
- Cota-alvo semanal por matéria (apportionment ponderado):
  - `target_i = weeklySlots * (N * (peso_i^beta)) / Σ(N * (peso_j^beta))`
  - Conversão para inteiros via “Maior Resto” mantendo a soma total ≤ `weeklySlots`.
- Cobertura mínima semanal:
  - Se `weeklySlots >= N` e `minCoverage` estiver ativado, cada matéria recebe pelo menos 1 ocorrência por semana.
- Limites:
  - `minRep` e `maxRep` aplicados por matéria após normalização.
- Seleção diária (evita repetição no mesmo dia e privilegia espaçamento):
  - Para cada slot do dia, escolhe-se a matéria com maior `score` entre as elegíveis:
  - `score = restante + dispersion * gap - penalize + weightBias * (peso - 1)`
    - `restante`: cotas ainda disponíveis na semana para a matéria
    - `gap`: dias desde a última vez que a matéria foi alocada na semana
    - `penalize`: pequena penalização se `avoidConsecutive` estiver ativo e o `gap` for 1
    - `weightBias`: viés diário para reforçar pesos maiores
- Peso 3 reforçado:
  - Pelo `beta` nas cotas semanais e pelo `weightBias` na escolha diária.
  - Opcionalmente o primeiro slot do dia tenta alocar peso 3 quando houver cota disponível.

Referência no código:
- Função `generateSchedule`: `c:\python\CicloEstudo\PainelCicloEstudo2.html:2180`

## Calibração do Ciclo
O painel “Calibração do Ciclo” permite ajustar como o cronograma é gerado. Todos os parâmetros afetam o modelo e têm preview.

- `beta` (curva de peso): >1 amplifica matérias de maior peso; <1 suaviza diferenças.
- `weightBias` (viés diário de peso): reforça a prioridade de matérias de maior peso na escolha diária.
- `dispersion` (dispersão semanal): valor de 0 a 1; aumenta preferência por espaçar ocorrências ao longo da semana.
- `minRep` / `maxRep`: limites mínimo/máximo de ocorrências por matéria na semana.
- `normalizeWeekly`: normaliza cotas para caber na capacidade semanal.
- `minCoverage`: tenta garantir ao menos 1 ocorrência por matéria por semana quando houver capacidade.
- `avoidConsecutive`: evita alocar a mesma matéria em dias consecutivos quando existirem alternativas.
- `Preview`: mostra a distribuição semanal calculada antes de gerar.

Referências no código:
- Inicialização do painel: `c:\python\CicloEstudo\PainelCicloEstudo2.html:3643`
- Salvamento dos parâmetros: `c:\python\CicloEstudo\PainelCicloEstudo2.html:3676`
- Preview da distribuição: `c:\python\CicloEstudo\PainelCicloEstudo2.html:3694`

### Dicas de Configuração
- Priorização forte ao peso 3:
  - `beta`: 1.3
  - `weightBias`: 1.0
  - `dispersion`: 0.6
  - `minCoverage`: ligado
  - `avoidConsecutive`: ligado
  - `normalizeWeekly`: ligado
  - `minRep`: 1, `maxRep`: 8 (ajuste conforme sua semana)

## Como Usar
- Windows: abra `PainelCicloEstudo2.html` (modo offline) ou hospede em servidor local.
- Login: em `file://` o login é oculto; em servidor use `CICLO / CICLO`.
- Gere o ciclo e navegue pelo calendário para ver tarefas por dia. Use filtros por status/matéria.
- Se ajustar calibração, clique em “Aplicar” e depois “Gerar Ciclo de Estudo”.
- Use “Limpar” para descartar um cronograma salvo e gerar outro com as novas regras.

## Importação/Exportação de Modelo (Excel)
- Botões na sidebar:
  - `Baixar Modelo Excel`: baixa estrutura base para edição.
  - `Exportar Modelo Atual (Excel)`: exporta o modelo atualmente carregado.
  - `Importar Modelo Excel`: importa um arquivo Excel com abas `Gerais` e `Conteudo`.
- Aba `Gerais`:
  - `Concurso`, `Órgão`, `InicioCiclo`, `FimCiclo`, `Seg`…`Dom` (slots diários).
- Aba `Conteudo`:
  - `Categoria`, `Materia`, `Peso` (1–3), `Tickets`, `Qtde PDF`, `Qtde Paginas`, `Topico`.
  - `Peso` guia a frequência; `Qtde Paginas` é informativo (gestão de acervo).
  - `Topico` preenche o conteúdo programático (syllabus).

## Persistência (localStorage)
- `estudoFiscalModel`: modelo atual (datas, matérias, syllabus, `slotsPorDia`).
- `estudoFiscalScheduleStructure`: cronograma de dias e tarefas.
- `estudoFiscalData`: status por tarefa (nota, tempo, meta, concluído).
- `estudoFiscalStudyHistory`: histórico de sessões (data, matéria, duração, anotações).
- `estudoFiscalSyllabus`: conteúdo programático estruturado por categoria/matéria.

## Pomodoro e Atalhos
- Barra fixa de sessão com:
  - Matéria atual, tempo total, meta formatada e barra de progresso.
  - Botões: `Pausar/Continuar`, `Salvar` (abre anotações), `Cancelar`.
- Atalhos:
  - Espaço: Pausar/Continuar
  - Enter: Salvar
  - Esc: Cancelar

## Fluxo de Salvar e Carregar
- `Salvar Progresso`: baixa `PainelCicloEstudo2_Salvo.html` com seus dados embutidos.
- `Carregar Progresso`: reidrata cronograma, status, histórico, syllabus e modelo.
- `Regerar Cronograma`: zera marcações do calendário e gera novo cronograma; histórico e syllabus são preservados.

## Compatibilidade
- Funciona totalmente offline via `file://` (Windows, sem servidor e sem banco).
- Pode opcionalmente sincronizar com rotas `/api/save_bulk` e `/api/load_all` se você hospedar.

## FAQ
- “Perco meu progresso ao fechar?”
  - Use `Salvar Progresso` e depois abra o HTML salvo para continuar exatamente de onde parou.
- “Consigo importar meu modelo do Excel?”
  - Sim. Estruture com `Gerais` e `Conteudo` e importe pelo painel.
- “Como recomeço o ciclo com novas regras?”
  - Clique em `Limpar` e depois `Gerar Ciclo de Estudo` após ajustar a calibração.
