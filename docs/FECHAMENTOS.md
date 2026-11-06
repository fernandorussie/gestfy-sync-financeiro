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
