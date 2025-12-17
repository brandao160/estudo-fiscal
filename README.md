# Sistema de Estudos — PainelCicloEstudo2

Projeto em HTML/CSS/JS focado em planejamento e acompanhamento de estudos para concursos. Ele oferece calendário inteligente, controle de sessões com cronômetro, registro de histórico, desempenho por matérias e persistência de dados sem servidor via arquivo auto-contido.

## Visão Geral
- Interface única em `PainelCicloEstudo2.html` com sidebar, calendário, abas de progresso, histórico e Pomodoro.
- Dados salvos no navegador (`localStorage`) e exportáveis para um arquivo HTML que embute seu progresso.
- Importação/Exportação de modelo (matérias, conteúdos e parâmetros) via Excel.
- Cronômetro de estudo com barra fixa e atalhos de teclado.

## Como Usar
- Windows: abra o arquivo `PainelCicloEstudo2.html` com duplo clique (modo offline) ou hospede em um servidor local.
- Login: no modo arquivo (`file://`) o login é oculto automaticamente. Em servidor, use `CICLO / CICLO`.
- Gere o ciclo e navegue pelo calendário para ver tarefas/matérias por dia.

## Botões da Sidebar
- `Ciclo Gerado Sucesso`
  - Indicador de status. Fica verde quando o cronograma foi gerado ou reidratado com sucesso.

- `Pomodoro`
  - Abre o widget Pomodoro (25/5/15). Você pode minimizar, iniciar/pausar e acompanhar o tempo.

- `Baixar Modelo Excel`
  - Baixa um arquivo Excel com a estrutura de modelo (matérias, pesos, tickets, tópicos) para edição.
  - Use para construir/ajustar seu conteúdo programático fora do sistema.

- `Exportar Modelo Atual (Excel)`
  - Exporta o modelo que está carregado no painel (inclui matérias e tópicos) para Excel.
  - Útil para compartilhar ou versionar seu modelo atual.

- `Importar Modelo Excel`
  - Importa um arquivo Excel com duas abas: `Gerais` e `Conteudo` (ou um CSV compatível).
  - Após importar, o sistema aplica o modelo e gera/regenera o cronograma.

- `Salvar Progresso`
  - Gera e baixa um arquivo `PainelCicloEstudo2_Salvo.html` com seus dados embutidos.
  - Abra esse arquivo depois para continuar exatamente de onde parou (modo offline sem servidor).

- `Carregar Progresso`
  - Abre um seletor de arquivo para importar um HTML salvo (auto-contido) ou um JSON de backup.
  - Restaura `cronograma`, `status`, `histórico`, `syllabus` e `modelo` na interface.

- `Regerar Cronograma`
  - Apaga o progresso visual do calendário e cria um novo cronograma com base no modelo atual.
  - O histórico e o syllabus são preservados. Use com atenção para não perder marcas do calendário.

## Fluxo de Salvar e Carregar
- Salvar: clique em `Salvar Progresso` para baixar um HTML com seus dados.
- Carregar: clique em `Carregar Progresso` e selecione o HTML salvo ou um JSON válido.
- No modo arquivo, o login é oculto e seus dados são restaurados automaticamente ao abrir um HTML salvo.

## Cronômetro de Estudo
- Barra fixa no rodapé mostra:
  - Matéria atual, tempo total, meta formatada e barra de progresso (%).
  - Botões: `Pausar/Continuar`, `Salvar` (abre anotações), `Cancelar`.
- Atalhos de teclado:
  - Espaço: Pausar/Continuar
  - Enter: Salvar
  - Esc: Cancelar

## Estrutura de Dados (localStorage)
- `estudoFiscalModel`: modelo atual (datas do ciclo, matérias, syllabus, `slotsPorDia`).
- `estudoFiscalScheduleStructure`: cronograma de dias e tarefas.
- `estudoFiscalData`: status por tarefa (nota, tempo gasto, meta, concluído).
- `estudoFiscalStudyHistory`: histórico de sessões (data, matéria, duração, anotações, questões/acertos).
- `estudoFiscalSyllabus`: conteúdo programático estruturado por categoria e matéria.

## Excel (Formato do Modelo)
- Aba `Gerais`: informações do concurso (concurso, órgão, início/fim do ciclo, horas por dia da semana).
- Aba `Conteudo`: `Categoria`, `Materia`, `Peso`, `Tickets`, `Qtde PDF`, `Qtde Paginas`, `Topico`.
- Datas: use `dd/mm/aaaa` ou `aaaa-mm-dd`. O sistema trata em horário local para evitar deslocamento de fuso.

