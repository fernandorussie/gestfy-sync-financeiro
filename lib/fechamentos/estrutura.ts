/**
 * Estrutura do relatório: quais seções aparecem, em que ordem e com que nível
 * de detalhe. Cada clínica guarda a sua (fechamento_config.relatorio); sem
 * configuração, vale o padrão Gestfy, igual ao relatório de sempre.
 * Seções "fixas" formam o padrão mínimo Gestfy: não podem ser ocultadas.
 */

export type TipoRelatorio = "mensal" | "quinzenal";

export interface NivelSecao { id: string; rotulo: string }

export interface DefSecao {
  id: string;
  titulo: string;
  descricao: string;
  tipos: TipoRelatorio[];
  /** Padrão mínimo Gestfy: sempre ligada. */
  fixa?: boolean;
  /** Começa sempre numa página nova (tabelas longas, análise). */
  grande?: boolean;
  niveis?: NivelSecao[];
  nivelPadrao?: Partial<Record<TipoRelatorio, string>>;
  /** Ligada no padrão? (padrão: sim) */
  ativaPadrao?: boolean;
}

export interface ItemSecao { id: string; ativa: boolean; nivel?: string }
export type EstruturaRelatorio = Partial<Record<TipoRelatorio, ItemSecao[]>>;

const RESUMO_COMPLETO = (completo: string): NivelSecao[] => [{ id: "resumo", rotulo: "Resumo" }, { id: "completo", rotulo: completo }];

/** Catálogo na ordem do padrão Gestfy. */
export const CATALOGO: DefSecao[] = [
  { id: "resultado", titulo: "Resultado do período", descricao: "Boxes com faturamento, despesas, resultado, meta, pacientes e tickets", tipos: ["mensal", "quinzenal"], fixa: true },
  { id: "grafico", titulo: "Gráfico de faturamento e despesas", descricao: "Linhas do ano, mês a mês", tipos: ["mensal"] },
  { id: "ritmo", titulo: "Ritmo do mês", descricao: "Faturamento por dia útil, projeção e quanto falta para a meta", tipos: ["quinzenal"], fixa: true },
  { id: "caixaMes", titulo: "Caixa do mês", descricao: "Despesas pagas, média de 3 meses, provisionado e saldo projetado", tipos: ["quinzenal"] },
  { id: "funilLeads", titulo: "Funil de leads", descricao: "Leads, agendamentos e conversão", tipos: ["mensal", "quinzenal"], niveis: RESUMO_COMPLETO("Com origem dos leads"), nivelPadrao: { mensal: "completo", quinzenal: "resumo" } },
  { id: "funilOrcamentos", titulo: "Funil de orçamentos", descricao: "Gerados, fechados, em negociação e conversão", tipos: ["mensal", "quinzenal"], niveis: RESUMO_COMPLETO("Com principais objeções"), nivelPadrao: { mensal: "completo", quinzenal: "resumo" } },
  { id: "experiencia", titulo: "Experiência do paciente", descricao: "NPS, notas e avaliações no Google", tipos: ["mensal"] },
  { id: "receitas", titulo: "Receitas detalhadas", descricao: "Categorias com valor, quantidade, ticket e variação", tipos: ["mensal", "quinzenal"], fixa: true, grande: true,
    niveis: [{ id: "com_valor", rotulo: "Só categorias com movimento" }, { id: "todas", rotulo: "Todas as categorias (12 meses)" }], nivelPadrao: { mensal: "todas", quinzenal: "todas" } },
  { id: "despesas", titulo: "Despesas detalhadas", descricao: "Grupos e categorias, com o que mais aumentou", tipos: ["mensal"], fixa: true, grande: true,
    niveis: [{ id: "grupos", rotulo: "Só grupos" }, { id: "categorias", rotulo: "Grupos e categorias" }], nivelPadrao: { mensal: "categorias" } },
  { id: "regimes", titulo: "Caixa e competência no ano", descricao: "Entradas, saídas e saldo mês a mês", tipos: ["mensal"], grande: true,
    niveis: [{ id: "caixa", rotulo: "Só regime de caixa" }, { id: "ambos", rotulo: "Caixa e competência" }], nivelPadrao: { mensal: "ambos" } },
  { id: "analise", titulo: "Análise e plano de ação", descricao: "Texto do fechamento e ações com responsáveis", tipos: ["mensal", "quinzenal"], grande: true, ativaPadrao: false },
];

/** Fonte personalizada cadastrada na clínica: vira uma seção "fonte:<id>". */
export interface ExtraSecao { id: string; nome: string }
export const idFonte = (id: string) => `fonte:${id}`;

