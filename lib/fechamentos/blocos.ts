/**
 * Catálogo único de blocos do relatório.
 *
 * Um bloco é cada card, lista ou tabela que pode aparecer numa seção. Ele é
 * definido uma vez aqui, com fonte, regra de cálculo e disponibilidade, e é
 * lido pelo editor de Estrutura, pelo PDF e pelo pacote do Claude. Os números
 * continuam vindo do motor (indicadores.ts); o catálogo só descreve e aponta.
 *
 * O que o usuário escolhe fica em ItemSecao.ocultos (blocos desligados).
 * Sem escolha salva, vale o padrão: blocos de detalhe somem no nível
 * "Resumo" (estruturas antigas) e o resto aparece.
 */
import type { Indicadores } from "./indicadores";

type Tipo = "mensal" | "quinzenal";

export interface DefBloco {
  id: string;
  secao: string;
  rotulo: string;
  /** De onde vem o número (nome da fonte, como na configuração). */
  fonte: string;
  /** Regra de cálculo, em linguagem simples. Vai para o editor e para o Claude. */
  regra: string;
  tipos?: Tipo[];
  /** Padrão mínimo Gestfy: não pode ser desligado. */
  obrigatorio?: boolean;
  /** Bloco de detalhe: fica fora no nível "Resumo". */
  detalhe?: boolean;
  /** Ligado no padrão? (padrão: sim) */
  padrao?: boolean;
  /** Há dados para este bloco? Sem função = sempre que a seção tiver dados. */
  disponivel?: (i: Indicadores) => boolean;
  /** Por que não há dados (mostrado no editor). */
  semDados?: string;
}

const temLista = (xs?: { nome: string }[]) => !!xs?.some((x) => x.nome !== "Não informado");

