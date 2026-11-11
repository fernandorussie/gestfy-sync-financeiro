# Módulo Fechamentos — motor de indicadores e conferência

Braço financeiro do GestfySync: fechamentos mensais e quinzenais das clínicas, lidos direto das planilhas de origem.
Esta etapa entrega o **cálculo** e a **conferência**, sem telas. As telas seguem o protótipo aprovado em 06/11/2026.

## Como funciona

```
planilhas da clínica ──coletar──▶ registros ──conferir──▶ alertas ──decisões──▶ ajustes
                                     │                                             │
                                     └──────────────calcularIndicadores◀───────────┘
```

| Arquivo | O que faz |
|---|---|
| `lib/fechamentos/texto.ts` | Lê data (dd/mm/aaaa, ISO, número de série), valor (`400`, `R$ 1.234,56`, `(10,00)`), sim/não; normaliza nomes; trata `#N/A` como vazio |
| `lib/fechamentos/colunas.ts` | Encontra as colunas pelo **nome do cabeçalho**, com sinônimos. O mapa da clínica pode indicar a coluna pelo nome ou pela letra |
| `lib/fechamentos/leitores.ts` | Um leitor por fonte: vendas, despesas, orçamentos, leads, NPS, avaliações Google. Acha o cabeçalho sozinho nas 5 primeiras linhas e gera avisos de linhas ilegíveis |
| `lib/fechamentos/plano-contas.ts` | Plano de contas padrão Gestfy (10 grupos de despesa e categorias) e pistas para achar despesas no grupo errado |
| `lib/fechamentos/indicadores.ts` | Motor: faturamento, despesas por grupo e categoria, resultado de caixa, pacientes, tickets, funil, orçamentos, NPS, Google, meta; resumo anual em caixa e competência |
| `lib/fechamentos/conferencia.ts` | Regras de conferência (abaixo) |
| `lib/fechamentos/coleta.ts` | Busca as planilhas configuradas (Service Account, só leitura) e passa pelos leitores |
| `lib/google/sheets.ts` | Nova função `readSheetValues`: números crus e datas como texto. A função antiga do report semanal não mudou |

Nada aqui grava em banco nem guarda linhas de pacientes. O cálculo recebe registros e devolve totais.

## Mapa da clínica

Cada clínica tem um mapa com as planilhas e, quando necessário, colunas indicadas manualmente. Exemplo da Claros:

```ts
const fontes: FontesFechamento = {
  vendas:     { sheetId: "…", aba: "Base", colunas: { unidade: "R" } }, // coluna de unidade sem cabeçalho
  despesas:   { sheetId: "…", aba: "Base" },
  orcamentos: { sheetId: "…", aba: "Base" },
  leads:      { sheetId: "…", aba: "Sistema" },
  nps:        { sheetId: "…", aba: "Base" },
};
```

Regras opcionais por clínica (`RegrasClinica`): categoria de despesa → grupo além do padrão, categoria de venda → grupo de receita, quais status de lead contam como agendamento e quais status de orçamento contam como fechado, em aberto ou não fechou.

## Definições dos indicadores

| Indicador | Definição |
|---|---|
| Faturamento (entradas) | Soma do valor pago das vendas com data de atendimento no período |
| Despesas (saídas) | Soma das despesas com data de pagamento no período (regime de caixa) |
| Resultado de caixa | Faturamento − despesas |
| Pacientes atendidos | Pacientes distintos nas vendas do período, incluindo retornos de R$ 0 |
| Ticket médio | Faturamento ÷ pacientes atendidos |
| Pacientes novos | Pacientes distintos com "1ª vez na clínica" = Sim |
| Ticket médio dos novos | Faturamento das vendas de pacientes novos ÷ pacientes novos |
| Receita por grupo | Coluna de grupo (ex.: Categoria_Ajustada) ou regra da clínica; quantidade = lançamentos; ticket = valor ÷ quantidade |
| Despesas por grupo e categoria | Categoria (prefere Ajuste_Categoria) → grupo pelo plano de contas, na ordem do plano |
| Leads / agendados / conversão | Leads com data no período; agendado = status "Agendou" (configurável) |
| Orçamentos | Linhas com prescrição = Sim; fechado = status com "Protocolo"; em aberto = Em negociação ou Agendado; "Não fechou" fica separado |
| NPS | % promotores (9–10) − % detratores (0–6), arredondado |
| Competência | Despesa pelo mês de competência (sem competência, vale o mês do pagamento); receita pela data de atendimento |

