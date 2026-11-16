/**
 * Comparativos v2: períodos, agrupamentos e comparação entre períodos.
 *
 * Regras puras (testáveis). A tela escolhe um período (ano atual, últimos 12
 * meses, semestre, trimestre, mês, quinzena, semana ou datas livres) e, no
 * modo Evolução, como agrupar os pontos do gráfico (mês, quinzena ou semana).
 * O motor de cálculo dos fechamentos aceita qualquer intervalo de datas.
 */
import type { Periodo } from "./indicadores";

export type TipoPeriodo = "ano" | "12m" | "semestre" | "trimestre" | "mes" | "quinzena" | "semana" | "livre";
export type Agrupar = "mes" | "quinzena" | "semana";

/** Seleção de período, como vai no endereço da página. `ref` depende do tipo. */
export interface SelecaoPeriodo {
  tipo: TipoPeriodo;
  /**
   * ano: "2026" · semestre: "2026-1" · trimestre: "2026-3" · mes: "2026-10" ·
   * quinzena: "2026-11-1" · semana: "2026-11-09" (segunda) · livre: "2026-09-01_2026-11-15".
   * Vazio = o mais recente já fechado.
   */
  ref?: string;
  /** Inclui o mês (ou a quinzena, a semana) em andamento, marcado como parcial. */
  atual?: boolean;
}

export interface Intervalo extends Periodo { rotulo: string; parcial: boolean }
export interface Fatia extends Periodo { chave: string; rotulo: string; parcial: boolean; mesInteiro: boolean }

export const MAX_PONTOS = 26;

export const PERIODOS: { id: TipoPeriodo; rotulo: string }[] = [
  { id: "ano", rotulo: "Ano atual" },
  { id: "12m", rotulo: "Últimos 12 meses" },
  { id: "semestre", rotulo: "Semestre" },
  { id: "trimestre", rotulo: "Trimestre" },
  { id: "mes", rotulo: "Mês" },
  { id: "quinzena", rotulo: "Quinzena" },
  { id: "semana", rotulo: "Semana" },
  { id: "livre", rotulo: "Personalizado" },
];

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const p2 = (n: number) => String(n).padStart(2, "0");
const iso = (a: number, m: number, d: number) => `${a}-${p2(m)}-${p2(d)}`;
const ultimoDia = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();
const deISO = (s: string) => { const [a, m, d] = s.split("-").map(Number); return new Date(Date.UTC(a, m - 1, d)); };
const paraISO = (d: Date) => iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
const somarDias = (s: string, n: number) => { const d = deISO(s); d.setUTCDate(d.getUTCDate() + n); return paraISO(d); };
const hojeISO = (h: Date) => iso(h.getFullYear(), h.getMonth() + 1, h.getDate());
const segundaDa = (s: string) => { const d = deISO(s); return somarDias(s, -((d.getUTCDay() + 6) % 7)); };
const dataBR = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const mesRot = (a: number, m: number) => `${MESES[m - 1]}/${String(a).slice(2)}`;

/** Último mês já fechado (o anterior ao de hoje). */
function ultimoMesFechado(h: Date): { a: number; m: number } {
  const m = h.getMonth() + 1, a = h.getFullYear();
  return m === 1 ? { a: a - 1, m: 12 } : { a, m: m - 1 };
}

