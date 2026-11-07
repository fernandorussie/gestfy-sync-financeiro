/**
 * Formatação dos indicadores personalizados (tela, PDF e pacote do Claude).
 */
import type { Formato, Melhor } from "./fonte-personalizada";

const nf = (casas: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: 0 });

export function formatarIndicador(v: number | null | undefined, formato: Formato): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  switch (formato) {
    case "moeda": return `R$ ${nf(Math.abs(v) >= 1000 ? 0 : 2).format(v)}`;
    case "percentual": return `${nf(1).format(v)}%`;
    case "dias": return `${nf(1).format(v)} ${Math.abs(v) === 1 ? "dia" : "dias"}`;
    default: return nf(Math.abs(v) >= 100 ? 0 : 2).format(v);
  }
}

export interface Variacao { texto: string; sentido: "sobe" | "desce" | "igual"; tom: "bom" | "ruim" | "neutro" }

/** Variação contra o anterior: % para valores, pontos percentuais para indicadores em %. */
export function variacaoIndicador(atual: number | null | undefined, anterior: number | null | undefined, formato: Formato, melhor: Melhor): Variacao | null {
  if (atual == null || anterior == null || !Number.isFinite(atual) || !Number.isFinite(anterior)) return null;
  const dif = atual - anterior;
  const sentido = Math.abs(dif) < 1e-9 ? "igual" : dif > 0 ? "sobe" : "desce";
  const tom = sentido === "igual" || melhor === "neutro" ? "neutro" : (sentido === "sobe") === (melhor === "maior") ? "bom" : "ruim";
  const sinal = dif > 0 ? "+" : dif < 0 ? "−" : "";
  if (formato === "percentual") return { texto: `${sinal}${nf(1).format(Math.abs(dif))} p.p.`, sentido, tom };
  if (!anterior) return atual ? { texto: "novo", sentido, tom } : null;
  return { texto: `${sinal}${nf(0).format(Math.abs(dif / anterior) * 100)}%`, sentido, tom };
}