export const BLOCOS: DefBloco[] = [
  /* ---------- resultado ---------- */
  { id: "res.faturamento", secao: "resultado", rotulo: "Faturamento", fonte: "Vendas", regra: "Soma do valor pago pela data do atendimento, no período.", obrigatorio: true },
  { id: "res.entradas", secao: "resultado", rotulo: "Entradas (recebido)", fonte: "Entradas", regra: "Recebimentos operacionais + não operacionais pela data do recebimento. Transferências, empréstimos e aportes ficam fora.", tipos: ["mensal"], disponivel: (i) => !!i.entradas, semDados: "o cliente não tem a fonte de Entradas" },
  { id: "res.despesas", secao: "resultado", rotulo: "Despesas pagas", fonte: "Despesas", regra: "Soma das despesas pagas pela data de pagamento. Linhas marcadas como não pagas ficam fora.", tipos: ["mensal"], obrigatorio: true },
  { id: "res.resultado", secao: "resultado", rotulo: "Resultado de caixa / Faturamento x Despesas", fonte: "Entradas ou Vendas, e Despesas", regra: "Com a fonte de Entradas: entradas − despesas pagas (Resultado de caixa). Sem ela: faturamento − despesas pagas (Faturamento x Despesas).", tipos: ["mensal"], obrigatorio: true },
  { id: "res.meta", secao: "resultado", rotulo: "Atingimento da meta", fonte: "Vendas e meta do mês", regra: "Faturamento ÷ meta de faturamento do mês.", tipos: ["mensal"], disponivel: (i) => !!i.meta, semDados: "sem meta cadastrada no mês" },
  { id: "res.atendidos", secao: "resultado", rotulo: "Clientes atendidos", fonte: "Vendas", regra: "Nomes de cliente diferentes atendidos no período." },
  { id: "res.ticket", secao: "resultado", rotulo: "Ticket médio", fonte: "Vendas", regra: "Faturamento ÷ clientes atendidos." },
  { id: "res.novos", secao: "resultado", rotulo: "Clientes novos", fonte: "Vendas (coluna 1ª vez)", regra: "Clientes atendidos com \"1ª vez\" = Sim.", disponivel: (i) => !!i.pacientes?.temInformacaoDeNovos, semDados: "a fonte de Vendas não informa a 1ª vez" },
  { id: "res.ticketNovos", secao: "resultado", rotulo: "Ticket médio dos novos", fonte: "Vendas (coluna 1ª vez)", regra: "Faturamento dos clientes novos ÷ quantidade de novos.", tipos: ["mensal"], disponivel: (i) => !!i.pacientes?.temInformacaoDeNovos, semDados: "a fonte de Vendas não informa a 1ª vez" },

  /* ---------- funil de leads ---------- */
  { id: "leads.funil", secao: "funilLeads", rotulo: "Leads, agendados e conversão", fonte: "Leads", regra: "Leads com data de contato no período; conversão = agendados ÷ leads." },
  { id: "leads.servico", secao: "funilLeads", rotulo: "Serviço mais buscado", fonte: "Leads (interesse)", regra: "Leads do período por serviço ou queixa.", tipos: ["mensal"], detalhe: true, disponivel: (i) => temLista(i.leads?.porInteresse), semDados: "a fonte de Leads não tem coluna de interesse/serviço" },
  { id: "leads.origem", secao: "funilLeads", rotulo: "Origem do lead", fonte: "Leads (origem)", regra: "Leads do período por origem (como conheceu).", detalhe: true, disponivel: (i) => temLista(i.leads?.porOrigem), semDados: "a fonte de Leads não tem coluna de origem" },
  { id: "leads.canal", secao: "funilLeads", rotulo: "Canal de entrada", fonte: "Leads (canal)", regra: "Leads do período por canal (WhatsApp, ligação…).", tipos: ["mensal"], detalhe: true, disponivel: (i) => temLista(i.leads?.porCanal), semDados: "a fonte de Leads não tem coluna de canal" },
  { id: "leads.objecoes", secao: "funilLeads", rotulo: "Motivos de não agendamento", fonte: "Leads (objeção)", regra: "Objeções registradas nos leads do período (por que não agendaram).", detalhe: true, disponivel: (i) => temLista(i.leads?.porObjecao), semDados: "a fonte de Leads não tem coluna de objeção" },

  /* ---------- funil de orçamentos ---------- */
  { id: "orc.valor", secao: "funilOrcamentos", rotulo: "Orçamentos por valor", fonte: "Orçamentos", regra: "Valor gerado, fechado e em aberto; conversão em valor = valor fechado ÷ (valor gerado − cancelados)." },
  { id: "orc.quantidade", secao: "funilOrcamentos", rotulo: "Orçamentos por quantidade", fonte: "Orçamentos", regra: "Total, fechados, em aberto, não fecharam e cancelados; conversão = fechados ÷ (total − cancelados).", tipos: ["mensal"], detalhe: true },
  { id: "orc.status", secao: "funilOrcamentos", rotulo: "Por status", fonte: "Orçamentos (status)", regra: "Quantidade de orçamentos por status, como escrito na planilha.", tipos: ["mensal"], detalhe: true },
  { id: "orc.motivos", secao: "funilOrcamentos", rotulo: "Motivos de não fechamento", fonte: "Orçamentos (motivo)", regra: "Motivos registrados na própria fonte de orçamentos. Nunca usa as objeções dos leads.", detalhe: true, disponivel: (i) => temLista(i.orcamentos?.porObjecao), semDados: "a fonte de Orçamentos não tem coluna de motivo" },

  /* ---------- experiência ---------- */
  { id: "exp.nps", secao: "experiencia", rotulo: "NPS", fonte: "NPS", regra: "% de promotores (9–10) − % de detratores (0–6).", disponivel: (i) => !!i.nps, semDados: "sem fonte de NPS" },
  { id: "exp.profissional", secao: "experiencia", rotulo: "Nota do profissional", fonte: "NPS", regra: "Média das notas do profissional (0 a 5).", disponivel: (i) => i.nps?.notas.profissional != null, semDados: "a pesquisa não tem nota do profissional" },
  { id: "exp.recepcao", secao: "experiencia", rotulo: "Nota da recepção", fonte: "NPS", regra: "Média das notas da recepção (0 a 5).", disponivel: (i) => i.nps?.notas.recepcao != null, semDados: "a pesquisa não tem nota da recepção" },
  { id: "exp.infraestrutura", secao: "experiencia", rotulo: "Nota da infraestrutura", fonte: "NPS", regra: "Média das notas da infraestrutura (0 a 5).", disponivel: (i) => i.nps?.notas.infraestrutura != null, semDados: "a pesquisa não tem nota da infraestrutura" },
  { id: "exp.enfermagem", secao: "experiencia", rotulo: "Nota da enfermagem", fonte: "NPS", regra: "Média das notas da enfermagem (0 a 5).", disponivel: (i) => i.nps?.notas.enfermagem != null, semDados: "a pesquisa não tem nota da enfermagem" },
  { id: "exp.google", secao: "experiencia", rotulo: "Avaliações no Google", fonte: "Avaliações Google", regra: "Quantidade de avaliações no período e nota média.", disponivel: (i) => !!i.google, semDados: "sem fonte de avaliações do Google" },

  /* ---------- distribuição do faturamento ---------- */
  { id: "dist.profissional", secao: "distribuicao", rotulo: "Por profissional", fonte: "Vendas (profissional)", regra: "Faturamento do período por profissional, com participação.", disponivel: (i) => temLista(i.faturamento?.porProfissional), semDados: "a fonte de Vendas não informa o profissional" },
  { id: "dist.unidade", secao: "distribuicao", rotulo: "Por unidade", fonte: "Vendas (unidade)", regra: "Faturamento do período por unidade, com participação.", disponivel: (i) => temLista(i.faturamento?.porUnidade), semDados: "a fonte de Vendas não informa a unidade" },
  { id: "dist.pagamento", secao: "distribuicao", rotulo: "Meio de pagamento", fonte: "Vendas (meio de pagamento)", regra: "Faturamento do período por meio de pagamento (parcelas somadas).", disponivel: (i) => temLista(i.faturamento?.porPagamento), semDados: "a fonte de Vendas não informa o meio de pagamento" },
];