/** Converte a seleção num intervalo de datas. O fim nunca passa de hoje. */
export function intervaloDe(sel: SelecaoPeriodo, h = new Date()): Intervalo {
  const hoje = hojeISO(h);
  const cortar = (ini: string, fim: string, rotulo: string): Intervalo =>
    fim > hoje ? { inicio: ini, fim: hoje, rotulo: `${rotulo} (até ${dataBR(hoje)})`, parcial: true } : { inicio: ini, fim, rotulo, parcial: false };
  const ref = sel.ref ?? "";
  const uf = ultimoMesFechado(h);
  switch (sel.tipo) {
    case "ano": {
      const a = Number(ref) || h.getFullYear();
      if (a === h.getFullYear() && !sel.atual) {
        // Ano atual: de janeiro até o último mês fechado (em janeiro, o ano anterior inteiro).
        if (h.getMonth() === 0) return { inicio: iso(a - 1, 1, 1), fim: iso(a - 1, 12, 31), rotulo: String(a - 1), parcial: false };
        return { inicio: iso(a, 1, 1), fim: iso(a, uf.m, ultimoDia(a, uf.m)), rotulo: `${a} (jan a ${MESES[uf.m - 1]})`, parcial: false };
      }
      return cortar(iso(a, 1, 1), iso(a, 12, 31), String(a));
    }
    case "12m": {
      const fimA = sel.atual ? h.getFullYear() : uf.a, fimM = sel.atual ? h.getMonth() + 1 : uf.m;
      const ini = new Date(Date.UTC(fimA, fimM - 12, 1));
      return cortar(paraISO(ini), iso(fimA, fimM, ultimoDia(fimA, fimM)), `${mesRot(ini.getUTCFullYear(), ini.getUTCMonth() + 1)} a ${mesRot(fimA, fimM)}`);
    }
    case "semestre": {
      // Sem referência: o último semestre já terminado (ou o em andamento, se pedido).
      const sa = h.getMonth() < 6 ? 1 : 2;
      const [a, s] = ref ? ref.split("-").map(Number) : sel.atual ? [h.getFullYear(), sa] : sa === 2 ? [h.getFullYear(), 1] : [h.getFullYear() - 1, 2];
      return cortar(iso(a, s === 1 ? 1 : 7, 1), s === 1 ? iso(a, 6, 30) : iso(a, 12, 31), `${s}º semestre/${a}`);
    }
    case "trimestre": {
      const ta = Math.ceil((h.getMonth() + 1) / 3);
      const [a, t] = ref ? ref.split("-").map(Number) : sel.atual ? [h.getFullYear(), ta] : ta === 1 ? [h.getFullYear() - 1, 4] : [h.getFullYear(), ta - 1];
      const m0 = (t - 1) * 3 + 1;
      return cortar(iso(a, m0, 1), iso(a, m0 + 2, ultimoDia(a, m0 + 2)), `${t}º trimestre/${a}`);
    }
    case "mes": {
      const [a, m] = ref ? ref.split("-").map(Number) : sel.atual ? [h.getFullYear(), h.getMonth() + 1] : [uf.a, uf.m];
      return cortar(iso(a, m, 1), iso(a, m, ultimoDia(a, m)), mesRot(a, m));
    }
    case "quinzena": {
      let a: number, m: number, q: number;
      if (ref) [a, m, q] = ref.split("-").map(Number);
      else {
        // A mais recente já terminada (ou a em andamento, se pedido).
        const d = h.getDate();
        if (sel.atual) { a = h.getFullYear(); m = h.getMonth() + 1; q = d <= 15 ? 1 : 2; }
        else if (d > 15) { a = h.getFullYear(); m = h.getMonth() + 1; q = 1; }
        else { a = uf.a; m = uf.m; q = 2; }
      }
      return cortar(iso(a, m, q === 1 ? 1 : 16), q === 1 ? iso(a, m, 15) : iso(a, m, ultimoDia(a, m)), `${q}ª quinzena de ${mesRot(a, m)}`);
    }
    case "semana": {
      const seg = ref ? segundaDa(ref) : segundaDa(somarDias(hoje, sel.atual ? 0 : -7));
      const dom = somarDias(seg, 6);
      return cortar(seg, dom, `semana de ${dataBR(seg)} a ${dataBR(dom)}`);
    }
    case "livre": {
      const [a, b] = ref.split("_");
      const ok = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
      const ini = ok(a) ? a : iso(uf.a, uf.m, 1), fim0 = ok(b) ? b : iso(uf.a, uf.m, ultimoDia(uf.a, uf.m));
      const [x, y] = ini <= fim0 ? [ini, fim0] : [fim0, ini];
      return cortar(x, y, `${dataBR(x)}/${x.slice(2, 4)} a ${dataBR(y)}/${y.slice(2, 4)}`);
    }
  }
}

