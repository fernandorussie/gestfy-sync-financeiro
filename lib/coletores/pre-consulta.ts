import { readSheetRange } from "@/lib/google/sheets";
import type { FonteDados, Json } from "@/lib/supabase/types";

export interface RespostaContagem {
  nome: string;
  count: number;
  pct: number;
}

export interface ResultadoPreConsulta {
  total: number;
  motivos: RespostaContagem[];
  origens: RespostaContagem[];
}

function getMapeamento(m: Json): Record<string, string> {
  if (m && typeof m === "object" && !Array.isArray(m)) return m as Record<string, string>;
  return {};
}

function colIndex(letter: string): number {
  let idx = 0;
  for (const ch of letter.toUpperCase()) idx = idx * 26 + (ch.charCodeAt(0) - 64);
  return idx - 1;
}

function parseSheetDate(value: string): Date | null {
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

function normalize(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function contar(values: string[]): RespostaContagem[] {
  const map = new Map<string, { nome: string; count: number }>();
  for (const raw of values) {
    const v = raw.trim();
    if (!v) continue;
    const key = normalize(v);
    const entry = map.get(key);
    if (entry) entry.count++;
    else map.set(key, { nome: v, count: 1 });
  }
  const total = Array.from(map.values()).reduce((s, e) => s + e.count, 0);
  return Array.from(map.values())
    .map((e) => ({ ...e, pct: total > 0 ? Math.round((e.count / total) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);
}

export async function coletarPreConsulta(
  fonte: FonteDados,
  dataInicio: Date,
  dataFim: Date
): Promise<ResultadoPreConsulta> {
  const mapeamento = getMapeamento(fonte.mapeamento);
  const rows = await readSheetRange(fonte.sheet_id, `${fonte.aba_nome}!A:Z`);

  const dataIdx = colIndex(fonte.coluna_data);
  const motivoIdx = mapeamento.motivo ? colIndex(mapeamento.motivo) : -1;
  const origemIdx = mapeamento.origem ? colIndex(mapeamento.origem) : -1;

  const iniMs = new Date(dataInicio.getFullYear(), dataInicio.getMonth(), dataInicio.getDate()).getTime();
  const fimMs = new Date(dataFim.getFullYear(), dataFim.getMonth(), dataFim.getDate()).getTime();

  const filtered = rows.slice(1).filter((row) => {
    const d = parseSheetDate(String(row[dataIdx] ?? ""));
    if (!d) return false;
    const t = d.getTime();
    return t >= iniMs && t <= fimMs;
  });

  return {
    total: filtered.length,
    motivos: contar(motivoIdx >= 0 ? filtered.map((r) => String(r[motivoIdx] ?? "")) : []),
    origens: contar(origemIdx >= 0 ? filtered.map((r) => String(r[origemIdx] ?? "")) : []),
  };
}
