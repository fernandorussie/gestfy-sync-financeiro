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

## Próximos passos

1. Banco (Supabase de testes): mapa de fontes por clínica, fechamentos congelados, decisões da conferência, plano de ação.
2. Telas do fluxo (conferência → indicadores → análise → entrega), seguindo o protótipo.
3. Leitura real das planilhas da Claros com a conta de serviço do ambiente de testes e comparação de 3 meses com a planilha-mãe.
