/**
 * Ficha da clínica: o que o Claude precisa saber do cliente além dos números.
 * Os atributos estruturados (cidade, UF, segmento, especialidades, modelo)
 * também preparam o benchmarking futuro entre clínicas.
 */

export type ModeloNegocio = "" | "particular" | "convenio" | "misto";

export interface FichaClinica {
  cidade: string;
  uf: string;
  segmento: string;
  especialidades: string;
  modelo: ModeloNegocio;
  perfil: string;
  prioridades: string;
  pessoas: string;
  estilo: string;
  evitar: string;
  atualizadoEm: string | null;
}

export const fichaVazia = (): FichaClinica => ({
  cidade: "", uf: "", segmento: "", especialidades: "", modelo: "", perfil: "", prioridades: "", pessoas: "", estilo: "", evitar: "", atualizadoEm: null,
});

export const MODELOS: Record<Exclude<ModeloNegocio, "">, string> = { particular: "Particular", convenio: "Convênio", misto: "Misto (particular e convênio)" };

export const LIMITES_FICHA: Record<Exclude<keyof FichaClinica, "atualizadoEm">, number> = {
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
    segmento: s(f?.segmento, LIMITES_FICHA.segmento),
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
  especialidades: ["ESPECIALIDADES"],
  modelo: ["MODELO"],
  perfil: ["PERFIL"],
  prioridades: ["PRIORIDADES"],
  pessoas: ["PESSOAS"],
  estilo: ["COMO ESCREVER"],
  evitar: ["ASSUNTOS A EVITAR", "EVITAR"],
} as const;

export function pedidoFicha(clinica: string): string {
  return [
    `Preciso de uma ficha da ${clinica} para o sistema de fechamentos financeiros da Gestfy.`,
    "Use tudo o que você sabe sobre a clínica neste projeto (instruções, arquivos e conversas).",
    "Regras: tópicos curtos e objetivos; não inclua dados de pacientes; se não souber um item, escreva \"não informado\".",
    "Responda somente neste formato, mantendo os títulos exatamente assim:",
    "",
    "### CIDADE/UF",
    "### SEGMENTO",
    "### ESPECIALIDADES",
    "### MODELO DE NEGÓCIO (particular, convênio ou misto)",
    "### PERFIL E POSICIONAMENTO",
    "### PRIORIDADES E METAS DO MOMENTO",
    "### PESSOAS E PAPÉIS (sócios, médicos, gestores, recepção, marketing)",
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
  return { ficha: limparFicha(ficha), achados };
}