/** O período anterior do mesmo tipo (out → set; T3 → T2; semana → semana anterior). */
export function anteriorDe(sel: SelecaoPeriodo, h = new Date()): SelecaoPeriodo {
  const i = intervaloDe(sel, h);
  const [a, m] = i.inicio.split("-").map(Number);
  const mesAntes = (aa: number, mm: number, n: number) => { const d = new Date(Date.UTC(aa, mm - 1 - n, 1)); return [d.getUTCFullYear(), d.getUTCMonth() + 1] as const; };
  switch (sel.tipo) {
    case "ano": return { tipo: "ano", ref: String(a - 1) };
    case "12m": { const [x, y] = mesAntes(a, m, 12); const f = mesAntes(a, m, 1); return { tipo: "livre", ref: `${iso(x, y, 1)}_${iso(f[0], f[1], ultimoDia(f[0], f[1]))}` }; }
    case "semestre": return { tipo: "semestre", ref: m === 1 ? `${a - 1}-2` : `${a}-1` };
    case "trimestre": { const [x, y] = mesAntes(a, m, 3); return { tipo: "trimestre", ref: `${x}-${Math.ceil(y / 3)}` }; }
    case "mes": { const [x, y] = mesAntes(a, m, 1); return { tipo: "mes", ref: `${x}-${p2(y)}` }; }
    case "quinzena": { const d = Number(i.inicio.slice(8)); if (d >= 16) return { tipo: "quinzena", ref: `${a}-${p2(m)}-1` }; const [x, y] = mesAntes(a, m, 1); return { tipo: "quinzena", ref: `${x}-${p2(y)}-2` }; }
    case "semana": return { tipo: "semana", ref: somarDias(i.inicio, -7) };
    case "livre": { const dias = Math.round((deISO(i.fim).getTime() - deISO(i.inicio).getTime()) / 864e5); const fim = somarDias(i.inicio, -1); return { tipo: "livre", ref: `${somarDias(fim, -dias)}_${fim}` }; }
  }
}

/** O mesmo período um ano antes (out/2026 → out/2025; T3/2026 → T3/2025). */
export function anoAnteriorDe(sel: SelecaoPeriodo, h = new Date()): SelecaoPeriodo {
  const i = intervaloDe(sel, h);
  const menos = (s: string) => {
    const [a, m, d] = s.split("-").map(Number);
    return iso(a - 1, m, Math.min(d, ultimoDia(a - 1, m)));
  };
  switch (sel.tipo) {
    case "ano": return { tipo: "ano", ref: String(Number(i.inicio.slice(0, 4)) - 1) };
    case "semestre": case "trimestre": { const [a, n] = (sel.ref ?? `${i.inicio.slice(0, 4)}-${sel.tipo === "semestre" ? (Number(i.inicio.slice(5, 7)) <= 6 ? 1 : 2) : Math.ceil(Number(i.inicio.slice(5, 7)) / 3)}`).split("-").map(Number); return { tipo: sel.tipo, ref: `${a - 1}-${n}` }; }
    case "mes": return { tipo: "mes", ref: menos(i.inicio).slice(0, 7) };
    case "quinzena": return { tipo: "quinzena", ref: `${menos(i.inicio).slice(0, 7)}-${Number(i.inicio.slice(8)) >= 16 ? 2 : 1}` };
    case "semana": return { tipo: "semana", ref: somarDias(i.inicio, -364) }; // mesma semana do ano (52 semanas antes)
    default: return { tipo: "livre", ref: `${menos(i.inicio)}_${menos(i.fim)}` };
  }
}