Nomes com grafias diferentes (Bangu, BANGU, BANgu) são somados juntos e aparecem com a grafia mais frequente.

## Regras da conferência

| Regra | Gravidade | Exemplo na Claros (out/26) |
|---|---|---|
| `despesa-grupo-errado` (pessoal) | grave | Rescisão e férias em Desp. Adm. Diversas |
| `despesa-grupo-errado` (marketing) | atenção | Tráfego pago e editor de vídeo fora de Marketing |
| `despesa-sem-grupo` | grave | Categoria fora do plano de contas |
| `metas-diferentes` | grave | R$ 188.000 e R$ 150.000 |
| `fonte-vazia` | grave (vendas, despesas) / info | Pré-consulta sem respostas |
| `pagamentos-pontuais` | atenção | IRPJ, CSLL, rescisão e FGTS da rescisão: R$ 47.738,07 |
| `nomes-parecidos` | atenção | "Dra. Ana" e "Dra. Ana Clara" |
| `vendas-incompletas` | atenção | 2 vendas sem unidade, 4 sem meio de pagamento |
| `linhas-ilegiveis` | atenção | Data ou valor que não dá para ler |
| `leads-sem-origem` | atenção | 33 de 100 leads |
| `novos-sem-informacao` | atenção | Coluna "1ª vez" vazia (caso Pappalardo) |
| `grafias-unidas`, `vendas-sem-valor`, `grupo-sem-valor` | info | Bangu/BANGU, 111 lançamentos sem valor, T-Sculptor |

Decisões viram `Ajustes` (`reclassificarDespesa`, `unificar`). Ao recalcular, o alerta resolvido some. Cada alerta tem uma `chave` estável para o app guardar decisões como "manter assim". Graves bloqueiam a análise (`podeSeguirParaAnalise`).

## Diferenças em relação à planilha-mãe (de propósito)

- Faturamento igual em todos os relatórios (o Quinzenal da planilha deixava de fora "Consulta Endocrinologia": R$ 116.750 × R$ 117.650).
- Sem limite de linhas (a planilha contava pacientes só até a linha 240).
- Totais somam tudo; categoria desconhecida vira alerta em vez de sumir do total.
- "Em aberto" não inclui "Não fechou".
- Leads lidos de uma fonte só, configurada no mapa (a planilha alternava entre CRM novo e antigo).

## Testes

`npm test` roda tudo. Os testes do módulo usam `lib/fechamentos/__tests__/fixtures/claros-2026-10.json`: dados de outubro/2026 da Claros extraídos da planilha-mãe e **anonimizados** (pacientes, leads, equipe e profissionais com pseudônimos; CPF, endereço, e-mail, observações e comentários removidos). Os testes conferem os números com os do relatório mensal da planilha.

## Telas e banco (etapa 3)

| Caminho | O que faz |
|---|---|
| `/fechamentos` | Abre um fechamento (clínica, mensal ou quinzenal, mês), lista os fechamentos e as clínicas com planilhas configuradas |
| `/fechamentos/configurar/[clinicaId]` | Link e aba de cada planilha, **Testar leitura** (linhas lidas e coluna encontrada para cada campo) e indicação manual de coluna |
| `/fechamentos/[id]` | Conferência (alertas, decisões, desfazer) e Indicadores (liberados quando não há alerta grave pendente). Meta ajustada e "Ler de novo" no topo |

