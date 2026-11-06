const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl0Fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const brl = (v: number | null | undefined) => (v === null || v === undefined ? "—" : brlFmt.format(v));
export const brl0 = (v: number | null | undefined) => (v === null || v === undefined ? "—" : brl0Fmt.format(Math.round(v)));
export const pct = (v: number | null | undefined, casas = 1) =>
  v === null || v === undefined ? "—" : `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
export const num = (v: number | null | undefined, casas = 0) =>
  v === null || v === undefined ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** "2026-10-01" → "01/10/2026" */
export const dataBR = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MESES_AB = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Nome do período: "outubro/2026" ou "1ª quinzena de outubro/2026". */
export function nomePeriodo(tipo: "mensal" | "quinzenal", inicio: string, fim: string): string {
  const [a, m] = inicio.split("-").map(Number);
  if (tipo === "mensal") return `${MESES[m - 1]}/${a}`;
  if (inicio.slice(8, 10) === "01" && fim.slice(8, 10) === "15") return `1ª quinzena de ${MESES[m - 1]}/${a}`;
  return `${inicio.slice(8, 10)} a ${fim.slice(8, 10)}/${String(m).padStart(2, "0")}/${a}`;
}
export const mesAbrev = (anoMes: string) => MESES_AB[Number(anoMes.slice(5, 7)) - 1];
