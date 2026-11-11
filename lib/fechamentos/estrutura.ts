import { limparOcultos, temBlocos } from "./blocos";

/**
 * Estrutura do relatório: quais seções aparecem, em que ordem, com que nível
 * de detalhe e quais blocos (cards, listas) dentro de cada uma (ver blocos.ts). Cada clínica guarda a sua (fechamento_config.relatorio); sem
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
  /** Os níveis são só atalhos para marcar blocos (Resumo / Completo); o PDF segue os blocos. */
  niveisAtalho?: boolean;
  /** A seção já imprime o próprio título; sem isso, ganha um título quando não abre a página. */
  tituloProprio?: boolean;
}

export interface ItemSecao {
  id: string;
  ativa: boolean;
  nivel?: string;
  /** Blocos desligados pelo usuário (ver blocos.ts). Ausente = padrão do catálogo. */
  ocultos?: string[];
  /** Começar em página nova? Ausente = regra padrão (grandes abrem página; pequenas seguem a anterior pequena). */
  novaPagina?: boolean;
}
export type EstruturaRelatorio = Partial<Record<TipoRelatorio, ItemSecao[]>> & { secoes?: SecaoPersonalizada[] };

const RESUMO_COMPLETO = (completo: string): NivelSecao[] => [{ id: "resumo", rotulo: "Resumo" }, { id: "completo", rotulo: completo }];

/** Catálogo na ordem do padrão Gestfy. */
export const CATALOGO: DefSecao[] = [
  { id: "resultado", titulo: "Resultado do período", descricao: "Boxes com faturamento, despesas, resultado, meta, atendimentos e tickets", tipos: ["mensal", "quinzenal"], fixa: true },
  { id: "grafico", titulo: "Gráfico de faturamento e despesas", descricao: "Linhas do ano, mês a mês", tipos: ["mensal"], tituloProprio: true },
  { id: "ritmo", titulo: "Ritmo do mês", descricao: "Faturamento por dia útil, projeção e quanto falta para a meta", tipos: ["quinzenal"], fixa: true, tituloProprio: true },
  { id: "caixaMes", titulo: "Caixa do mês", descricao: "Despesas pagas, média de 3 meses, provisionado e saldo projetado", tipos: ["quinzenal"], tituloProprio: true },
  { id: "funilLeads", titulo: "Funil de leads", descricao: "Leads, agendamentos e conversão", tipos: ["mensal", "quinzenal"], niveis: RESUMO_COMPLETO("Completo"), nivelPadrao: { mensal: "completo", quinzenal: "resumo" }, niveisAtalho: true, tituloProprio: true },
  { id: "funilOrcamentos", titulo: "Funil de orçamentos", descricao: "Por valor e por quantidade; cancelados ficam fora da conversão", tipos: ["mensal", "quinzenal"], niveis: RESUMO_COMPLETO("Completo"), nivelPadrao: { mensal: "completo", quinzenal: "resumo" }, niveisAtalho: true, tituloProprio: true },
  { id: "experiencia", titulo: "Experiência do cliente", descricao: "NPS, notas por área e avaliações no Google (só o que a fonte tiver)", tipos: ["mensal"], tituloProprio: true },
  { id: "receitas", titulo: "Receitas detalhadas", descricao: "Categorias com valor, quantidade, ticket e variação", tipos: ["mensal", "quinzenal"], fixa: true, grande: true,
    niveis: [{ id: "com_valor", rotulo: "Só categorias com movimento" }, { id: "todas", rotulo: "Todas as categorias (12 meses)" }], nivelPadrao: { mensal: "todas", quinzenal: "todas" } },
  { id: "distribuicao", titulo: "Faturamento por profissional, unidade e pagamento", descricao: "Participação de cada profissional, unidade e meio de pagamento", tipos: ["mensal"], ativaPadrao: false },
  { id: "despesas", titulo: "Despesas detalhadas", descricao: "Grupos e categorias, com o que mais aumentou", tipos: ["mensal"], fixa: true, grande: true,
    niveis: [{ id: "grupos", rotulo: "Só grupos" }, { id: "categorias", rotulo: "Grupos e categorias" }], nivelPadrao: { mensal: "categorias" } },
  { id: "entradas", titulo: "Entradas detalhadas", descricao: "Recebimentos por grupo e categoria (só com a fonte de Entradas)", tipos: ["mensal"], tituloProprio: true,
    niveis: [{ id: "grupos", rotulo: "Só grupos" }, { id: "categorias", rotulo: "Grupos e categorias" }, { id: "completo", rotulo: "Grupos, categorias e fora do resultado" }], nivelPadrao: { mensal: "categorias" } },
  { id: "regimes", titulo: "Caixa e competência no ano", descricao: "Entradas, saídas e saldo mês a mês", tipos: ["mensal"], grande: true,
    niveis: [{ id: "caixa", rotulo: "Só regime de caixa" }, { id: "ambos", rotulo: "Caixa e competência" }], nivelPadrao: { mensal: "ambos" } },
  { id: "analise", titulo: "Análise e plano de ação", descricao: "Texto do fechamento e ações com responsáveis", tipos: ["mensal", "quinzenal"], grande: true, ativaPadrao: false },
];

/**
 * Seção extra da clínica: a de uma fonte personalizada ("fonte:<id>") ou uma
 * seção criada no editor ("sec:<id>"), onde entram indicadores escolhidos.
 */
