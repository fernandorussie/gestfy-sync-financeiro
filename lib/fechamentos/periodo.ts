/** Períodos de fechamento: mês inteiro ou quinzena. */
import type { Periodo } from "./indicadores";

const ultimoDia = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
const iso = (ano: number, mes: number, dia: number) => `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

/** "2026-10" + mensal → 01 a 31/10; quinzenal 1 → 01 a 15/10; quinzenal 2 → 16 a 31/10. */
export function periodoDe(mes: string, tipo: "mensal" | "quinzenal", quinzena: 1 | 2 = 1): Periodo {
  const [ano, m] = mes.split("-").map(Number);
  if (tipo === "mensal") return { inicio: iso(ano, m, 1), fim: iso(ano, m, ultimoDia(ano, m)) };
  return quinzena === 1 ? { inicio: iso(ano, m, 1), fim: iso(ano, m, 15) } : { inicio: iso(ano, m, 16), fim: iso(ano, m, ultimoDia(ano, m)) };
}

/** Período imediatamente anterior, do mesmo tamanho lógico (mês anterior ou mesma quinzena do mês anterior). */
export function periodoAnterior(p: Periodo, tipo: "mensal" | "quinzenal"): Periodo {
  const [ano, m, d] = p.inicio.split("-").map(Number);
  const ma = m === 1 ? 12 : m - 1;
  const aa = m === 1 ? ano - 1 : ano;
  const mes = `${aa}-${String(ma).padStart(2, "0")}`;
  return tipo === "mensal" ? periodoDe(mes, "mensal") : periodoDe(mes, "quinzenal", d >= 16 ? 2 : 1);
}

