import { readSheetRange } from "@/lib/google/sheets";
import type { FonteDados, Json } from "@/lib/supabase/types";

export interface NotaCount {
  nota: number;
  count: number;
}

export interface Indicacao {
  texto_indicacao: string;  // conteúdo bruto da célula
  indicado_por: string;     // nome do respondente (já resolvido com privacidade)
  nome_indicado: string;    // nome extraído do texto (vazio se usa_bruto)
  numero: string;           // telefone formatado (vazio se usa_bruto)
  usa_bruto: boolean;       // true = não foi possível separar, exibir texto_indicacao direto
}

export interface ComentarioNPS {
  nome: string;        // já resolvido pela regra de privacidade
  comentario: string;
  nota: number | null; // nota geral (0–10) da resposta, quando mapeada
}

export interface ResultadoNPS {
  total: number;
  notas_gerais: NotaCount[];
  classificacao: { promotores: number; neutros: number; detratores: number };
  nps_score: number;
  medias_por_area: {
    profissional: number | null;
    recepcao: number | null;
    infraestrutura: number | null;
    enfermagem: number | null;
  };
  /** Todos os comentários não vazios do período, com a nota geral quando houver. */
  comentarios: ComentarioNPS[];
  indicacoes: Indicacao[];
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

function parseNota(v: string): number | null {
  const s = v.trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

function mediaValida(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null);
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/**
 * Tenta extrair um telefone brasileiro do texto da indicação.
 *
 * Formatos reconhecidos (DDD de 2 dígitos + 8 ou 9 dígitos):
 *   62 981410165  |  (62) 98141-0165  |  62981410165
 *   62 9814-1016  |  (62)9814-1016    |  11 3456-7890
 *
 * Se não encontrar um número com 10 ou 11 dígitos, retorna usa_bruto=true
 * e todo o texto deve ser exibido sem cortes.
 */
export function parseTelefoneIndicacao(texto: string): Pick<Indicacao, "nome_indicado" | "numero" | "usa_bruto"> {
  // Padrão: opcional ( DDD ) + espaços + 4-5 dígitos + separador opcional + 4 dígitos
  const phoneRe = /\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4}/;
  const match = texto.match(phoneRe);

  if (match) {
    const phonePart = match[0];
    const digits = phonePart.replace(/\D/g, "");

    let formatted = "";
    if (digits.length === 11) {
      formatted = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    } else if (digits.length === 10) {
      formatted = `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }

    if (formatted) {
      const start = match.index!;
      const rest = (texto.slice(0, start) + texto.slice(start + phonePart.length)).trim();
      return { nome_indicado: rest, numero: formatted, usa_bruto: false };
    }
  }

  return { nome_indicado: "", numero: "", usa_bruto: true };
}

/**
 * Verifica se o texto da coluna de anonimato indica que o paciente
 * pediu sigilo. Normaliza acentos e capitalização antes de comparar.
 */
export function isAnonimoTexto(texto: string): boolean {
  const normalizado = texto
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  return normalizado.includes("anonimato") || normalizado.includes("anonimo");
}

/**
 * Resolve o nome a exibir no comentário:
 * - Se a coluna de anonimato NÃO está mapeada: usa o nome como está (retrocompatível).
 * - Se está mapeada:
 *   - Valor vazio → anônimo (conservador: na dúvida, protege o paciente).
 *   - Valor contém "anonimato" ou "anonimo" → anônimo.
 *   - Qualquer outro valor não vazio → exibe o nome normalmente.
 */
export function resolverNomePaciente(
  anonimatoColMapeada: boolean,
  anonimatoVal: string,
  nomeOriginal: string
): string {
  if (anonimatoColMapeada) {
    const val = anonimatoVal.trim();
    const isAnon = val === "" || isAnonimoTexto(val);
    return isAnon ? "Paciente (anônimo)" : (nomeOriginal || "Paciente");
  }
  return nomeOriginal || "Paciente";
}

export async function coletarNPS(
  fonte: FonteDados,
  dataInicio: Date,
  dataFim: Date
): Promise<ResultadoNPS> {
  const mapeamento = getMapeamento(fonte.mapeamento);
  const rows = await readSheetRange(fonte.sheet_id, `${fonte.aba_nome}!A:Z`);

  const dataIdx = colIndex(fonte.coluna_data);
  const idx = (key: string) => (mapeamento[key] ? colIndex(mapeamento[key]) : -1);
  const notaGeralIdx      = idx("nota_geral");
  const notaProfIdx       = idx("nota_profissional");
  const notaRecIdx        = idx("nota_recepcao");
  const notaInfraIdx      = idx("nota_infraestrutura");
  const notaEnfIdx        = idx("nota_enfermagem");
  const comentIdx         = idx("comentario");
  const nomeIdx           = idx("nome_paciente");
  const anonimatoIdx      = idx("anonimato");
  const indicacaoIdx      = idx("indicacao");

  const iniMs = new Date(dataInicio.getFullYear(), dataInicio.getMonth(), dataInicio.getDate()).getTime();
  const fimMs = new Date(dataFim.getFullYear(), dataFim.getMonth(), dataFim.getDate()).getTime();

  const filtered = rows.slice(1).filter((row) => {
    const d = parseSheetDate(String(row[dataIdx] ?? ""));
    if (!d) return false;
    const t = d.getTime();
    return t >= iniMs && t <= fimMs;
  });

  const notasGerais: number[] = [];
  const notasProf: (number | null)[] = [];
  const notasRec: (number | null)[] = [];
  const notasInfra: (number | null)[] = [];
  const notasEnf: (number | null)[] = [];
  const comentarios: ComentarioNPS[] = [];
  const indicacoes: Indicacao[] = [];

  let promotores = 0,
    neutros = 0,
    detratores = 0;

  for (const row of filtered) {
    let notaLinha: number | null = null;
    if (notaGeralIdx >= 0) {
      const ng = parseNota(String(row[notaGeralIdx] ?? ""));
      if (ng !== null) {
        notaLinha = ng;
        notasGerais.push(ng);
        if (ng >= 9) promotores++;
        else if (ng >= 7) neutros++;
        else detratores++;
      }
    }
    if (notaProfIdx >= 0) notasProf.push(parseNota(String(row[notaProfIdx] ?? "")));
    if (notaRecIdx >= 0) notasRec.push(parseNota(String(row[notaRecIdx] ?? "")));
    if (notaInfraIdx >= 0) notasInfra.push(parseNota(String(row[notaInfraIdx] ?? "")));
    if (notaEnfIdx >= 0) notasEnf.push(parseNota(String(row[notaEnfIdx] ?? "")));

    // Comentários: só descarta os vazios. O corte por relevância é de quem consome.
    if (comentIdx >= 0) {
      const comentario = String(row[comentIdx] ?? "").trim();
      if (comentario.length > 0) {
        const nomeOriginal = nomeIdx >= 0 ? String(row[nomeIdx] ?? "").trim() : "";
        const anonimatoVal = anonimatoIdx >= 0 ? String(row[anonimatoIdx] ?? "") : "";
        const nome = resolverNomePaciente(anonimatoIdx >= 0, anonimatoVal, nomeOriginal);
        comentarios.push({ nome, comentario, nota: notaLinha });
      }
    }

    // Indicações
    if (indicacaoIdx >= 0) {
      const textoInd = String(row[indicacaoIdx] ?? "").trim();
      if (textoInd) {
        const nomeOriginal = nomeIdx >= 0 ? String(row[nomeIdx] ?? "").trim() : "";
        const anonimatoVal = anonimatoIdx >= 0 ? String(row[anonimatoIdx] ?? "") : "";
        const indicado_por = resolverNomePaciente(anonimatoIdx >= 0, anonimatoVal, nomeOriginal);
        const parsed = parseTelefoneIndicacao(textoInd);
        indicacoes.push({
          texto_indicacao: textoInd,
          indicado_por,
          ...parsed,
        });
      }
    }
  }

  const notaMap = new Map<number, number>();
  for (const n of notasGerais) notaMap.set(n, (notaMap.get(n) ?? 0) + 1);
  const notas_gerais: NotaCount[] = Array.from(notaMap.entries())
    .map(([nota, count]) => ({ nota, count }))
    .sort((a, b) => b.nota - a.nota);

  const nps_score =
    notasGerais.length > 0
      ? Math.round(((promotores - detratores) / notasGerais.length) * 100)
      : 0;

  return {
    total: filtered.length,
    notas_gerais,
    classificacao: { promotores, neutros, detratores },
    nps_score,
    medias_por_area: {
      profissional: mediaValida(notasProf),
      recepcao: mediaValida(notasRec),
      infraestrutura: mediaValida(notasInfra),
      enfermagem: mediaValida(notasEnf),
    },
    comentarios,
    indicacoes,
  };
}
