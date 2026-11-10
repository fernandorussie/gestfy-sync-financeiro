/**
 * Conversões de célula de planilha → valor tipado.
 *
 * As planilhas das clínicas chegam de jeitos diferentes: data como texto
 * "01/10/2026", como ISO "2026-10-29T12:31:38Z" ou como número de série do
 * Sheets; valor como 400, "R$ 1.234,56" ou "1234.56". Tudo passa por aqui.
 */

export type Celula = string | number | boolean | null | undefined;

/** Data no formato ISO curto (AAAA-MM-DD), sem fuso. */
export type DataISO = string;

/** Minúsculas, sem acento, sem pontuação nas pontas e com espaços simples. */
export function normalizar(valor: Celula): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.\s]+/g, " ")
    .replace(/\s*([/:,;])\s*/g, "$1")
    .trim();
}

/** Erros de fórmula do Sheets (#N/A, #REF!…) contam como célula vazia. */
export function ehErroDeFormula(valor: Celula): boolean {
  return typeof valor === "string" && /^#(N\/A|REF!|VALUE!|DIV\/0!|ERROR!|NAME\?|NUM!|NULL!)$/i.test(valor.trim());
}

/** Texto da célula sem espaços sobrando (mantém a grafia original). */
export function textoLimpo(valor: Celula): string {
  if (ehErroDeFormula(valor)) return "";
  return String(valor ?? "").replace(/\s+/g, " ").trim();
}

const EPOCA_SHEETS = Date.UTC(1899, 11, 30);

function iso(ano: number, mes: number, dia: number): DataISO | null {
  if (!ano || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCMonth() !== mes - 1) return null; // 31/02 e afins
  return d.toISOString().slice(0, 10);
}

/**
 * Lê uma data em qualquer formato usado nas planilhas.
 * Retorna null quando a célula está vazia ou não é uma data.
 */
export function lerData(valor: Celula): DataISO | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") {
    if (valor < 20000 || valor > 80000) return null; // fora de 1954–2119: não é data
    return new Date(EPOCA_SHEETS + Math.floor(valor) * 86400000).toISOString().slice(0, 10);
  }
  const s = String(valor).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return iso(ano, Number(m[2]), Number(m[1]));
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

/**
 * Lê um valor em reais. Aceita número, "R$ 1.234,56", "1.234,56", "1234,56",
 * "1234.56" e negativos ("-R$ 10,00" ou "(10,00)").
 * Retorna null quando a célula está vazia ou não é número.
 */
export function lerValor(valor: Celula): number | null {
  if (valor === null || valor === undefined || valor === "" || ehErroDeFormula(valor)) return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  let s = String(valor).trim();
  if (!s) return null;
  // Formato contábil do Sheets: "R$ -" = zero.
  if (/^(R\$)?\s*-\s*$/.test(s)) return 0;
  let negativo = false;
  if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1); }
  if (s.includes("-")) { negativo = true; s = s.replace(/-/g, ""); }
  s = s.replace(/R\$|\s/g, "");
  if (!/^[\d.,]+$/.test(s)) return null;
  let normal: string;
  if (s.includes(",")) {
    normal = s.replace(/\./g, "").replace(",", ".");
  } else {
    const partes = s.split(".");
    normal = partes.length === 2 && partes[1].length <= 2 ? s : s.replace(/\./g, "");
  }
  const v = Number(normal);
  if (!Number.isFinite(v)) return null;
  return negativo ? -v : v;
}

/** "Sim", "S", "X", "1", "true" → true; "Não", "N", "0" → false; resto → null. */
export function lerSimNao(valor: Celula): boolean | null {
  const s = normalizar(valor);
  if (!s) return null;
  if (/^(sim|s|x|1|true|yes|y)$/.test(s)) return true;
  if (/^(nao|n|0|false|no)$/.test(s)) return false;
  return null;
}

/**
 * Situação de pagamento ou recebimento: true = pago/recebido, false = em aberto
 * ou previsto, null = não informado ou desconhecido. Aceita "Sim/Não" e os
 * nomes de sistemas financeiros (Quitado, Recebido, Em aberto, Pendente…).
 */
export function lerSituacao(valor: Celula): boolean | null {
  const sn = lerSimNao(valor);
  if (sn !== null) return sn;
  const s = normalizar(valor);
  if (!s) return null;
  if (/^(pago|paga|quitad[oa]|recebid[oa]|liquidad[oa]|realizad[oa]|baixad[oa]|confirmad[oa]|compensad[oa]|ok)$/.test(s)) return true;
  if (/^(em aberto|aberto|aberta|pendente|a pagar|a receber|atrasad[oa]|vencid[oa]|previst[oa]|agendad[oa]|cancelad[oa]|estornad[oa])$/.test(s)) return false;
  return null;
}

/** Letra de coluna ("A", "AB") → índice começando em 0. */
export function indiceDaLetra(letra: string): number {
  let idx = 0;
  for (const ch of letra.trim().toUpperCase()) {
    if (ch < "A" || ch > "Z") return -1;
    idx = idx * 26 + (ch.charCodeAt(0) - 64);
  }
  return idx - 1;
}

/** Índice começando em 0 → letra de coluna. */
export function letraDoIndice(idx: number): string {
  let n = idx + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Arredonda para centavos, evitando lixo de ponto flutuante nas somas. */
export function centavos(v: number): number {
  return Math.round(v * 100) / 100;
}
