/**
 * Ritmo do mês, usado no relatório quinzenal (parcial do dia 1 ao 15).
 *
 * - Faturamento por dia útil = faturamento do período ÷ dias úteis decorridos.
 * - Projeção do mês = faturamento por dia útil × dias úteis do mês.
 * - Despesas a pagar: muitas clínicas só lançam despesas já pagas, então o
 *   parâmetro é a média de despesas pagas nos 3 meses fechados anteriores.
 *   Provisionado a pagar = essa média − o que já foi pago no período.
 *
 * - Provisionado a pagar: o consultor escolhe o método por cliente
 *   (regras.provisionamento). "media" (padrão) = média − pago, como sempre.
 *   "contas" = lançamentos com vencimento dentro do mês ainda não pagos até o
 *   fim do período (inclui o saldo de parciais). Vencidos de meses anteriores
 *   ficam de fora. Sem as colunas necessárias, fica pendente: nunca troca de
 *   método sozinho.
 *
 * Dias úteis: segunda a sexta, sem os feriados cadastrados no GestfySync.
 */
import { calcularIndicadores, type Ajustes, type DadosFechamento, type Periodo, type RegrasClinica } from "./indicadores";
import { centavos } from "./texto";

export interface Ritmo {
  diasUteisMes: number;
  diasUteisDecorridos: number;
  diasUteisRestantes: number;
  faturamento: number;
  faturamentoPorDia: number;
  projecaoMes: number;
  meta: number | null;
  /** Realizado até agora ÷ meta. */
  atingimento: number | null;
  /** Projeção ÷ meta. */
  atingimentoProjetado: number | null;
  /** Quanto falta faturar para bater a meta (0 se já bateu). */
  faltaMeta: number | null;
  /** Por dia útil restante, para bater a meta. */
  necessarioPorDia: number | null;
  despesasPagas: number;
  /** Média das despesas pagas nos meses usados (até 3). Null sem histórico. */
  mediaDespesas: number | null;
  /** AAAA-MM dos meses que entraram na média. */
  mesesMedia: string[];
  /** Média − pagas (método "media") ou contas em aberto do mês (método "contas"). Null = sem histórico ou pendente. */
  provisionado: number | null;
  /** Método usado. Ausente em fechamentos antigos = "media". */
  metodoProvisao?: MetodoProvisao;
  /** Por que o provisionado não pôde ser calculado no método escolhido. */
  provisaoPendencia?: string | null;
  /** Detalhe do método "contas". */
  contasAbertas?: { lancamentos: number; parciais: number; pagasDepois: number; ate: string; itens: { linha: number; vencimento: string; descricao: string; categoria: string; valor: number }[] } | null;
  saldoPeriodo: number;
  /** Projeção do mês − média de despesas. */
  saldoProjetado: number | null;
}

export type MetodoProvisao = "media" | "contas";
export const METODOS_PROVISAO: { id: MetodoProvisao; rotulo: string; descricao: string }[] = [
  { id: "media", rotulo: "Média histórica", descricao: "Média das despesas pagas nos 3 meses anteriores, menos o que já foi pago no mês." },
  { id: "contas", rotulo: "Contas em aberto", descricao: "Lançamentos com vencimento no mês ainda não pagos, pela planilha de Despesas (vencimento, situação e valor em aberto)." },
];
/** Colunas da planilha de Despesas que o método "contas" usa. */
export interface ColunasProvisao { vencimento: boolean; situacao: boolean; valorAberto: boolean }

const ISO = (d: Date) => d.toISOString().slice(0, 10);

/** Dias úteis entre duas datas AAAA-MM-DD (inclusive). */
export function diasUteis(inicio: string, fim: string, feriados: Iterable<string>): number {
  const fer = new Set(feriados);
  let n = 0;
  for (let d = new Date(`${inicio}T12:00:00Z`); ISO(d) <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
    const dia = d.getUTCDay();
    if (dia !== 0 && dia !== 6 && !fer.has(ISO(d))) n++;
  }
  return n;
}