- Tabelas novas: `fechamento_config` (planilhas e regras por clínica) e `fechamentos` (período, status, versão, meta ajustada, decisões e o último cálculo, só totais). Migração `supabase/migrations/004_fechamentos.sql`; para o banco de testes, `supabase/etapa-3-fechamentos.sql` (inclui o cadastro da Claros).
- `lib/fechamentos/decisoes.ts`: o fechamento guarda só o registro das decisões; ajustes, meta escolhida e o que ainda bloqueia são derivados dele. Grupo escolhido para categoria fora do plano vai também para as regras da clínica.
- `lib/fechamentos/servidor.ts`: lê as planilhas (cache de 10 minutos em memória por clínica; "Ler de novo" ignora o cache), aplica decisões, confere, calcula o período e o anterior, e grava só os totais.
- A ação de decidir procura o alerta pelo identificador no último cálculo salvo; a tela não consegue mandar uma sugestão própria.
- `/fechamentos` entrou na lista de rotas protegidas pela senha do app (`proxy.ts`).

## Próximos passos

1. Validar com as planilhas reais da Claros: outubro, setembro e agosto contra a planilha-mãe.
2. Análise (contexto do mês, texto com IA, plano de ação) e entrega (texto do WhatsApp e PDF), seguindo o protótipo.
3. Congelar o fechamento ao concluir, versões, histórico e quinzenal.

## Etapa 4 — Análise, plano de ação e entrega (sem IA)

Fluxo da tela do fechamento: **1. Conferência → 2. Indicadores → 3. Análise → 4. Entrega**.

- **Análise**: contexto do período, andamento das ações do fechamento anterior, texto em 4 seções
  (observação, destaques, indicadores comerciais, pontos de atenção) e plano de ação com
  responsáveis (vários por ação), prazo e "como saber se funcionou". Salva sozinho 1,2 s após
  cada alteração. "Gerar rascunho" monta o texto a partir dos números (`lib/fechamentos/texto-fechamento.ts`),
  sem IA; pagamentos pontuais só entram se o consultor escolheu citar na conferência.
- **Entrega**: texto do WhatsApp pronto para copiar, PDF (`/fechamentos-pdf/[id]`, páginas A4,
  botão "Salvar PDF" usa a impressão do navegador) e **Concluir**.
- **Concluir** congela números, texto e plano (`fechamentos.snapshot`): o fechamento concluído
  não relê as planilhas. **Reabrir** cria a versão seguinte e mantém a anterior no histórico.
- Banco: `supabase/migrations/006_analise_entrega.sql`.

PDF, nesta ordem: resultado do período (8 indicadores, faturamento no ano, comparativo) ·
funil comercial e experiência do paciente · receitas detalhadas · despesas por grupo e categoria ·
resultado anual em caixa e competência · análise e plano de ação.

## Etapa 4b — relatório quinzenal e ajustes do mensal (06/11)

- **Quinzenal = parcial do dia 1 ao 15** (o fim do mês fica com o mensal). Variações contra o mesmo
  período (1 a 15) do mês anterior. Relatório próprio, em laranja (mensal = roxo).
- **Ritmo do mês** (`lib/fechamentos/ritmo.ts`): dias úteis = segunda a sexta sem os feriados do
  GestfySync; faturamento por dia útil; projeção do mês; quanto falta para a meta e quanto é preciso
  por dia útil restante.
- **Despesas a pagar:** muitas clínicas só lançam despesas pagas, então o parâmetro é a **média das
  despesas pagas nos 3 meses anteriores** (só meses com lançamento). Provisionado a pagar = média − já
  pago. Saldo projetado = projeção − max(média, já pago).
- **Categorias zeradas:** receitas e despesas mantêm, com zero, toda categoria que teve lançamento nos
  últimos 12 meses (`catalogoDesde`). Receitas em ordem alfabética ("Outros" no fim).

## Etapa 5 — histórico por clínica (06/11)

