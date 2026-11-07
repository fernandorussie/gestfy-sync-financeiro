/**
 * Vocabulário do cliente: as palavras que o relatório usa para quem compra,
 * quem atende e o que é vendido. O padrão é neutro (serve para qualquer
 * negócio); o segmento escolhido no Perfil do cliente traz um conjunto pronto,
 * que o consultor pode ajustar.
 */

export interface Vocabulario {
  /** Quem compra: cliente, paciente, lojista… */
  cliente: string;
  clientes: string;
  /** Quem atende: profissional, médico, dentista, loja… */
  profissional: string;
  profissionais: string;
  /** O que é vendido/realizado: serviço, procedimento, tratamento… */
  servico: string;
  servicos: string;
  /** Área de atuação: especialidade, linha de produto… */
  area: string;
  areas: string;
  /** Abertura do texto do fechamento ("Fala, Drs.!", "Olá, pessoal!"). */
  saudacao: string;
  /** Gênero de "quem atende", para concordância ("do profissional", "da loja"). */
  genero: "o" | "a";
}

export type SegmentoId = "clinica" | "odontologia" | "estetica" | "varejo" | "servicos" | "outro";

export const NEUTRO: Vocabulario = {
  cliente: "cliente", clientes: "clientes", profissional: "profissional", profissionais: "profissionais",
  servico: "serviço", servicos: "serviços", area: "área de atuação", areas: "áreas de atuação", saudacao: "Olá, pessoal!", genero: "o",
};

export const SEGMENTOS: { id: SegmentoId; rotulo: string; vocab: Vocabulario }[] = [
  { id: "clinica", rotulo: "Clínica médica", vocab: { ...NEUTRO, cliente: "paciente", clientes: "pacientes", profissional: "médico", profissionais: "médicos", servico: "procedimento", servicos: "procedimentos", area: "especialidade", areas: "especialidades", saudacao: "Fala, Drs.!" } },
  { id: "odontologia", rotulo: "Odontologia", vocab: { ...NEUTRO, cliente: "paciente", clientes: "pacientes", profissional: "dentista", profissionais: "dentistas", servico: "tratamento", servicos: "tratamentos", area: "especialidade", areas: "especialidades", saudacao: "Fala, Drs.!" } },
  { id: "estetica", rotulo: "Estética", vocab: { ...NEUTRO, servico: "procedimento", servicos: "procedimentos" } },
  { id: "varejo", rotulo: "Shopping / varejo", vocab: { ...NEUTRO, profissional: "loja", profissionais: "lojas", servico: "venda", servicos: "vendas", area: "segmento", areas: "segmentos", genero: "a" } },
  { id: "servicos", rotulo: "Serviços", vocab: NEUTRO },
  { id: "outro", rotulo: "Outro", vocab: NEUTRO },
];

export const CAMPOS_VOCAB: { k: Exclude<keyof Vocabulario, "genero">; rotulo: string }[] = [
  { k: "cliente", rotulo: "Quem compra (singular)" }, { k: "clientes", rotulo: "Quem compra (plural)" },
  { k: "profissional", rotulo: "Quem atende (singular)" }, { k: "profissionais", rotulo: "Quem atende (plural)" },
  { k: "servico", rotulo: "O que é vendido (singular)" }, { k: "servicos", rotulo: "O que é vendido (plural)" },
  { k: "area", rotulo: "Área de atuação (singular)" }, { k: "areas", rotulo: "Área de atuação (plural)" },
  { k: "saudacao", rotulo: "Saudação do texto" },
];

/** Adivinha o segmento pelo texto livre antigo da ficha ("Clínica de dermatologia"). */
export function segmentoDoTexto(texto: string): SegmentoId | "" {
  const t = texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (!t.trim()) return "";
  if (/odonto|dent/.test(t)) return "odontologia";
  if (/estetic|beleza|spa\b/.test(t)) return "estetica";
  if (/shopping|varejo|loja/.test(t)) return "varejo";
  if (/clinic|medic|saude|hospital|dermato|cardio|oftalmo|ortoped|cirurg|pediatr|ginec/.test(t)) return "clinica";
  return "";
}

/** Vocabulário final: preset do segmento + ajustes do consultor. Sem segmento: neutro. */
export function vocabularioDe(p: { segmentoTipo?: string; segmento?: string; vocabulario?: Partial<Vocabulario> } | null | undefined): Vocabulario {
  const id = (p?.segmentoTipo || segmentoDoTexto(p?.segmento ?? "")) as SegmentoId | "";
  const base = SEGMENTOS.find((s) => s.id === id)?.vocab ?? NEUTRO;
  const ajustes = Object.fromEntries(Object.entries(p?.vocabulario ?? {}).filter(([k, v]) => k !== "genero" && typeof v === "string" && v.trim()).map(([k, v]) => [k, k === "saudacao" ? (v as string).trim().slice(0, 40) : (v as string).trim().toLowerCase().slice(0, 40)]));
  return { ...base, ...ajustes };
}

/** Primeira letra maiúscula ("pacientes" → "Pacientes"). */
export const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);