function mesesAntes(inicio: string, n: number): Periodo[] {
  const [ano, mes] = inicio.split("-").map(Number);
  const lista: Periodo[] = [];
  for (let k = 1; k <= n; k++) {
    const d = new Date(Date.UTC(ano, mes - 1 - k, 1));
    const fim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    lista.push({ inicio: ISO(d), fim: ISO(fim) });
  }
  return lista;
}

export function calcularRitmo(p: {
  dados: DadosFechamento;
  periodo: Periodo;
  feriados: string[];
  meta: number | null;
  regras?: RegrasClinica;
  ajustes?: Ajustes;
  /** Método e colunas encontradas na planilha de Despesas. Sem isto: média histórica. */
  provisao?: { metodo: MetodoProvisao; colunas: ColunasProvisao };
}): Ritmo {
  const { dados, periodo } = p;
  const [ano, mes] = periodo.inicio.split("-").map(Number);
  const inicioMes = periodo.inicio.slice(0, 8) + "01";
  const fimMes = ISO(new Date(Date.UTC(ano, mes, 0)));
  const diasUteisMes = diasUteis(inicioMes, fimMes, p.feriados);
  const diasUteisDecorridos = diasUteis(inicioMes, periodo.fim, p.feriados);
  const diasUteisRestantes = Math.max(0, diasUteisMes - diasUteisDecorridos);

  const atual = calcularIndicadores(dados, { inicio: inicioMes, fim: periodo.fim }, { regras: p.regras, ajustes: p.ajustes });
  const faturamento = atual.faturamento?.total ?? 0;
  const despesasPagas = atual.despesas?.total ?? 0;
  const faturamentoPorDia = diasUteisDecorridos ? centavos(faturamento / diasUteisDecorridos) : 0;
  const projecaoMes = centavos(faturamentoPorDia * diasUteisMes);

  // Média de despesas: os 3 meses fechados anteriores que têm lançamento.
  const historico = mesesAntes(inicioMes, 3)
    .map((m) => ({ mes: m.inicio.slice(0, 7), total: calcularIndicadores(dados, m, { regras: p.regras }).despesas?.total ?? 0 }))
    .filter((m) => m.total > 0);
  const mediaDespesas = historico.length ? centavos(historico.reduce((s, m) => s + m.total, 0) / historico.length) : null;

  const metodo: MetodoProvisao = p.provisao?.metodo === "contas" ? "contas" : "media";
  let provisionado: number | null = mediaDespesas !== null ? centavos(Math.max(0, mediaDespesas - despesasPagas)) : null;
  let provisaoPendencia: string | null = null;
  let contasAbertas: Ritmo["contasAbertas"] = null;
  if (metodo === "contas") {
    const r = contasEmAberto(dados, { inicio: inicioMes, fim: fimMes }, periodo.fim, p.provisao!.colunas);
    provisionado = r.pendencia ? null : r.total;
    provisaoPendencia = r.pendencia;
    contasAbertas = r.pendencia ? null : r.detalhe;
  }
  const esperado = metodo === "contas"
    ? (provisionado !== null ? despesasPagas + provisionado : null)
    : (mediaDespesas !== null ? Math.max(mediaDespesas, despesasPagas) : null);

  const meta = p.meta && p.meta > 0 ? p.meta : null;
  const faltaMeta = meta !== null ? centavos(Math.max(0, meta - faturamento)) : null;
  return {
    diasUteisMes, diasUteisDecorridos, diasUteisRestantes,
    faturamento, faturamentoPorDia, projecaoMes,
    meta,
    atingimento: meta ? faturamento / meta : null,
    atingimentoProjetado: meta ? projecaoMes / meta : null,
    faltaMeta,
    necessarioPorDia: faltaMeta !== null && diasUteisRestantes ? centavos(faltaMeta / diasUteisRestantes) : null,
    despesasPagas,
    mediaDespesas,
    mesesMedia: historico.map((m) => m.mes).reverse(),
    provisionado,
    metodoProvisao: metodo,
    provisaoPendencia,
    contasAbertas,
    saldoPeriodo: centavos(faturamento - despesasPagas),
    saldoProjetado: esperado !== null ? centavos(projecaoMes - esperado) : null,
  };
}

