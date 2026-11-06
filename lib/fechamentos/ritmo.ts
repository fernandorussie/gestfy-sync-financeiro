/**
 * Ritmo do mês, usado no relatório quinzenal (parcial do dia 1 ao 15).
 *
 * - Faturamento por dia útil = faturamento do período ÷ dias úteis decorridos.
 * - Projeção do mês = faturamento por dia útil × dias úteis do mês.
 * - Despesas a pagar: muitas clínicas só lançam despesas já pagas, então o
 *   parâmetro é a média de despesas pagas nos 3 meses fechados anteriores.
 *   Provisionado a pagar = essa média − o que já foi pago no período.
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
  /** Média − pagas no período (nunca negativo). */
  provisionado: number | null;
  saldoPeriodo: number;
  /** Projeção do mês − média de despesas. */
  saldoProjetado: number | null;
}

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
    provisionado: mediaDespesas !== null ? centavos(Math.max(0, mediaDespesas - despesasPagas)) : null,
    saldoPeriodo: centavos(faturamento - despesasPagas),
    saldoProjetado: mediaDespesas !== null ? centavos(projecaoMes - Math.max(mediaDespesas, despesasPagas)) : null,
  };
}
