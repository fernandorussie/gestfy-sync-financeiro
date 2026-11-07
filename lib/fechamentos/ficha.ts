/**
 * Perfil do cliente (antes "ficha da clínica"): o que o Claude precisa saber do
 * cliente além dos números, o segmento e o vocabulário do relatório.
 * Os atributos estruturados (cidade, UF, segmento, áreas de atuação, modelo,
 * porte) também preparam o benchmarking futuro entre clientes.
 * O nome do tipo continua FichaClinica para não mexer no banco (coluna "ficha").
 */
import { SEGMENTOS, segmentoDoTexto, type SegmentoId, type Vocabulario } from "./vocabulario";

export type ModeloNegocio = "" | "particular" | "convenio" | "misto";
export type Porte = "" | "ate50" | "50a150" | "150a400" | "400a1000" | "acima1000";

export const PORTES: Record<Exclude<Porte, "">, string> = {
  ate50: "Até R$ 50 mil/mês", "50a150": "R$ 50 a 150 mil/mês", "150a400": "R$ 150 a 400 mil/mês", "400a1000": "R$ 400 mil a 1 milhão/mês", acima1000: "Acima de R$ 1 milhão/mês",
};

/** Faixa de porte pelo faturamento médio mensal (base para o benchmarking). */
export function porteDoFaturamento(media: number | null | undefined): Porte {
  if (!media || media <= 0) return "";
  if (media < 50_000) return "ate50";
  if (media < 150_000) return "50a150";
  if (media < 400_000) return "150a400";
  if (media < 1_000_000) return "400a1000";
  return "acima1000";
}

export interface FichaClinica {
  cidade: string;
  uf: string;
  /** Tipo de negócio (define o vocabulário padrão). */
  segmentoTipo: SegmentoId | "";
  /** Descrição livre do segmento ("Clínica de dermatologia"). */
  segmento: string;
  /** Áreas de atuação (especialidades, linhas de produto…). */
  especialidades: string;
  /** Ajustes nas palavras do relatório (vazio = as do segmento). */
  vocabulario: Partial<Vocabulario>;
  /** Porte informado; vazio = calculado pelo faturamento quando precisar. */
  porte: Porte;
  modelo: ModeloNegocio;
  perfil: string;
  prioridades: string;
  pessoas: string;
  estilo: string;
  evitar: string;
  atualizadoEm: string | null;
}

export const fichaVazia = (): FichaClinica => ({
  cidade: "", uf: "", segmentoTipo: "", segmento: "", especialidades: "", vocabulario: {}, porte: "", modelo: "", perfil: "", prioridades: "", pessoas: "", estilo: "", evitar: "", atualizadoEm: null,
});

export const MODELOS: Record<Exclude<ModeloNegocio, "">, string> = { particular: "Particular", convenio: "Convênio", misto: "Misto (particular e convênio)" };

export const LIMITES_FICHA: Record<Exclude<keyof FichaClinica, "atualizadoEm" | "segmentoTipo" | "vocabulario" | "porte">, number> = {
  cidade: 80, uf: 2, segmento: 120, especialidades: 400, modelo: 12, perfil: 3000, prioridades: 3000, pessoas: 2000, estilo: 1500, evitar: 1500,
};

export function limparFicha(f: Partial<FichaClinica> | null | undefined): FichaClinica {
  const base = fichaVazia();
  const s = (v: unknown, n: number) => String(v ?? "").slice(0, n);
  const modelo = (["particular", "convenio", "misto"] as const).find((m) => m === f?.modelo) ?? "";
  return {
    ...base,
    cidade: s(f?.cidade, LIMITES_FICHA.cidade).trim(),
    uf: s(f?.uf, 2).toUpperCase().replace(/[^A-Z]/g, ""),
    segmentoTipo: SEGMENTOS.find((x) => x.id === f?.segmentoTipo)?.id ?? "",
    segmento: s(f?.segmento, LIMITES_FICHA.segmento),
    vocabulario: Object.fromEntries(Object.entries((f?.vocabulario ?? {}) as Record<string, unknown>).filter(([k, v]) => k !== "genero" && typeof v === "string" && v.trim()).map(([k, v]) => [k, s(v, 40).trim()])),
    porte: (Object.keys(PORTES) as Porte[]).find((x) => x === f?.porte) ?? "",
    especialidades: s(f?.especialidades, LIMITES_FICHA.especialidades),
    modelo,
    perfil: s(f?.perfil, LIMITES_FICHA.perfil),
    prioridades: s(f?.prioridades, LIMITES_FICHA.prioridades),
    pessoas: s(f?.pessoas, LIMITES_FICHA.pessoas),
    estilo: s(f?.estilo, LIMITES_FICHA.estilo),
    evitar: s(f?.evitar, LIMITES_FICHA.evitar),
    atualizadoEm: typeof f?.atualizadoEm === "string" ? f.atualizadoEm : null,
  };
}

export const fichaPreenchida = (f: FichaClinica) => [f.perfil, f.prioridades, f.pessoas, f.estilo, f.especialidades, f.segmento].some((x) => x.trim());