/**
 * Contas a pagar do mês: lançamentos com vencimento dentro do mês, não
 * cancelados, que não estavam pagos no fim do período:
 * - com a coluna "Valor em aberto": esse saldo (pega parciais e em aberto);
 * - sem ela: o valor das linhas marcadas como não pagas (planilhas manuais);
 * - pagos depois do fim do período (a planilha foi atualizada depois do dia 15)
 *   também contam, pelo valor pago, porque no dia 15 ainda estavam a pagar.
 */
export function contasEmAberto(dados: DadosFechamento, mes: Periodo, fimPeriodo: string, colunas: ColunasProvisao): {
  total: number; pendencia: string | null; detalhe: NonNullable<Ritmo["contasAbertas"]>;
} {
  const detalhe: NonNullable<Ritmo["contasAbertas"]> = { lancamentos: 0, parciais: 0, pagasDepois: 0, ate: mes.fim, itens: [] };
  const faltam: string[] = [];
  if (!dados.despesas) faltam.push("planilha de Despesas configurada e lida");
  if (!colunas.vencimento) faltam.push("coluna Data de vencimento");
  if (!colunas.situacao && !colunas.valorAberto) faltam.push("coluna Situação (pago/em aberto) ou Valor em aberto");
  if (faltam.length) return { total: 0, pendencia: `Provisionamento por contas em aberto pendente: falta ${faltam.join(" e ")} na fonte de Despesas.`, detalhe };
  let total = 0;
  for (const d of dados.despesas!) {
    if (d.cancelada || !d.dataVencimento || d.dataVencimento < mes.inicio || d.dataVencimento > mes.fim) continue;
    // Em planilhas manuais, "Pago? Não" com data preenchida é previsão: a linha segue a pagar.
    const pagaDepois = d.pago !== false && !!d.dataPagamento && d.dataPagamento > fimPeriodo;
    const aberto = colunas.valorAberto ? (d.valorAberto ?? 0) : (d.pago === false ? d.valor : 0);
    const valor = aberto + (pagaDepois ? d.valor : 0);
    if (valor <= 0) continue;
    total += valor;
    detalhe.lancamentos++;
    if (pagaDepois) detalhe.pagasDepois++;
    else if (aberto > 0 && (d.dataPagamento || d.pago === true)) detalhe.parciais++;
    detalhe.itens.push({ linha: d.linha, vencimento: d.dataVencimento, descricao: d.descricao, categoria: d.categoria, valor: centavos(valor) });
  }
  detalhe.itens.sort((a, b) => b.valor - a.valor);
  detalhe.itens = detalhe.itens.slice(0, 40);
  return { total: centavos(total), pendencia: null, detalhe };
}

const dm = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
/** Nota curta do card "Provisionado a pagar": diz o método usado. */
export function notaProvisao(r: Ritmo): string {
  if (r.metodoProvisao === "contas") {
    if (r.provisaoPendencia) return "contas em aberto · pendente";
    const c = r.contasAbertas;
    return c ? `contas em aberto até ${dm(c.ate)} (${c.lancamentos} ${c.lancamentos === 1 ? "lançamento" : "lançamentos"})` : "contas em aberto";
  }
  return `média de ${r.mesesMedia.length || 3} meses − já pago`;
}
/** Frase do método para textos (WhatsApp, observação, pacote). */
export function metodoProvisaoTexto(r: Ritmo): string {
  if (r.metodoProvisao === "contas") {
    const c = r.contasAbertas;
    return c ? `pelas contas em aberto com vencimento até ${dm(c.ate)}` : "pelas contas em aberto";
  }
  return `pela média de ${r.mesesMedia.length === 1 ? "1 mês" : `${r.mesesMedia.length} meses`}`;
}
