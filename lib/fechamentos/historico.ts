/**
 * Histórico da clínica: agrupa as versões de cada período e monta a
 * evolução mês a mês a partir dos fechamentos mensais.
 *
 * Números: de um fechamento concluído vêm do retrato congelado (snapshot);
 * de um em andamento, do último cálculo salvo (pode mudar até concluir).
 */
import type { Indicadores, LinhaAnual } from "./indicadores";
import { adaptarResultado, type Formato, type Melhor, type ResultadoPersonalizado } from "./fonte-personalizada";
import { METRICAS_PADRAO, metricasDoFechamento } from "./metricas";

export interface LinhaFechamento {
  id: string;
  tipo: "mensal" | "quinzenal";
  inicio: string;
  fim: string;
  status: "conferencia" | "analise" | "concluido" | "enviado";
  versao: number;
  indicadores: unknown;
  snapshot: unknown;
  concluido_em: string | null;
  enviado_em: string | null;
  acoes?: unknown;
}

export interface PeriodoHistorico {
  chave: string;
  tipo: "mensal" | "quinzenal";
  inicio: string;
  fim: string;
  /** Versão mais nova do período. */
  atual: LinhaFechamento;
  /** Versões anteriores, da mais nova para a mais antiga. */
  anteriores: LinhaFechamento[];
}

export interface PontoEvolucao {
  id: string;
  mes: string; // AAAA-MM
  definitivo: boolean;
  faturamento: number | null;
  despesas: number | null;
  resultado: number | null;
  atingimento: number | null;
  meta: number | null;
  pacientes: number | null;
  ticket: number | null;
  novos: number | null;
  conversaoLeads: number | null;
  conversaoOrcamentos: number | null;
  nps: number | null;
}

export const concluido = (l: Pick<LinhaFechamento, "status">) => l.status === "concluido" || l.status === "enviado";

/** Indicadores do fechamento: congelados se concluído, senão o último cálculo. */
export function indicadoresDe(l: LinhaFechamento): Indicadores | null {
  const snap = l.snapshot as { indicadores?: Indicadores } | null;
  if (concluido(l) && snap?.indicadores) return snap.indicadores;
  return (l.indicadores as Indicadores | null) ?? null;
}

export function agruparPeriodos(linhas: LinhaFechamento[]): PeriodoHistorico[] {
  const grupos = new Map<string, LinhaFechamento[]>();
  for (const l of linhas) {
    const k = `${l.tipo}|${l.inicio}|${l.fim}`;
    grupos.set(k, [...(grupos.get(k) ?? []), l]);
  }
  return [...grupos.entries()]
    .map(([chave, ls]) => {
      const ordenadas = [...ls].sort((a, b) => b.versao - a.versao);
      const [atual, ...anteriores] = ordenadas;
      return { chave, tipo: atual.tipo, inicio: atual.inicio, fim: atual.fim, atual, anteriores };
    })
    .sort((a, b) => b.inicio.localeCompare(a.inicio) || (a.tipo === "mensal" ? -1 : 1));
}

/** Um ponto por mês, da versão mais nova de cada fechamento mensal, em ordem cronológica. */
export function evolucaoMensal(periodos: PeriodoHistorico[]): PontoEvolucao[] {
  return periodos
    .filter((p) => p.tipo === "mensal")
    .map((p) => {
      const i = indicadoresDe(p.atual);
      return {
        id: p.atual.id,
        mes: p.inicio.slice(0, 7),
        definitivo: concluido(p.atual),
        faturamento: i?.faturamento?.total ?? null,
        despesas: i?.despesas?.total ?? null,
        resultado: i?.caixa?.resultado ?? null,
        atingimento: i?.meta?.atingimento ?? null,
        meta: i?.meta?.valor ?? null,
        pacientes: i?.pacientes?.atendidos ?? null,
        ticket: i?.pacientes?.ticketMedio ?? null,
        novos: i?.pacientes?.novos ?? null,
        conversaoLeads: i?.leads?.conversao ?? null,
        conversaoOrcamentos: i?.orcamentos?.conversaoValor ?? null,
        nps: i?.nps?.nps ?? null,
      };
    })
    .sort((a, b) => a.mes.localeCompare(b.mes));
}