/* ---------- seções marcadas ("### TÍTULO") ---------- */

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Separa um texto em seções pelos títulos marcados. Aceita "### Título",
 * "## Título", "**Título**" ou "TÍTULO:" sozinhos na linha, com ou sem acento.
 * `rotulos`: para cada chave, os começos de título aceitos (já sem acento).
 */
export function separarSecoes<K extends string>(texto: string, rotulos: Record<K, string[]>): { secoes: Partial<Record<K, string>>; fora: string } {
  const secoes: Partial<Record<K, string>> = {};
  let atual: K | null = null;
  const fora: string[] = [];
  const buffer: Partial<Record<K, string[]>> = {};
  for (const linha of texto.replace(/\r/g, "").split("\n")) {
    const m = linha.match(/^\s*(?:#{1,4}\s*|\*\*)([^*#]+?)(?:\*\*)?\s*:?\s*$/) ?? linha.match(/^\s*([A-ZÀ-Ú][A-ZÀ-Ú0-9 /,()-]{3,}):\s*$/);
    const titulo = m ? norm(m[1]) : "";
    const chave = titulo ? (Object.keys(rotulos) as K[]).find((k) => rotulos[k].some((r) => titulo.startsWith(r))) : undefined;
    if (chave) { atual = chave; buffer[chave] = buffer[chave] ?? []; continue; }
    if (atual) buffer[atual]!.push(linha); else fora.push(linha);
  }
  for (const k of Object.keys(buffer) as K[]) {
    const t = buffer[k]!.join("\n").trim();
    if (t) secoes[k] = t;
  }
  return { secoes, fora: fora.join("\n").trim() };
}

/* ---------- pedido para o Claude preencher a ficha ---------- */

const ROTULOS_FICHA = {
  local: ["CIDADE"],
  segmento: ["SEGMENTO"],
  especialidades: ["AREAS DE ATUACAO", "ESPECIALIDADES"],
  modelo: ["MODELO"],
  perfil: ["PERFIL"],
  prioridades: ["PRIORIDADES"],
  pessoas: ["PESSOAS"],
  estilo: ["COMO ESCREVER"],
  evitar: ["ASSUNTOS A EVITAR", "EVITAR"],
} as const;

export function pedidoFicha(cliente: string): string {
  return [
    `Preciso do perfil do cliente ${cliente} para o sistema de fechamentos financeiros da Gestfy.`,
    "Use tudo o que você sabe sobre este cliente neste projeto (instruções, arquivos e conversas).",
    "Regras: tópicos curtos e objetivos; não inclua dados pessoais dos clientes dele; se não souber um item, escreva \"não informado\".",
    "Responda somente neste formato, mantendo os títulos exatamente assim:",
    "",
    "### CIDADE/UF",
    "### SEGMENTO (tipo de negócio)",
    "### ÁREAS DE ATUAÇÃO (especialidades, linhas de serviço ou produto)",
    "### MODELO DE NEGÓCIO (para saúde: particular, convênio ou misto; outros negócios: descreva em uma linha)",
    "### PERFIL E POSICIONAMENTO",
    "### PRIORIDADES E METAS DO MOMENTO",
    "### PESSOAS E PAPÉIS (sócios, gestores, equipe, marketing)",
    "### COMO ESCREVER PARA ESTE CLIENTE (tom, tratamento, o que valorizam)",
    "### ASSUNTOS A EVITAR",
  ].join("\n");
}

/** Lê a ficha que o Claude devolveu. Itens "não informado" ficam em branco. */
export function lerFichaGerada(texto: string, atual: FichaClinica): { ficha: FichaClinica; achados: number } {
  const { secoes } = separarSecoes(texto, ROTULOS_FICHA as unknown as Record<keyof typeof ROTULOS_FICHA, string[]>);
  const v = (t?: string) => (t && !/^n[aã]o informado\.?$/i.test(t.trim()) ? t.trim() : "");
  const ficha = { ...atual };
  let achados = 0;
  const local = v(secoes.local);
  if (local) {
    achados++;
    const m = local.match(/^(.*?)[\s/,-]+([A-Za-z]{2})\.?$/);
    if (m) { ficha.cidade = m[1].replace(/^[-•\s]+/, "").trim(); ficha.uf = m[2].toUpperCase(); } else ficha.cidade = local;
  }
  const modelo = norm(v(secoes.modelo));
  if (modelo) { achados++; ficha.modelo = modelo.includes("MISTO") || (modelo.includes("PARTICULAR") && modelo.includes("CONVENIO")) ? "misto" : modelo.includes("CONVENIO") ? "convenio" : modelo.includes("PARTICULAR") ? "particular" : ficha.modelo; }
  for (const k of ["segmento", "especialidades", "perfil", "prioridades", "pessoas", "estilo", "evitar"] as const) {
    const t = v(secoes[k]);
    if (t) { ficha[k] = t; achados++; }
  }
  if (!ficha.segmentoTipo && ficha.segmento) ficha.segmentoTipo = segmentoDoTexto(ficha.segmento);
  return { ficha: limparFicha(ficha), achados };
}