export const blocosDa = (secao: string, tipo: Tipo) => BLOCOS.filter((b) => b.secao === secao && (!b.tipos || b.tipos.includes(tipo)));
export const defBloco = (id: string) => BLOCOS.find((b) => b.id === id);
export const temBlocos = (secao: string) => BLOCOS.some((b) => b.secao === secao);

/** Escolha de blocos de uma seção (só os campos usados aqui). */
export interface EscolhaBlocos { id: string; nivel?: string; ocultos?: string[] }

/**
 * Blocos ligados numa seção. Com escolha salva (ocultos), vale ela; sem,
 * vale o padrão do catálogo e, nas estruturas antigas, o nível "Resumo".
 * Obrigatórios ficam sempre ligados.
 */
export function blocosLigados(it: EscolhaBlocos, tipo: Tipo, ctx: { real?: boolean } = {}): Set<string> {
  const out = new Set<string>();
  for (const b of blocosDa(it.id, tipo)) {
    let ligado: boolean;
    if (b.obrigatorio) ligado = true;
    else if (it.ocultos) ligado = !it.ocultos.includes(b.id);
    else if (b.detalhe && it.nivel === "resumo") ligado = false;
    // Relatório de antes: com Entradas, o ticket dos novos saía da primeira página (espaço).
    else if (b.id === "res.ticketNovos" && ctx.real) ligado = false;
    else ligado = b.padrao ?? true;
    if (ligado) out.add(b.id);
  }
  return out;
}

/** Ocultos válidos: só blocos existentes da seção e nunca os obrigatórios. */
export function limparOcultos(secao: string, v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const validos = new Set(BLOCOS.filter((b) => b.secao === secao && !b.obrigatorio).map((b) => b.id));
  return [...new Set(v.filter((x): x is string => typeof x === "string" && validos.has(x)))];
}

/** Blocos sem dados para este cliente (id → motivo), a partir dos indicadores mais recentes. */
export function indisponiveis(i: Indicadores | null | undefined): Record<string, string> {
  if (!i) return {};
  const out: Record<string, string> = {};
  for (const b of BLOCOS) {
    try { if (b.disponivel && !b.disponivel(i)) out[b.id] = b.semDados ?? "sem dados na fonte"; } catch { /* indicadores antigos */ }
  }
  return out;
}