`/fechamentos/clinica/[clinicaId]` (lógica em `lib/fechamentos/historico.ts`):
- **Evolução mês a mês**: gráfico de faturamento com a meta (últimos 12 meses) e tabela com faturamento,
  despesas, resultado, % da meta, pacientes, ticket, novos, conversão de leads e de orçamentos e NPS,
  com variação contra o mês anterior. Usa a versão mais nova de cada mensal; concluído = retrato
  congelado, em andamento = último cálculo (marcado como "em andamento").
- **Todos os fechamentos**: um item por período, com status, valores, PDF e versões anteriores.
- **Último plano de ação** do fechamento concluído mais recente.

## Etapa v2.1 — análise com o Claude, sem integração (06/11)

Os projetos do claude.ai não podem ser lidos por API, então o app leva o fechamento até o projeto
do cliente e lê a resposta de volta (proposta: https://claude.ai/artifact/79NGWVAuQJS36CE9XoPann).

- **Ficha da clínica** (`lib/fechamentos/ficha.ts`, `fechamento_config.ficha`, migração 007): cidade,
  UF, segmento, especialidades, modelo de negócio (estruturados, preparam o benchmarking), perfil,
  prioridades, pessoas, como escrever, o que evitar. "Copiar pedido para o Claude" gera um pedido para
  o próprio projeto do cliente escrever a ficha; "Colar ficha gerada" preenche os campos.
- **Pacote** (`lib/fechamentos/pacote-ia.ts`, `montarPacote`): instruções no estilo Gestfy + formato
  de resposta marcado + ficha + números do período e do anterior (sem comparação quando o anterior
  não tem dados) + ritmo do quinzenal + receitas, profissionais, despesas, pontuais citados, funis,
  NPS, evolução do ano, ações anteriores, contexto do consultor e texto já escrito. Só agregados: sem
  pacientes e sem descrições de lançamentos. Opção de trocar nomes dos profissionais por apelidos.
- **Resposta** (`lerResposta`): separa Observação, Destaques, Comercial, Atenção e Plano de ação
  (títulos com ###, ##, ** ou "TÍTULO:", com ou sem acento); plano numerado com Responsável, Prazo,
  Ação e Como medir. Sem títulos, tudo vai para a Observação com aviso.
- Tela: card "Análise com o Claude" no topo da aba Análise (copiar, colar, revisar, aplicar;
  substituir ou adicionar ao plano).

## Etapa v2.1b — gerar com o Claude dentro do app (06/11)

- `lib/fechamentos/claude-api.ts`: chamada à API da Anthropic (Messages), só no servidor. Liga com
  `ANTHROPIC_API_KEY` na Vercel; modelo em `ANTHROPIC_MODEL` (padrão `claude-sonnet-5-5`). Dados da
  API não são usados para treino por padrão (termos comerciais).
- Ação `gerarComClaude`: monta o pacote com `destino: "api"` (contexto = ficha + ações anteriores,
  sem citar "projeto") e devolve o texto; a tela lê seções e plano para revisar e aplicar, e mostra o
  custo aproximado.
- Fluxo: 1. Gerar com o Claude (app) → 2. Copiar para o projeto do cliente (o pacote leva o texto e o
  plano já rascunhados para refinar) → 3. Colar resposta.

## Etapa v2.2 — relatório em seções e editor de estrutura (06/11)

- `lib/fechamentos/estrutura.ts`: catálogo de seções (resultado, gráfico, ritmo, caixa do mês, funil de
  leads, funil de orçamentos, experiência, receitas, despesas, caixa e competência, análise), com tipo
  (mensal/quinzenal), nível de detalhe e quais são **fixas** (padrão mínimo Gestfy: resultado,
  receitas, despesas no mensal; resultado, ritmo e receitas no quinzenal). `normalizarEstrutura` junta
  o que foi salvo com o catálogo; `paginar` agrupa: seções grandes abrem página, pequenas seguem juntas.
- Banco: `fechamento_config.relatorio` (migração 008). Sem configuração = padrão (relatório idêntico ao
  anterior). Ao concluir, a estrutura vai no retrato congelado.
- PDF: `relatorio-estruturado.tsx` monta as páginas a partir da estrutura; seções em `relatorio.tsx`
  (mensal) e `relatorio-quinzenal.tsx`. Os dois funis ficam lado a lado quando estão em sequência.
  Página de análise segue a estrutura; o link da barra liga/tira só naquela visualização.
- Tela: card "Estrutura do relatório" em Configurar (abas Mensal/Quinzenal, subir/descer, mostrar,
  nível, mapa das páginas, voltar ao padrão).
- WhatsApp: "Caixa do mês" desligado tira a linha do valor a pagar no quinzenal.

## Etapa v2.3 — fontes personalizadas (06/11)

- `lib/fechamentos/fonte-personalizada.ts`: planilha com uma linha por acontecimento. Campos:
  Data (obrigatório), Valor, Categoria, Status, Profissional, Quantidade — achados pelo nome do
  cabeçalho ou indicados (nome ou letra). Só as colunas indicadas são lidas. Medidas: quantidade
  (soma da coluna Quantidade ou nº de linhas), valor total, valor médio; quebras por categoria,
  status ou profissional; filtro "contar só quando" (sem diferenciar maiúsculas/acentos);
  comparação com o período anterior (mesmo critério do relatório). Tipo "comparável" para o
  benchmarking futuro.
- Banco: `fechamento_config.fontes_extras` (migração 009). Números no retrato congelado
  (`personalizadas`). Leitura com cache de 10 min, como as fontes padrão.
- Conferência: alerta de atenção quando a planilha não é lida ou tem linhas com data ilegível.
- Onde aparece: bloco na aba Indicadores; seção `fonte:<id>` no editor de estrutura (antes da
  análise; níveis "só os totais" / "com quebras"); seção no PDF; dados no pacote do Claude.
- Tela: card "Fontes personalizadas" em Configurar (adicionar, testar leitura com amostra das últimas
  5 linhas e valores de status/categoria para montar o filtro, remover).

## Etapa v3 — fontes flexíveis, linguagem neutra, painel e comparativos (07/11)

Sequência aprovada (etapas 0 a 6), sem refazer o que já funcionava. As fontes do Report Semanal (`fontes_dados`) continuam separadas, por decisão do usuário.

- **0. Banco e histórico.** `lib/fechamentos/banco.ts` testa uma coluna de cada migração e mostra o aviso `AvisoBanco` (Fechamentos, histórico, configuração) com os arquivos a rodar. O histórico do cliente lê sem as colunas da 006 em vez de quebrar (`column fechamentos.snapshot does not exist`).
- **1. Configuração em abas** (`?aba=fontes|estrutura|perfil`), as três montadas para não perder edição. Fontes padrão e personalizadas numa lista só (`fontes-dados.tsx`), cards recolhidos com selo Padrão/Personalizada e status (configurada, conectada, com erro, pendente), "Testar todas" e um botão "Salvar fontes".
- **2. Linguagem neutra.** `lib/fechamentos/vocabulario.ts`: padrão neutro (cliente, profissional, serviço, área de atuação, "Olá, pessoal!") e presets por tipo de negócio (clínica médica, odontologia, estética, shopping/varejo, serviços), ajustáveis no Perfil do cliente. Vale para tela, PDF, rascunho, WhatsApp e pacote do Claude. "Ficha da clínica" virou **Perfil do cliente** (coluna `ficha` mantida). O texto não cita mais o nome do cliente na saudação.
- **3. Construtor de indicadores** (`fonte-personalizada.ts`): fonte = planilha + aba + coluna de data; indicadores por seleção — contar, contar distintos, somar, média, mínimo, máximo, % das linhas que atendem uma condição; filtros (igual — vírgula = "ou", diferente, contém, maior, menor, vazia, preenchida); agrupar por; fórmulas de 2 ou 3 termos (÷ × + − "% de") com indicadores desta fonte, de outras fontes (`fonte.indicador`) ou padrão (`padrao:faturamento`…), avaliadas da esquerda para a direita, sem código do usuário. Formato (número, R$, %, dias) e "se subir é bom/ruim/neutro". Colunas de **dado pessoal** só servem para contar distintos e nunca saem na prévia, no PDF ou no pacote. Prévia (`previaFonte`) calcula no mês escolhido x anterior, com amostra sem dados pessoais. Fontes antigas são convertidas sozinhas (`converterAntiga`, colunas "~campo" = busca automática como antes) e resultados congelados antigos são lidos por `adaptarResultado`.
- **4. Indicadores nas seções.** Cada indicador escolhe onde aparece: seção da própria fonte, dentro de uma seção padrão (resultado, ritmo, caixa do mês, funis, experiência, receitas, despesas) como complemento compacto, ou numa **seção personalizada** criada no editor de estrutura (`relatorio.secoes`). Seção desligada no tipo de relatório: o indicador vai para o resultado. O retrato guarda `secoes`.
- **5. Painel do mês** (`/fechamentos?mes=AAAA-MM`): todos os clientes ativos do cadastro do GestfySync, situação (pronto, fontes pendentes, não configurado), quinzenal e mensal com etapa, versão, faturamento e resultado, e botão para abrir. **Histórico geral** (`/fechamentos/historico`) com filtros por cliente, tipo, situação e ano. Na tela do fechamento, "Tudo salvo às hh:mm".
- **6. Comparativos** (`/fechamentos/clinica/[id]/comparativos`): série de qualquer indicador (padrão ou personalizado, 6 ou 12 meses) com média, maior, menor e último x média; caixa x competência do ano. **Base para benchmarking**: migração `010_metricas_fechamento.sql` (tabela `fechamento_metricas`, uma linha por indicador de cada fechamento concluído, com `comparavel`), gravada ao concluir e completada ao abrir os comparativos. Perfil do cliente ganhou porte (ou cálculo pelo faturamento). Benchmark em si ainda não existe: deve mostrar só médias de grupos com 5 ou mais clientes.

Testes: 212 passando (novo `v3.test.ts`; `fonte-personalizada.test.ts` reescrito, inclusive conferindo que a fonte antiga dá os mesmos números).

## Etapa v3.1 — navegação e organização das telas (07/11)

Sem mudança em coleta, cálculos, fontes, relatórios ou banco.

- **Menu lateral:** cabeçalho com o símbolo G e "Gestfy Sync". Grupo recolhível **Relatórios Financeiros** com Fechamentos do mês (`/fechamentos`), Histórico (`/fechamentos/historico`), Comparativos (`/fechamentos/comparativos`) e Clientes e configurações (`/fechamentos/clientes`). Abre sozinho dentro do módulo; fora dele, lembra se foi recolhido.
- **Fechamentos do mês:** quatro cards calculados com os dados do mês escolhido (clientes com fechamento no período = clientes prontos; concluídos ou enviados; em andamento; próximo quinzenal = dia 16). Sem botão Configurar por linha: cada fechamento mostra "Continuar" ou "Revisar", e a pendência de configuração é um atalho para as fontes do cliente.
- **Clientes e configurações:** lista os clientes do cadastro do GestfySync com situação, fontes padrão e personalizadas, perfil e estrutura. Cada linha abre a configuração em abas. Corrigida a barra de rolagem vertical sobre as abas (a barra tinha `overflow-x-auto` com abas em `-mb-px`).
- **Histórico:** sem formulário de novo fechamento. Filtros por cliente, competência, ano, tipo, situação e versões anteriores; cada linha abre o fechamento inteiro ou direto em Conferência, Indicadores, Análise, Texto (`?etapa=`) e o PDF. `/fechamentos/clinica/[id]` redireciona para o Histórico filtrado. Removidos `historico-view.tsx` e `novo-fechamento.tsx` (criação fica só no painel).
- **Comparativos:** página própria com seleção de cliente; caixa x competência para despesas, resultado e margem (competência vem do resumo anual do último mensal concluído). `/fechamentos/clinica/[id]/comparativos` redireciona.
- Conferido localmente com um banco falso (dados fictícios + fixture da Claros): painel, clientes, configuração (abas sem rolagem, cards recolhidos, atalho de pendência), histórico com versões, comparativos com troca de regime, as 4 etapas de um fechamento e o menu recolhendo e expandindo.

## Etapa v3.3 — faturamento, entradas, saídas e resultado separados (09/11)

Regras no motor do GestfySync (não dependem das fórmulas das planilhas-mestre).

- **Despesas = só as pagas.** Linha com data de pagamento mas "Pago? Não" / "Em aberto" fica fora das saídas, do caixa, da competência e da média do quinzenal. Alerta de atenção "despesa marcada como não paga" com quantidade e valor. A coluna de situação aceita Sim/Não, Quitado, Em aberto, Pago, Pendente etc. (`lerSituacao`).
- **Entradas de caixa:** nova fonte padrão opcional (link, aba, teste, mapeamento de colunas): data do recebimento, valor recebido, situação, categoria, forma, competência, descrição. Lê exportações de sistema (Núcleo VIV: "Data do último pagamento", "Valor total recebido da parcela", "Situação") e planilhas manuais (Gustavo Gurgel: "Data Receb.", "Vl. Receb. R$", "Status Recebido"). Linhas sem valor (saldo em branco) são ignoradas; "em aberto" fica fora.
- **Grupos de entrada** (`lib/fechamentos/entradas.ts`): operacional, não operacional (rendimentos, reembolsos, juros) e fora do resultado (transferência, empréstimo, aporte, saldo, resgate). Sugestão pelo nome; o consultor confirma na conferência (alerta grave "categorias de entrada para classificar") e a escolha fica em `fechamento_config.regras.categoriasEntrada`. Outros alertas: entradas em aberto, sem situação, possíveis duplicidades (mesma data, valor e descrição).
- **Resultado:** com Entradas = **Resultado de caixa** (entradas operacionais + não operacionais − despesas pagas; `caixa.real = true`). Sem Entradas = **Faturamento x Despesas** (faturamento − despesas pagas), nunca chamado de caixa. `rotuloResultado()` decide o nome em tela, PDF, WhatsApp, rascunho e pacote do Claude.
- **Caixa x competência** (`regimesAnuais`, `TabelaRegimes`): Faturamento · Entradas (se houver) · Despesas pagas · Resultado de caixa ou Faturamento x Despesas · Despesas por competência · Resultado por competência (faturamento − despesas do mês de competência). `LinhaAnual.entradas` continua sendo o faturamento (compatível com fechamentos congelados); `recebido` é o novo campo.
- Indicadores: com Entradas, a 1ª linha é Faturamento · Entradas · Despesas pagas · Resultado de caixa; seção "Entradas de caixa por categoria"; gráfico com a linha de entradas. PDF mensal igual.
- Métricas: `resultado`/`margem` passam a ser sempre faturamento − despesas (comparáveis entre clientes); novas `entradas` e `resultadoCaixa` (só com a fonte).
- Fechamentos concluídos antes desta versão não mudam (números congelados); aparecem como "Faturamento x Despesas".

Testes: 223 passando (novo `entradas.test.ts`).

## Etapa v3.4 — relatório: Etapa A da proposta de 10/11

Proposta: https://claude.ai/artifact/VX4PFTySS4vwibarPoRuJb. Decisões (10/11): rotatividade fica para depois; cancelados fora da conversão; mínimo Gestfy = Resultado, Receitas e Despesas detalhadas; ordem A → B → C; o Claude recebe todos os indicadores disponíveis; a personalização é por cliente.

- **Objeções separadas.** Orçamentos ganhou o campo opcional "Motivo / objeção do orçamento" (`porObjecao`). O PDF de orçamentos mostra só esses motivos ("Motivos de não fechamento"); as objeções dos leads aparecem no funil de leads como "Motivos de não agendamento". O pacote do Claude rotula cada um.
- **Cancelados** (status que contém "cancelad", regra `statusCancelado`) contam à parte e saem do denominador das duas conversões (quantidade e valor).
- **Funis no PDF (nível completo):** leads com serviço mais buscado, origem, canal de entrada (novo `porCanal`) e motivos de não agendamento; orçamentos por valor e por quantidade (gerados, fechados, em aberto, não fecharam, cancelados), por status e motivos.
- **Experiência:** um card por informação que a fonte tiver (NPS, profissional, recepção, infraestrutura, enfermagem, Google).
- **Novas seções no editor:** "Entradas detalhadas" (só grupos / grupos e categorias / com fora do resultado; ligada no padrão, impressa só com a fonte de Entradas) e "Faturamento por profissional, unidade e pagamento" (desligada no padrão).
- Leitura: Orçamentos reconhece "Status"; Leads reconhece "Onde conheceu?" (origem) e "Queixa" (serviço buscado).
- Pacote do Claude: canal, notas por área do NPS, status e motivos de orçamento, conversão por quantidade, faturamento por unidade e meio de pagamento, entradas por categoria.

Testes: 227 passando (novo `etapa-a.test.ts`).

## Etapa v3.5 — catálogo único de blocos e editor por blocos (Etapa B, 11/11)

- **`lib/fechamentos/blocos.ts`**: catálogo único. Cada bloco (card ou lista) tem seção, fonte, regra de cálculo, disponibilidade (`disponivel(indicadores)` + motivo) e se é obrigatório ou de detalhe. Seções com blocos: Resultado (faturamento, entradas, despesas, resultado, meta, atendidos, ticket, novos, ticket dos novos), Funil de leads (funil, serviço, origem, canal, motivos de não agendamento), Funil de orçamentos (por valor, por quantidade, por status, motivos), Experiência (NPS, profissional, recepção, infraestrutura, enfermagem, Google), Faturamento por profissional/unidade/pagamento. Tabelas (receitas, despesas, entradas, caixa x competência) seguem com o nível de detalhamento.
- **Mínimo Gestfy**: seções Resultado, Receitas e Despesas detalhadas fixas; dentro do Resultado, Faturamento, Despesas pagas e Resultado são obrigatórios.
- **Escolha salva** em `ItemSecao.ocultos` (blocos desligados). Sem escolha, vale o padrão: estruturas antigas no nível "Resumo" escondem os blocos de detalhe; com Entradas, o ticket dos novos fica fora (como antes). Fechamentos concluídos mantêm a estrutura congelada.
- **Quebra de página**: `ItemSecao.novaPagina` ("Começar em página nova"). Sem escolha, a regra antiga. Seção que entra no meio da página ganha o próprio título. No papel, o que não cabe continua na folha seguinte sem cortar cards e linhas.
- **Editor**: cada seção com blocos mostra "x de y itens"; ao abrir, caixas por bloco (obrigatórios com cadeado; sem dados no cliente aparecem com o motivo, a partir do fechamento mais recente). Funis com atalhos Resumo / Completo. Prévia das páginas com contagem de itens. **"Ver PDF de exemplo"** abre o PDF do fechamento mais recente com a estrutura ainda não salva (`/fechamentos-pdf/[id]?previa=<base64url>`).
- **Pacote do Claude**: seção "Definições dos indicadores" gerada do catálogo (fonte e regra de cada indicador com dados), marca `[PDF]` no que está no relatório do cliente e lista o que não tem dados ("não comente nem estime").

Testes: 235 passando (novo `blocos.test.ts`).