export interface ExtraSecao { id: string; nome: string; tipo?: "fonte" | "secao" }
export const idFonte = (id: string) => `fonte:${id}`;
export const idSecao = (id: string) => `sec:${id}`;
const idExtra = (x: ExtraSecao) => (x.tipo === "secao" ? idSecao(x.id) : idFonte(x.id));

/** Seção criada pelo consultor no editor de estrutura. */
export interface SecaoPersonalizada { id: string; titulo: string }

/**
 * Seções extras de uma clínica: cada fonte com algum indicador na própria seção,
 * mais as seções personalizadas. Serve tanto para a configuração quanto para
 * os resultados (indicadores já calculados).
 */
export function extrasDe(
  fontes: { id: string; nome: string; indicadores: { secao: string; oculto?: boolean }[] }[],
  secoes: SecaoPersonalizada[] = [],
): ExtraSecao[] {
  return [
    ...fontes.filter((f) => f.indicadores.some((d) => !d.oculto && (d.secao || "fonte") === "fonte")).map((f) => ({ id: f.id, nome: f.nome })),
    ...secoes.map((x) => ({ id: x.id, nome: x.titulo, tipo: "secao" as const })),
  ];
}

export function limparSecoes(x: unknown): SecaoPersonalizada[] {
  return (Array.isArray(x) ? x : [])
    .map((s) => ({ id: String((s as SecaoPersonalizada)?.id ?? "").slice(0, 40), titulo: String((s as SecaoPersonalizada)?.titulo ?? "").trim().slice(0, 60) }))
    .filter((s) => s.id && s.titulo)
    .slice(0, 10);
}

function defsExtras(extras: ExtraSecao[]): DefSecao[] {
  return extras.map((x) => ({
    id: idExtra(x), titulo: x.nome, descricao: x.tipo === "secao" ? "Seção personalizada" : "Fonte personalizada", tipos: ["mensal", "quinzenal"],
    niveis: [{ id: "resumo", rotulo: "Só os totais" }, { id: "completo", rotulo: "Com tabelas" }], nivelPadrao: { mensal: "completo", quinzenal: "resumo" },
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
    const ocultos = temBlocos(d.id) ? limparOcultos(d.id, x.ocultos) : undefined;
    itens.push({
      id: d.id, ativa: d.fixa ? true : x.ativa !== false,
      ...(d.niveis ? { nivel: nivelValido(d, tipo, x.nivel) } : {}),
      ...(ocultos ? { ocultos } : {}),
      ...(typeof x.novaPagina === "boolean" ? { novaPagina: x.novaPagina } : {}),
    });
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

/** Limpa a estrutura salva. As seções personalizadas salvas entram nos extras automaticamente. */
export function limparEstrutura(e: unknown, extras: ExtraSecao[] = []): EstruturaRelatorio {
  const o = (e ?? {}) as Record<string, unknown>;
  const secoes = limparSecoes(o.secoes);
  const todos = [...extras.filter((x) => x.tipo !== "secao"), ...secoes.map((x) => ({ id: x.id, nome: x.titulo, tipo: "secao" as const }))];
  return { mensal: normalizarEstrutura(o.mensal, "mensal", todos), quinzenal: normalizarEstrutura(o.quinzenal, "quinzenal", todos), secoes };
}

export const ehPadrao = (itens: ItemSecao[], tipo: TipoRelatorio, extras: ExtraSecao[] = []) => JSON.stringify(itens) === JSON.stringify(estruturaPadrao(tipo, extras));

/** Seções onde um indicador personalizado pode entrar (além da seção da própria fonte). */
export const SECOES_DESTINO = ["resultado", "ritmo", "caixaMes", "funilLeads", "funilOrcamentos", "experiencia", "receitas", "distribuicao", "despesas", "entradas"] as const;

/* ---------- páginas ---------- */

export interface Pagina { titulo: string; secoes: ItemSecao[] }

/** A seção abre página nova? Escolha do usuário; sem ela, a regra padrão. */
export function abrePagina(it: ItemSecao, d: DefSecao, anteriorGrande: boolean | undefined): boolean {
  if (anteriorGrande === undefined) return true;
  if (typeof it.novaPagina === "boolean") return it.novaPagina;
  return !!d.grande || anteriorGrande;
}

/**
 * Agrupa as seções ligadas em páginas. Padrão: seções grandes abrem página
 * própria; as pequenas seguem juntas na página aberta por outra pequena.
 * O usuário pode forçar ("começar em página nova") ou juntar à anterior.
 * No papel, o conteúdo que não cabe continua na folha seguinte sem cortar
 * cards e linhas. A primeira página, quando começa pelo resultado, leva o
 * título do relatório.
 */
export function paginar(itens: ItemSecao[], tipo: TipoRelatorio, extras: ExtraSecao[] = []): Pagina[] {
  const paginas: (Pagina & { grande: boolean })[] = [];
  for (const it of itens.filter((x) => x.ativa)) {
    const d = defSecao(it.id, extras);
    if (!d) continue;
    const atual = paginas.at(-1);
    if (atual && !abrePagina(it, d, atual.grande)) { atual.secoes.push(it); atual.grande = atual.grande || !!d.grande; continue; }
    const titulo = it.id === "resultado" ? (tipo === "mensal" ? "Resultado do mês" : "Parcial do mês") : d.titulo;
    paginas.push({ titulo, secoes: [it], grande: !!d.grande });
  }
  return paginas.map(({ titulo, secoes }) => ({ titulo, secoes }));
}
