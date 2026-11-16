/**
 * Estrutura do Report Semanal: quais blocos do infográfico aparecem e em que
 * ordem. O visual continua o mesmo; o cliente só liga, desliga e reordena.
 * Fica em fechamento_config.relatorio.semanal, junto das estruturas do
 * Quinzenal e do Mensal.
 */
export type SecaoSemanal = "indicadores" | "destaques" | "alertas" | "acoes" | "feedbacks";
export type KpiSemanal = "faturamentoPeriodo" | "acumuladoMes" | "respostasNps" | "avaliacoesGoogle" | "totalLeads";

export interface ItemLigado<T extends string> { id: T; ligado: boolean }
export interface EstruturaSemanal { secoes: ItemLigado<SecaoSemanal>[]; kpis: ItemLigado<KpiSemanal>[] }

export const SECOES_SEMANAL: { id: SecaoSemanal; titulo: string; descricao: string; ordenavel: boolean }[] = [
  { id: "indicadores", titulo: "Indicadores", descricao: "Cards do topo: faturamento, acumulado do mês, NPS, Google e leads", ordenavel: true },
  { id: "destaques", titulo: "Principais destaques", descricao: "Texto escrito na geração do report (ou sugerido pela IA)", ordenavel: true },
  { id: "alertas", titulo: "Alertas", descricao: "Pontos de atenção da semana", ordenavel: true },
  { id: "acoes", titulo: "Ações sugeridas", descricao: "Próximos passos numerados", ordenavel: true },
  { id: "feedbacks", titulo: "Página de feedbacks", descricao: "Segunda imagem com comentários do NPS e do Google (quando pedida na geração)", ordenavel: false },
];

export const KPIS_SEMANAL: { id: KpiSemanal; titulo: string; fonte: string }[] = [
  { id: "faturamentoPeriodo", titulo: "Faturamento no período", fonte: "Vendas, com a meta proporcional do período" },
  { id: "acumuladoMes", titulo: "Acumulado no mês", fonte: "Vendas do dia 1 até o fim do período, com a meta mensal" },
  { id: "respostasNps", titulo: "Respostas NPS", fonte: "NPS, com a meta de respostas" },
  { id: "avaliacoesGoogle", titulo: "Avaliações Google", fonte: "Google (Place ID), com a meta de avaliações" },
  { id: "totalLeads", titulo: "Total de leads", fonte: "Leads, com a conversão em agendamentos" },
];

export function padraoSemanal(): EstruturaSemanal {
  return { secoes: SECOES_SEMANAL.map((s) => ({ id: s.id, ligado: true })), kpis: KPIS_SEMANAL.map((k) => ({ id: k.id, ligado: true })) };
}

function limparLista<T extends string>(v: unknown, ids: T[]): ItemLigado<T>[] {
  const lista = Array.isArray(v) ? v : [];
  const vistos = new Set<T>();
  const out: ItemLigado<T>[] = [];
  for (const x of lista) {
    const id = (x as { id?: unknown })?.id as T;
    if (!ids.includes(id) || vistos.has(id)) continue;
    vistos.add(id);
    out.push({ id, ligado: (x as { ligado?: unknown }).ligado !== false });
  }
  for (const id of ids) if (!vistos.has(id)) out.push({ id, ligado: true });
  return out;
}

/** Aceita o que estiver salvo (ou nada) e devolve uma estrutura completa e válida. */
export function limparSemanal(v: unknown): EstruturaSemanal {
  const o = (v ?? {}) as Record<string, unknown>;
  const secoes = limparLista(o.secoes, SECOES_SEMANAL.map((s) => s.id));
  // A página de feedbacks é sempre a segunda imagem: fica no fim.
  const fb = secoes.find((s) => s.id === "feedbacks")!;
  return { secoes: [...secoes.filter((s) => s.id !== "feedbacks"), fb], kpis: limparLista(o.kpis, KPIS_SEMANAL.map((k) => k.id)) };
}

export const ehPadraoSemanal = (e: EstruturaSemanal) => JSON.stringify(e) === JSON.stringify(padraoSemanal());
export const ligado = <T extends string>(lista: ItemLigado<T>[], id: T) => lista.find((x) => x.id === id)?.ligado !== false;
