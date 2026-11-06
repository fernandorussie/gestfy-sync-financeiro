/**
 * Plano de contas padrão Gestfy para despesas: 10 grupos e suas categorias,
 * na ordem usada nos relatórios. Veio da planilha-mãe (aba Mensal, quadro
 * "Despesa detalhada"). Cada clínica pode acrescentar ou trocar vínculos
 * categoria → grupo no seu mapa, sem mexer neste padrão.
 */
import { normalizar } from "./texto";

export const GRUPOS_DESPESA: ReadonlyArray<{ grupo: string; categorias: readonly string[] }> = [
  { grupo: "Impostos, Taxas e afins", categorias: ["Simples Nacional", "ICMS", "ISS", "PIS", "COFINS", "REFIS", "IRPJ", "IRs Diversos", "CSLL", "IPTU", "INSS", "FGTS", "IPVA", "Vigilância Sanitária", "Taxas e Certificados", "Certificados/Certidões"] },
  { grupo: "Despesas Administrativas", categorias: ["Desp. Adm. Diversas", "Material de expediente e limpeza", "Assinaturas", "Uniformes", "Seguros", "Manutenções", "Obras e Construções", "Viagens", "Transporte (passagens, taxi, Uber, etc)", "Saúde Ocupacional", "Segurança e afins"] },
  { grupo: "Despesas Operacionais", categorias: ["Desp. Oper. Diversas", "Repasse para Prestadores de Serviços Clínicos", "Devoluções", "Sistemas de Gestão", "Material Clínico", "Coleta de Resíduos", "Benefícios para Pacientes", "Comissão por Indicação", "Locomoção outras unidades"] },
  { grupo: "Infraestrutura", categorias: ["Aluguel", "Condomínio", "Luz", "Internet", "Telefone", "Água"] },
  { grupo: "Serviços Terceirizados", categorias: ["Limpeza", "Contabilidade", "Jurídico", "Consultorias, Assessorias e Mentorias", "Cursos, Treinamentos e Workshops", "Gestão", "Prestador de Serviços", "Serviço de Office-Boy"] },
  { grupo: "Pessoal", categorias: ["Pró-Labore", "Salários", "Férias", "Vale Transporte e Bilhete Único", "Vale Alimentação", "Rescisões", "Acordos Trabalhistas", "Assistência Médica/Odontológica", "Recrutamento de Colaboradores", "Bonificações e Comissões", "Benefícios Diversos"] },
  { grupo: "Marketing", categorias: ["Social Media", "Gestor de Tráfego", "Tráfego Pago", "Serviços Digitais", "Brindes", "Marketing Visual", "Experiência do Cliente"] },
  { grupo: "Despesas Financeiras", categorias: ["Despesas Bancárias", "Empréstimos e Consórcios", "Descontos Concedidos", "Taxas de Adm. de Cartão"] },
  { grupo: "Imobilizado", categorias: ["Veículos", "Imóveis", "Móveis e Utensílios", "Máquinas e Equipamentos", "Computadores e afins", "Ferramentas"] },
  { grupo: "Estoque de Mercadorias", categorias: ["Estoque de Mercadorias"] },
];

export const GRUPO_SEM_CLASSIFICACAO = "Sem grupo";

/**
 * Categoria → grupo, juntando o padrão e o que a clínica configurou.
 * As chaves são normalizadas: "SALÁRIOS" e "Salários" caem no mesmo lugar.
 */
export function montarPlano(extras: Record<string, string> = {}): {
  grupoDe: (categoria: string) => string | null;
  /** Grafia oficial da categoria (a do padrão, quando existe). */
  nomeDe: (categoria: string) => string;
  ordemGrupo: (grupo: string) => number;
  grupoDaCategoriaPadrao: (categoria: string) => string | null;
} {
  const mapa = new Map<string, { grupo: string; nome: string }>();
  for (const g of GRUPOS_DESPESA) for (const c of g.categorias) mapa.set(normalizar(c), { grupo: g.grupo, nome: c });
  for (const [cat, grupo] of Object.entries(extras)) {
    const atual = mapa.get(normalizar(cat));
    mapa.set(normalizar(cat), { grupo, nome: atual?.nome ?? cat });
  }
  const ordem = new Map(GRUPOS_DESPESA.map((g, i) => [g.grupo, i]));
  return {
    grupoDe: (c) => mapa.get(normalizar(c))?.grupo ?? null,
    nomeDe: (c) => mapa.get(normalizar(c))?.nome ?? c,
    ordemGrupo: (g) => ordem.get(g) ?? 99,
    grupoDaCategoriaPadrao: (c) => {
      for (const g of GRUPOS_DESPESA) if (g.categorias.some((x) => normalizar(x) === normalizar(c))) return g.grupo;
      return null;
    },
  };
}

/**
 * Pistas na descrição que indicam a categoria certa. Usadas pela conferência
 * para apontar lançamentos que parecem estar no grupo errado.
 */
export const PISTAS_CATEGORIA: ReadonlyArray<{ padrao: RegExp; categoria: string }> = [
  { padrao: /\b(rescis|recis)/, categoria: "Rescisões" },
  { padrao: /\bferias\b/, categoria: "Férias" },
  { padrao: /\b(salario|salarios)\b/, categoria: "Salários" },
  { padrao: /\bpro[ -]?labore\b/, categoria: "Pró-Labore" },
  { padrao: /\b(trafego pago|google ads|meta ads|facebook ads|impulsionamento)\b/, categoria: "Tráfego Pago" },
  { padrao: /\bsocial media\b/, categoria: "Social Media" },
  { padrao: /\b(editor de video|edicao de video)\b/, categoria: "Serviços Digitais" },
];
