/**
 * Checkpoint sobre a fonte única do cliente: confere todas as planilhas
 * configuradas (padrão e personalizadas), não uma lista fixa de indicadores.
 *
 * Para cada fonte: quando foi o último lançamento (até hoje), quantos entraram
 * no mês corrente e, onde existe categoria, quantos estão sem ela. A régua de
 * atraso vem da cadência da fonte: diária (2 dias úteis) ou semanal (5).
 */
import type { LeituraFonte } from "@/lib/coletores/checkpoint";
import type { DadosFechamento, RegrasClinica } from "@/lib/fechamentos/indicadores";
import type { FontesFechamento } from "@/lib/fechamentos/coleta";

export type Cadencia = "diaria" | "semanal";
export type CadenciaEscolha = Cadencia | "nao";

/** Fontes padrão, na ordem em que aparecem no Checkpoint. */
export const FONTES_CHECKPOINT: { id: keyof FontesFechamento & keyof DadosFechamento; rotulo: string; padrao: Cadencia; categoria: boolean }[] = [
  { id: "vendas", rotulo: "Vendas / faturamento", padrao: "diaria", categoria: true },
  { id: "despesas", rotulo: "Despesas", padrao: "diaria", categoria: true },
  { id: "entradas", rotulo: "Entradas", padrao: "diaria", categoria: true },
  { id: "orcamentos", rotulo: "Orçamentos", padrao: "semanal", categoria: false },
  { id: "leads", rotulo: "Leads", padrao: "semanal", categoria: false },
  { id: "nps", rotulo: "NPS", padrao: "semanal", categoria: false },
  { id: "preConsulta", rotulo: "Pré-consulta", padrao: "semanal", categoria: false },
  { id: "avaliacoes", rotulo: "Avaliações Google", padrao: "semanal", categoria: false },
];

export const LIMITE_POR_CADENCIA: Record<Cadencia, number> = { diaria: 2, semanal: 5 };

export const idPersonalizadaCheckpoint = (id: string) => `pers:${id}`;

/** Cadência escolhida para a fonte (ou a padrão dela). */
export function cadenciaDa(id: string, regras: RegrasClinica, padrao: Cadencia = "semanal"): CadenciaEscolha {
  return regras.checkpoint?.[id] ?? padrao;
}

/** Datas e categorias de cada fonte padrão, como o Checkpoint precisa. */
export function linhasDaFonte(dados: DadosFechamento, id: (typeof FONTES_CHECKPOINT)[number]["id"]): { data: string; categoria?: string }[] {
  switch (id) {
    case "vendas": return (dados.vendas ?? []).map((v) => ({ data: v.data, categoria: v.categoria }));
    case "despesas": return (dados.despesas ?? []).flatMap((d) => (d.dataPagamento ? [{ data: d.dataPagamento, categoria: d.categoria }] : []));
    case "entradas": return (dados.entradas ?? []).map((e) => ({ data: e.data, categoria: e.categoria }));
    case "orcamentos": return (dados.orcamentos ?? []).map((o) => ({ data: o.data }));
    case "leads": return (dados.leads ?? []).map((l) => ({ data: l.data }));
    case "nps": return (dados.nps ?? []).map((n) => ({ data: n.data }));
    case "preConsulta": return (dados.preConsulta ?? []).map((p) => ({ data: p.data }));
    case "avaliacoes": return (dados.avaliacoes ?? []).map((a) => ({ data: a.data }));
  }
}

const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const deISO = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

/**
 * Resume as linhas no formato que a avaliação do Checkpoint usa. Lançamentos
 * com data no futuro (agendamentos, previsões) não contam como "último
 * lançamento", para não esconder uma planilha parada.
 */
export function leituraDasLinhas(linhas: { data: string; categoria?: string }[], hoje: Date, comCategoria: boolean): LeituraFonte {
  const h = isoLocal(hoje);
  const inicioMes = `${h.slice(0, 7)}-01`;
  const validas = linhas.filter((l) => l.data && l.data <= h);
  const ultimo = validas.reduce<string | null>((m, l) => (m === null || l.data > m ? l.data : m), null);
  const doMes = validas.filter((l) => l.data >= inicioMes);
  return {
    ultimoLancamento: ultimo ? deISO(ultimo) : null,
    totalLancamentos: validas.length,
    lancamentosPeriodo: doMes.length,
    semCategoriaPeriodo: comCategoria ? doMes.filter((l) => !String(l.categoria ?? "").trim()).length : null,
    abasLidas: [],
    mesesSemAba: [],
  };
}