/* ---------- situação do cliente (painel) ---------- */

export type SituacaoCliente = "pronto" | "pendente" | "nao_configurado";

/** Pronto = tem vendas e despesas; pendente = começou a configurar; não configurado = nada. */
export function situacaoCliente(fontes: unknown): { situacao: SituacaoCliente; faltando: string[] } {
  const f = (fontes ?? {}) as Record<string, { sheetId?: string } | undefined>;
  const faltando = [!f.vendas?.sheetId && "vendas", !f.despesas?.sheetId && "despesas"].filter((x): x is string => !!x);
  const algo = Object.values(f).some((x) => x?.sheetId);
  return { situacao: !faltando.length ? "pronto" : algo ? "pendente" : "nao_configurado", faltando };
}

/* ---------- comparativos ---------- */

export interface PontoSerie { mes: string; valor: number; definitivo: boolean; id: string }
export interface SerieComparativo { id: string; rotulo: string; formato: Formato; melhor: Melhor; pontos: PontoSerie[]; personalizada: boolean }

/** Personalizadas do fechamento: só de concluídos (o cálculo em andamento não fica salvo). */
function personalizadasDe(l: LinhaFechamento): ResultadoPersonalizado[] {
  const snap = l.snapshot as { personalizadas?: unknown[] } | null;
  return concluido(l) && Array.isArray(snap?.personalizadas) ? snap!.personalizadas.map(adaptarResultado) : [];
}

/** Uma série por indicador (padrão e personalizados), com um ponto por mês, dos fechamentos mensais. */
export function seriesComparativas(periodos: PeriodoHistorico[], meses = 12): SerieComparativo[] {
  const mensais = periodos.filter((p) => p.tipo === "mensal").sort((a, b) => a.inicio.localeCompare(b.inicio)).slice(-meses);
  const series = new Map<string, SerieComparativo>();
  for (const m of METRICAS_PADRAO) series.set(m.id, { id: m.id, rotulo: m.rotulo, formato: m.formato, melhor: m.melhor, pontos: [], personalizada: false });
  for (const p of mensais) {
    for (const x of metricasDoFechamento(indicadoresDe(p.atual), personalizadasDe(p.atual))) {
      const s = series.get(x.indicador) ?? { id: x.indicador, rotulo: x.rotulo, formato: x.formato, melhor: x.melhor, pontos: [], personalizada: true };
      s.rotulo = x.rotulo; // o nome mais recente
      s.pontos.push({ mes: p.inicio.slice(0, 7), valor: x.valor, definitivo: concluido(p.atual), id: p.atual.id });
      series.set(x.indicador, s);
    }
  }
  return [...series.values()].filter((s) => s.pontos.length);
}

export interface Estatisticas { media: number; maior: PontoSerie; menor: PontoSerie; ultimo: PontoSerie; ultimoVsMedia: number | null; meses: number }

export function estatisticas(pontos: PontoSerie[]): Estatisticas | null {
  if (!pontos.length) return null;
  const media = pontos.reduce((s, p) => s + p.valor, 0) / pontos.length;
  const maior = pontos.reduce((a, b) => (b.valor > a.valor ? b : a));
  const menor = pontos.reduce((a, b) => (b.valor < a.valor ? b : a));
  const ultimo = pontos[pontos.length - 1];
  return { media, maior, menor, ultimo, ultimoVsMedia: media ? ultimo.valor / media - 1 : null, meses: pontos.length };
}

/** Caixa x competência do ano: do retrato do último mensal concluído (é onde o ano fica guardado). */
export function anoCaixaCompetencia(periodos: PeriodoHistorico[]): { ano: string; linhas: LinhaAnual[] } | null {
  const p = periodos.filter((x) => x.tipo === "mensal" && concluido(x.atual)).sort((a, b) => b.inicio.localeCompare(a.inicio))[0];
  const anual = (p?.atual.snapshot as { anual?: LinhaAnual[] } | null)?.anual;
  return p && anual?.length ? { ano: p.inicio.slice(0, 4), linhas: anual.filter((m) => m.entradas || m.saidasCaixa || m.saidasCompetencia) } : null;
}