## Modelo Excel — Campos em Detalhe
- Aba `Gerais`
  - `Concurso`: nome do concurso. Exibido no topo do painel.
  - `Orgao`: órgão responsável. Apenas informativo, também aparece nas exportações.
  - `InicioCiclo`: data de início do ciclo. Aceita `dd/mm/aaaa` ou `aaaa-mm-dd` e é convertida para data local (ver conversão em `PainelCicloEstudo2.html:1986–1994`).
  - `FimCiclo`: data de término do ciclo. Mesma regra de `InicioCiclo` (interpretada em horário local).
  - `Seg` `Ter` `Qua` `Qui` `Sex` `Sab` `Dom`: horas planejadas por dia da semana. Use números inteiros (recomendado entre 0 e 12). Essas horas definem quantas tarefas/matérias serão alocadas por dia e compõem os “slots” semanais do ciclo (ver uso em `PainelCicloEstudo2.html:2078` e geração do cronograma em `PainelCicloEstudo2.html:2115–2183`).

- Aba `Conteudo`
  - `Categoria`: classificação da matéria. Valores comuns: `Basico/Básico` ou `Especifico/Específico`. O sistema normaliza para `Conhecimentos Básicos` e `Conhecimentos Específicos`. Se você passar outro texto (ex.: “Financeiro”), ele vira `Conhecimentos Financeiro` (normalização em `PainelCicloEstudo2.html:4071–4079`).
  - `Materia`: nome da matéria (ex.: “Língua Portuguesa”, “Auditoria”).
  - `Peso`: prioridade da matéria, de `1` a `3`. O peso é usado para decidir a frequência de repetição dessa matéria na semana (curva aplicada na geração em `PainelCicloEstudo2.html:2082–2095`; limites 1–3 garantidos em `PainelCicloEstudo2.html:4173–4179`).
  - `Tickets`: quantidade de “tickets” ou itens de estudo associados à matéria. Se estiver em branco, o sistema usa o `Peso` como base (fallback em `PainelCicloEstudo2.html:4179–4181`). É útil para calibrar a granularidade ou a quantidade de blocos de estudo esperados para a matéria nas exportações.
  - `Qtde PDF`: quantidade de PDFs/material por matéria. Informativo nas exportações; atualmente não influencia diretamente o cálculo, mas é útil para gestão de acervo (campo exportado em `PainelCicloEstudo2.html:4181–4183`).
  - `Qtde Paginas`: quantidade total de páginas. Esse campo é considerado na geração do cronograma para ajustar a frequência de repetição baseada no volume de conteúdo (fator de páginas em `PainelCicloEstudo2.html:2087–2092`).
  - `Topico`: tópico específico da matéria. Cada linha com `Topico` preenche o `syllabus` (conteúdo programático) daquela matéria (construção do mapa de tópicos em `PainelCicloEstudo2.html:4182–4186` e agrupamento final em `PainelCicloEstudo2.html:4190–4196`). Se não houver `Topico`, a linha cria apenas o cadastro da matéria/categoria.

### Dicas de Preenchimento
- Em `Gerais`, coloque o total de horas por dia segundo sua realidade; o sistema distribuirá as matérias conforme `Peso`, `Qtde Paginas` e parâmetros de calibração.
- Em `Conteudo`, crie uma linha base por matéria (sem `Topico`) e, abaixo, adicione quantas linhas de `Topico` forem necessárias para detalhar o conteúdo.
- Use `Peso` como 1, 2 ou 3. Se `Tickets` ficar em branco, o sistema assume o `Peso`.
- Use datas no padrão brasileiro `dd/mm/aaaa` quando editar manualmente no Excel; o sistema também aceita `aaaa-mm-dd`.
- Após importar, clique em `Gerar Ciclo de Estudo` se o cronograma ainda não estiver marcado como gerado/sucesso.

### Observações de Importação
- A importação aceita:
  - Excel com abas `Gerais` e `Conteudo` (preferencial).
  - Planilhas simples/CSV compatíveis, via rotina alternativa (`buildModelFromCSV` em `PainelCicloEstudo2.html:4090–4127`).
- A leitura das abas e montagem do modelo seguem `PainelCicloEstudo2.html:4153–4198`. Depois o modelo é aplicado e o cronograma gerado em `PainelCicloEstudo2.html:4203–4222`.

## Dicas de Compatibilidade
- Abrir como `file://` funciona totalmente offline. Sem servidor, sem banco.
- Se preferir sincronização/backup em servidor, é possível acoplar as rotas `/api/save_bulk` e `/api/load_all`.
- Quando usar servidor, o login é exibido e pode ser exigido.

## Perguntas Frequentes
- “Perco meu progresso ao fechar o navegador?”
  - Use `Salvar Progresso` para baixar um HTML auto-contido com tudo dentro. Depois, abra esse arquivo para continuar.
- “Consigo importar meu modelo do Excel?”
  - Sim. Use `Importar Modelo Excel`. Se o arquivo tiver as abas `Gerais` e `Conteudo`, a importação é automática.
- “Como recomeço o ciclo?”
  - Clique em `Regerar Cronograma`. Isso zera as marcações do calendário, mas não apaga histórico e syllabus.