/**
 * Divide o intervalo em pontos do gráfico. Pontos que não cabem inteiros no
 * intervalo (a primeira e a última semana, por exemplo) são cortados nas datas
 * dele e marcados como parciais. No máximo MAX_PONTOS: ficam os mais recentes.
 */
export function fatiar(intv: Periodo, agrupar: Agrupar, hoje = new Date()): Fatia[] {
  const out: Fatia[] = [];
  const h = hojeISO(hoje);
  let cursor = intv.inicio;
  while (cursor <= intv.fim) {
    const [a, m, d] = cursor.split("-").map(Number);
    let ini: string, fim: string, rotulo: string, chave: string;
    if (agrupar === "mes") {
      ini = iso(a, m, 1); fim = iso(a, m, ultimoDia(a, m)); rotulo = mesRot(a, m); chave = ini.slice(0, 7);
    } else if (agrupar === "quinzena") {
      const q = d <= 15 ? 1 : 2;
      ini = iso(a, m, q === 1 ? 1 : 16); fim = q === 1 ? iso(a, m, 15) : iso(a, m, ultimoDia(a, m));
      rotulo = `${q}ª ${mesRot(a, m)}`; chave = `${ini.slice(0, 7)}-${q}`;
    } else {
      ini = segundaDa(cursor); fim = somarDias(ini, 6); rotulo = dataBR(ini); chave = ini;
    }
    const corteIni = ini < intv.inicio ? intv.inicio : ini;
    const corteFim = fim > intv.fim ? intv.fim : fim;
    out.push({ inicio: corteIni, fim: corteFim, chave, rotulo, parcial: corteIni !== ini || corteFim !== fim || fim > h, mesInteiro: agrupar === "mes" && corteIni === ini && corteFim === fim });
    cursor = somarDias(fim, 1);
  }
  return out.slice(-MAX_PONTOS);
}

/** Meses (AAAA-MM) cobertos por inteiro pelo intervalo; null se o intervalo não fecha em meses inteiros. */
export function mesesInteiros(p: Periodo): string[] | null {
  const [a1, m1, d1] = p.inicio.split("-").map(Number);
  const [a2, m2, d2] = p.fim.split("-").map(Number);
  if (d1 !== 1 || d2 !== ultimoDia(a2, m2)) return null;
  const out: string[] = [];
  for (let a = a1, m = m1; a < a2 || (a === a2 && m <= m2); m === 12 ? (a++, m = 1) : m++) out.push(`${a}-${p2(m)}`);
  return out;
}

/** Meta do intervalo: soma das metas mensais de faturamento; só para meses inteiros e todos com meta. */
export function metaDoIntervalo(p: Periodo, metas: Map<string, number>): number | null {
  const ms = mesesInteiros(p);
  if (!ms?.length || ms.some((m) => !metas.has(m))) return null;
  return ms.reduce((s, m) => s + metas.get(m)!, 0);
}

/** Endereço ⇄ seleção. */
export function selecaoDoEndereco(sp: { periodo?: string; ref?: string; atual?: string }): SelecaoPeriodo {
  const tipo = PERIODOS.some((p) => p.id === sp.periodo) ? (sp.periodo as TipoPeriodo) : "12m";
  return { tipo, ref: sp.ref || undefined, atual: sp.atual === "1" };
}

export const agruparDoEndereco = (v?: string): Agrupar => (v === "quinzena" || v === "semana" ? v : "mes");

/** Agrupamento que faz sentido para o período (um mês por semana; um ano por mês…). */
export function agruparSugerido(tipo: TipoPeriodo): Agrupar {
  return tipo === "mes" || tipo === "quinzena" || tipo === "semana" ? "semana" : "mes";
}

/** Dias corridos do intervalo (para avisar quando dois períodos têm tamanhos diferentes). */
export const diasDe = (p: Periodo) => Math.round((deISO(p.fim).getTime() - deISO(p.inicio).getTime()) / 864e5) + 1;