function defsExtras(extras: ExtraSecao[]): DefSecao[] {
  return extras.map((x) => ({
    id: idFonte(x.id), titulo: x.nome, descricao: "Fonte personalizada", tipos: ["mensal", "quinzenal"],
    niveis: [{ id: "resumo", rotulo: "Só os totais" }, { id: "completo", rotulo: "Com quebras" }], nivelPadrao: { mensal: "completo", quinzenal: "resumo" },
  }));
}

/** Catálogo com as fontes personalizadas antes da análise. */
export function catalogoCom(extras: ExtraSecao[] = []): DefSecao[] {
  const i = CATALOGO.findIndex((s) => s.id === "analise");
  return [...CATALOGO.slice(0, i), ...defsExtras(extras), ...CATALOGO.slice(i)];
}

export const defSecao = (id: string, extras: ExtraSecao[] = []) => catalogoCom(extras).find((s) => s.id === id);
export const catalogoDo = (tipo: TipoRelatorio, extras: ExtraSecao[] = []) => catalogoCom(extras).filter((s) => s.tipos.includes(tipo));

function nivelValido(d: DefSecao, tipo: TipoRelatorio, nivel: unknown): string | undefined {
  if (!d.niveis) return undefined;
  return d.niveis.some((n) => n.id === nivel) ? (nivel as string) : d.nivelPadrao?.[tipo] ?? d.niveis.at(-1)!.id;
}

export function estruturaPadrao(tipo: TipoRelatorio, extras: ExtraSecao[] = []): ItemSecao[] {
  return catalogoDo(tipo, extras).map((d) => ({ id: d.id, ativa: d.ativaPadrao ?? true, ...(d.niveis ? { nivel: nivelValido(d, tipo, undefined) } : {}) }));
}

/**
 * Junta a estrutura salva com o catálogo: mantém a ordem salva, descarta o
 * que não existe mais, inclui seções novas na posição do padrão e mantém as
 * fixas sempre ligadas.
 */
export function normalizarEstrutura(salva: unknown, tipo: TipoRelatorio, extras: ExtraSecao[] = []): ItemSecao[] {
  const padrao = estruturaPadrao(tipo, extras);
  if (!Array.isArray(salva) || !salva.length) return padrao;
  const vistos = new Set<string>();
  const itens: ItemSecao[] = [];
  for (const x of salva as Partial<ItemSecao>[]) {
    const d = typeof x?.id === "string" ? defSecao(x.id, extras) : undefined;
    if (!d || !d.tipos.includes(tipo) || vistos.has(d.id)) continue;
    vistos.add(d.id);
    itens.push({ id: d.id, ativa: d.fixa ? true : x.ativa !== false, ...(d.niveis ? { nivel: nivelValido(d, tipo, x.nivel) } : {}) });
  }
  // Seções que faltam entram depois da vizinha anterior no padrão.
  padrao.forEach((p, k) => {
    if (vistos.has(p.id)) return;
    const anterior = padrao.slice(0, k).reverse().find((q) => vistos.has(q.id));
    const pos = anterior ? itens.findIndex((q) => q.id === anterior.id) + 1 : 0;
    itens.splice(pos, 0, p);
    vistos.add(p.id);
  });
  return itens;
}

export function limparEstrutura(e: unknown, extras: ExtraSecao[] = []): EstruturaRelatorio {
  const o = (e ?? {}) as Record<string, unknown>;
  return { mensal: normalizarEstrutura(o.mensal, "mensal", extras), quinzenal: normalizarEstrutura(o.quinzenal, "quinzenal", extras) };
}

export const ehPadrao = (itens: ItemSecao[], tipo: TipoRelatorio, extras: ExtraSecao[] = []) => JSON.stringify(itens) === JSON.stringify(estruturaPadrao(tipo, extras));

/* ---------- páginas ---------- */

export interface Pagina { titulo: string; secoes: ItemSecao[] }

/**
 * Agrupa as seções ligadas em páginas: seções grandes abrem página própria;
 * as pequenas seguem juntas na página aberta por outra pequena.
 * A primeira página, quando começa pelo resultado, leva o título do relatório.
 */
export function paginar(itens: ItemSecao[], tipo: TipoRelatorio, extras: ExtraSecao[] = []): Pagina[] {
  const paginas: (Pagina & { grande: boolean })[] = [];
  for (const it of itens.filter((x) => x.ativa)) {
    const d = defSecao(it.id, extras);
    if (!d) continue;
    const atual = paginas.at(-1);
    if (!d.grande && atual && !atual.grande) { atual.secoes.push(it); continue; }
    const titulo = it.id === "resultado" ? (tipo === "mensal" ? "Resultado do mês" : "Parcial do mês") : d.titulo;
    paginas.push({ titulo, secoes: [it], grande: !!d.grande });
  }
  return paginas.map(({ titulo, secoes }) => ({ titulo, secoes }));
}
