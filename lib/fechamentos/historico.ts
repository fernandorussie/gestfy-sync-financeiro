/**
 * Histórico da clínica: agrupa as versões de cada período e monta a
 * evolução mês a mês a partir dos fechamentos mensais.
 *
 * Números: de um fechamento concluído vêm do retrato congelado (snapshot);
 * de um em andamento, do último cálculo salvo (pode mudar até concluir).
 */
import type { Indicadores } from "./indicadores";

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
