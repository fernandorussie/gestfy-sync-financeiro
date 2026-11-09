/**
 * Fontes personalizadas: qualquer planilha com uma linha por acontecimento
 * (contrato, cirurgia, contato de recall, entrada no banco).
 *
 * A fonte é só planilha + aba + coluna de data. Em cima dela o consultor monta
 * indicadores por seleção, sem programar:
 *  - cálculo: operação (contar, contar distintos, somar, média, mínimo, máximo,
 *    percentual) sobre uma coluna, com filtros e, se quiser, agrupado por outra coluna;
 *  - fórmula: indicador A (÷ × + − ou "% de") indicador B [(…) C], podendo usar
 *    indicadores de outras fontes e os padrão do fechamento (faturamento, despesas…).
 *
 * Só as colunas usadas nos indicadores são lidas. Colunas marcadas como dado
 * pessoal (nome, CPF, telefone) só servem para contar distintos e nunca saem
 * na prévia, no PDF ou no pacote do Claude. Fórmulas são avaliadas aqui, com
 * a lista fechada de operações; não existe código digitado pelo usuário.
 *
 * Fontes do formato antigo (medidas/quebras/filtro) são convertidas sozinhas.
 */
import { indiceDaLetra, letraDoIndice, centavos, lerData, lerValor, normalizar, textoLimpo, type Celula } from "./texto";
import { mensagemDeErro, faixaDaAba, type LerPlanilha } from "./coleta";
import type { Indicadores, Periodo } from "./indicadores";

/* ---------- tipos ---------- */

export type Operacao = "contar" | "distintos" | "somar" | "media" | "minimo" | "maximo" | "percentual";
export type OperadorFiltro = "igual" | "diferente" | "contem" | "maior" | "menor" | "vazio" | "preenchido";
export type OpFormula = "+" | "-" | "*" | "/" | "%";
export type Formato = "numero" | "moeda" | "percentual" | "dias";
export type Melhor = "maior" | "menor" | "neutro";

export interface Filtro { coluna: string; op: OperadorFiltro; valor?: string }

export interface IndicadorDef {
  id: string;
  nome: string;
  tipo: "calculo" | "formula";
  /* cálculo */
  operacao: Operacao;
  coluna?: string;
  filtros: Filtro[];
  /** Só para "percentual": % das linhas (já filtradas) que atendem esta condição. */
  condicao?: Filtro | null;
  agruparPor?: string;
  limite: number;
  /* fórmula: termos.length === ops.length + 1 (2 ou 3 termos) */
  termos: string[];
  ops: OpFormula[];
  /* apresentação */
  formato: Formato;
  melhor: Melhor;
  /** Onde aparece no relatório: "fonte" (seção da própria fonte), id de seção padrão ou "sec:<id>". */
  secao: string;
  /** Só serve de base para fórmulas; não aparece. */
  oculto?: boolean;
}

export interface FontePersonalizada {
  id: string;
  nome: string;
  sheetId: string;
  aba: string;
  linhaCabecalho?: number;
  /** Cabeçalho ou letra da coluna de data; vazio = procurar "Data". */
  colunaData: string;
  /** Colunas com dado pessoal: só para contar distintos. */
  pessoais: string[];
  indicadores: IndicadorDef[];
  /** Tipo do catálogo Gestfy, para comparar entre clientes no futuro (benchmarking). */
  comparavel?: string;
}

export const OPERACOES: { id: Operacao; rotulo: string; precisaColuna: boolean }[] = [
  { id: "contar", rotulo: "Contar linhas", precisaColuna: false },
  { id: "distintos", rotulo: "Contar valores diferentes", precisaColuna: true },
  { id: "somar", rotulo: "Somar", precisaColuna: true },
  { id: "media", rotulo: "Média", precisaColuna: true },
  { id: "minimo", rotulo: "Menor valor", precisaColuna: true },
  { id: "maximo", rotulo: "Maior valor", precisaColuna: true },
  { id: "percentual", rotulo: "% das linhas que…", precisaColuna: false },
];

export const OPERADORES: { id: OperadorFiltro; rotulo: string; semValor?: boolean }[] = [
  { id: "igual", rotulo: "é igual a" },
  { id: "diferente", rotulo: "é diferente de" },
  { id: "contem", rotulo: "contém" },
  { id: "maior", rotulo: "é maior que" },
  { id: "menor", rotulo: "é menor que" },
  { id: "preenchido", rotulo: "está preenchida", semValor: true },
  { id: "vazio", rotulo: "está vazia", semValor: true },
];

export const OPS_FORMULA: { id: OpFormula; rotulo: string }[] = [
  { id: "/", rotulo: "÷" }, { id: "*", rotulo: "×" }, { id: "+", rotulo: "+" }, { id: "-", rotulo: "−" }, { id: "%", rotulo: "% de" },
];

export const FORMATOS: { id: Formato; rotulo: string }[] = [
  { id: "numero", rotulo: "Número" }, { id: "moeda", rotulo: "R$" }, { id: "percentual", rotulo: "%" }, { id: "dias", rotulo: "Dias" },
];

/** Indicadores padrão do fechamento que podem entrar em fórmulas. */
export const PADRAO_FORMULA: { id: string; rotulo: string; formato: Formato; ler: (i: Indicadores | null | undefined) => number | null }[] = [
  { id: "padrao:faturamento", rotulo: "Faturamento", formato: "moeda", ler: (i) => i?.faturamento?.total ?? null },
  { id: "padrao:despesas", rotulo: "Despesas", formato: "moeda", ler: (i) => i?.despesas?.total ?? null },
  { id: "padrao:resultado", rotulo: "Resultado (de caixa ou faturamento x despesas)", formato: "moeda", ler: (i) => i?.caixa?.resultado ?? null },
  { id: "padrao:entradas", rotulo: "Entradas de caixa", formato: "moeda", ler: (i) => i?.entradas?.total ?? null },
  { id: "padrao:atendidos", rotulo: "Clientes atendidos", formato: "numero", ler: (i) => i?.pacientes?.atendidos ?? null },
  { id: "padrao:novos", rotulo: "Clientes novos", formato: "numero", ler: (i) => i?.pacientes?.novos ?? null },
  { id: "padrao:ticket", rotulo: "Ticket médio", formato: "moeda", ler: (i) => i?.pacientes?.ticketMedio ?? null },
  { id: "padrao:leads", rotulo: "Leads", formato: "numero", ler: (i) => i?.leads?.total ?? null },
  { id: "padrao:agendados", rotulo: "Leads agendados", formato: "numero", ler: (i) => i?.leads?.agendados ?? null },
  { id: "padrao:orcamentos", rotulo: "Orçamentos gerados", formato: "numero", ler: (i) => i?.orcamentos?.total ?? null },
  { id: "padrao:fechados", rotulo: "Orçamentos fechados", formato: "numero", ler: (i) => i?.orcamentos?.fechados ?? null },
];

export const CATALOGO_COMPARAVEL = [
  { id: "", rotulo: "Não comparar entre clientes" },
  { id: "contratos", rotulo: "Contratos fechados" },
  { id: "cirurgias", rotulo: "Cirurgias realizadas" },
  { id: "procedimentos", rotulo: "Procedimentos realizados" },
  { id: "recall", rotulo: "Contatos de recall" },
  { id: "entradas_bancarias", rotulo: "Entradas bancárias" },
  { id: "vendas", rotulo: "Vendas" },
  { id: "outro", rotulo: "Outro" },
];

/* ---------- configuração ---------- */

const s = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const novoId = () => crypto.randomUUID().slice(0, 8);

export function indicadorVazio(p: Partial<IndicadorDef> = {}): IndicadorDef {
  return { id: novoId(), nome: "", tipo: "calculo", operacao: "contar", filtros: [], limite: 8, termos: [], ops: [], formato: "numero", melhor: "maior", secao: "fonte", condicao: null, ...p };
}

function limparFiltro(x: unknown): Filtro | null {
  const f = (x ?? {}) as Partial<Filtro>;
  const coluna = s(f.coluna, 80);
  const op = OPERADORES.find((o) => o.id === f.op)?.id;
  if (!coluna || !op) return null;
  const sem = OPERADORES.find((o) => o.id === op)!.semValor;
  return sem ? { coluna, op } : { coluna, op, valor: s(f.valor, 200) };
}

function limparIndicador(x: unknown): IndicadorDef {
  const d = (x ?? {}) as Partial<IndicadorDef>;
  const tipo = d.tipo === "formula" ? "formula" : "calculo";
  const operacao = OPERACOES.find((o) => o.id === d.operacao)?.id ?? "contar";
  const ops = (Array.isArray(d.ops) ? d.ops : []).filter((o): o is OpFormula => OPS_FORMULA.some((y) => y.id === o)).slice(0, 2);
  const termos = (Array.isArray(d.termos) ? d.termos : []).map((t) => s(t, 60)).slice(0, ops.length + 1);
  return {
    id: s(d.id, 40) || novoId(),
    nome: s(d.nome, 60),
    tipo,
    operacao,
    coluna: s(d.coluna, 80) || undefined,
    filtros: (Array.isArray(d.filtros) ? d.filtros : []).map(limparFiltro).filter((f): f is Filtro => !!f).slice(0, 6),
    condicao: operacao === "percentual" ? limparFiltro(d.condicao) : null,
    agruparPor: s(d.agruparPor, 80) || undefined,
    limite: Math.min(30, Math.max(3, Math.floor(Number(d.limite) || 8))),
    termos,
    ops,
    formato: FORMATOS.find((f) => f.id === d.formato)?.id ?? "numero",
    melhor: d.melhor === "menor" || d.melhor === "neutro" ? d.melhor : "maior",
    secao: s(d.secao, 60) || "fonte",
    ...(d.oculto ? { oculto: true } : {}),
  };
}

/** Formato antigo (até v2.3): medidas, quebras e filtro por campos fixos. */
interface FonteAntiga {
  colunas?: Partial<Record<"data" | "valor" | "categoria" | "status" | "profissional" | "quantidade", string>>;
  filtro?: { campo: "categoria" | "status" | "profissional"; valores: string[] } | null;
  medidas?: { quantidade?: boolean; valor?: boolean; media?: boolean };
  quebras?: ("categoria" | "status" | "profissional")[];
}

const ROTULO_ANTIGO = { categoria: "Por categoria", status: "Por status", profissional: "Por profissional" } as const;

/** Converte uma fonte antiga em indicadores equivalentes. Colunas sem indicação viram "~campo" (busca automática como antes). */
export function converterAntiga(a: FonteAntiga): Pick<FontePersonalizada, "colunaData" | "indicadores"> {
  const col = (c: keyof NonNullable<FonteAntiga["colunas"]>) => s(a.colunas?.[c], 80) || `~${c}`;
  const filtros: Filtro[] = a.filtro?.valores?.length ? [{ coluna: col(a.filtro.campo), op: "igual", valor: a.filtro.valores.join(", ") }] : [];
  const m = { quantidade: a.medidas?.quantidade !== false, valor: !!a.medidas?.valor, media: !!a.medidas?.media };
  const qtd = indicadorVazio({ id: "qtd", nome: "Quantidade", operacao: "somar", coluna: col("quantidade"), filtros, oculto: !m.quantidade });
  const valor = indicadorVazio({ id: "valor", nome: "Valor total", operacao: "somar", coluna: col("valor"), filtros, formato: "moeda", oculto: !m.valor });
  const lista: IndicadorDef[] = [qtd, valor];
  if (m.media) lista.push(indicadorVazio({ id: "media", nome: "Valor médio", tipo: "formula", termos: ["valor", "qtd"], ops: ["/"], formato: "moeda" }));
  for (const q of a.quebras ?? []) {
    lista.push(indicadorVazio({
      id: `por-${q}`, nome: ROTULO_ANTIGO[q], operacao: "somar", coluna: m.valor ? col("valor") : col("quantidade"),
      formato: m.valor ? "moeda" : "numero", filtros, agruparPor: col(q),
    }));
  }
  // Sem nenhuma medida visível nem quebra, mostra pelo menos a quantidade.
  if (!lista.some((x) => !x.oculto)) qtd.oculto = false;
  return { colunaData: s(a.colunas?.data, 80), indicadores: lista };
}

export function limparFontePersonalizada(f: Partial<FontePersonalizada> & FonteAntiga): FontePersonalizada {
  const antiga = !Array.isArray(f.indicadores) && (f.medidas || f.quebras || f.colunas);
  const conv = antiga ? converterAntiga(f) : null;
  const pessoais = (Array.isArray(f.pessoais) ? f.pessoais : []).map((p) => s(p, 80)).filter(Boolean).slice(0, 20);
  const ehPessoal = (ref?: string) => !!ref && pessoais.some((p) => normalizar(p) === normalizar(ref));
  // Coluna de dado pessoal nunca vira agrupamento (os nomes apareceriam no relatório).
  const indicadores = (conv?.indicadores ?? (f.indicadores ?? []).map(limparIndicador)).slice(0, 20)
    .map((d) => (ehPessoal(d.agruparPor) ? { ...d, agruparPor: undefined } : d));
  // Fórmulas só podem apontar para indicadores que existem (desta ou de outra fonte) ou padrão; a checagem final é no cálculo.
  return {
    id: s(f.id, 40) || crypto.randomUUID(),
    nome: s(f.nome, 60) || "Fonte personalizada",
    sheetId: extrairId(s(f.sheetId, 300)),
    aba: s(f.aba, 100),
    linhaCabecalho: f.linhaCabecalho && f.linhaCabecalho > 0 ? Math.min(50, Math.floor(f.linhaCabecalho)) : undefined,
    colunaData: conv ? conv.colunaData : s(f.colunaData, 80),
    pessoais,
    indicadores,
    comparavel: CATALOGO_COMPARAVEL.some((c) => c.id === f.comparavel) ? f.comparavel : "",
  };
}

function extrairId(t: string): string {
  const m = t.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : t;
}

/** Colunas usadas pela fonte (data + indicadores), sem repetir. */
export function colunasUsadas(f: FontePersonalizada): string[] {
  const set = new Set<string>([f.colunaData || "~data"]);
  for (const d of f.indicadores) {
    if (d.tipo !== "calculo") continue;
    if (d.coluna && OPERACOES.find((o) => o.id === d.operacao)?.precisaColuna) set.add(d.coluna);
    if (d.agruparPor) set.add(d.agruparPor);
    for (const x of d.filtros) set.add(x.coluna);
    if (d.condicao) set.add(d.condicao.coluna);
  }
  return [...set];
}

/* ---------- leitura ---------- */

/** Nomes aceitos na busca automática ("~campo"), herdados do formato antigo. */
const AUTO: Record<string, { nomes: string[]; contem?: string[] }> = {
  data: { nomes: ["data", "data do atendimento", "data da cirurgia", "data do contrato", "data da venda", "dia"], contem: ["data"] },
  valor: { nomes: ["valor", "valor total", "valor pago", "valor recebido", "valor do contrato"], contem: ["valor"] },
  categoria: { nomes: ["categoria", "procedimento", "tipo", "plano", "servico", "origem"] },
  status: { nomes: ["status", "situacao", "resultado"] },
  profissional: { nomes: ["profissional", "medico", "responsavel", "cirurgiao", "vendedor"] },
  quantidade: { nomes: ["quantidade", "qtd", "qtde"] },
};

/** Acha a coluna de uma referência: cabeçalho exato, letra (A–ZZZ) ou "~campo". -1 se não achar. */
export function indiceColuna(ref: string, cab: string[]): number {
  if (!ref) return -1;
  if (ref.startsWith("~")) {
    const a = AUTO[ref.slice(1)];
    if (!a) return -1;
    for (const n of a.nomes) { const i = cab.indexOf(normalizar(n)); if (i >= 0) return i; }
    for (const t of a.contem ?? []) { const i = cab.findIndex((h) => h.includes(normalizar(t))); if (i >= 0) return i; }
    return -1;
  }
  const i = cab.indexOf(normalizar(ref));
  if (i >= 0) return i;
  return /^[A-Z]{1,3}$/.test(ref) ? indiceDaLetra(ref) : -1;
}

export interface LinhaPersonalizada { data: string; c: Record<string, Celula> }

export interface LeituraPersonalizada {
  linhas: LinhaPersonalizada[];
  ignoradas: { linha: number; motivo: string }[];
  /** Colunas encontradas: referência → letra e cabeçalho. */
  colunas: { ref: string; letra: string; cabecalho: string }[];
  /** Referências obrigatórias não encontradas (a data, ou colunas de indicadores). */
  faltando: string[];
  cabecalho: string[];
  linhaCabecalho: number;
}

const rotuloRef = (ref: string) => (ref.startsWith("~") ? `${ref.slice(1)[0].toUpperCase()}${ref.slice(2)} (automática)` : ref);
export { rotuloRef };

export function lerPlanilhaPersonalizada(valores: Celula[][], f: FontePersonalizada): LeituraPersonalizada {
  const refs = colunasUsadas(f);
  const refData = f.colunaData || "~data";
  const norm = (row: Celula[] | undefined) => (row ?? []).map(normalizar);
  let ic = f.linhaCabecalho ? f.linhaCabecalho - 1 : 0;
  if (!f.linhaCabecalho) {
    let melhor = -1;
    for (let i = 0; i < Math.min(5, valores.length); i++) {
      const cab = norm(valores[i]);
      const p = refs.filter((r) => !/^[A-Z]{1,3}$/.test(r) && indiceColuna(r, cab) >= 0).length + (indiceColuna(refData, cab) >= 0 ? 5 : 0);
      if (p > melhor) { melhor = p; ic = i; }
    }
  }
  const bruto = valores[ic] ?? [];
  const cab = norm(bruto);
  const idx = new Map<string, number>();
  const colunas: LeituraPersonalizada["colunas"] = [];
  const faltando: string[] = [];
  for (const r of refs) {
    const i = indiceColuna(r, cab);
    if (i >= 0) { idx.set(r, i); colunas.push({ ref: r, letra: letraDoIndice(i), cabecalho: textoLimpo(bruto[i]) }); }
    // Colunas automáticas ("~campo", do formato antigo) são opcionais, exceto a data.
    else if (!r.startsWith("~") || r === refData) faltando.push(rotuloRef(r));
  }
  const leitura: LeituraPersonalizada = { linhas: [], ignoradas: [], colunas, faltando, cabecalho: bruto.map((c) => textoLimpo(c)), linhaCabecalho: ic + 1 };
  const iData = idx.get(refData);
  if (iData === undefined) return leitura;
  for (let i = ic + 1; i < valores.length; i++) {
    const linha = valores[i] ?? [];
    if (linha.every((c) => c === null || c === undefined || String(c).trim() === "")) continue;
    const data = lerData(linha[iData]);
    if (!data) {
      if (textoLimpo(linha[iData])) leitura.ignoradas.push({ linha: i + 1, motivo: `data ilegível: "${textoLimpo(linha[iData])}"` });
      continue;
    }
    const c: Record<string, Celula> = {};
    for (const [r, j] of idx) if (r !== refData) c[r] = linha[j];
    leitura.linhas.push({ data, c });
  }
  return leitura;
}

export async function lerFontePersonalizada(f: FontePersonalizada, ler: LerPlanilha): Promise<{ leitura: LeituraPersonalizada | null; erro: string | null }> {
  if (!f.sheetId || !f.aba) return { leitura: null, erro: "Informe o link da planilha e o nome da aba." };
  try {
    const valores = await ler(f.sheetId, faixaDaAba(f.aba));
    const leitura = lerPlanilhaPersonalizada(valores, f);
    if (leitura.faltando.length) return { leitura, erro: `Coluna não encontrada: ${leitura.faltando.join(", ")}. Escolha a coluna pelo cabeçalho ou pela letra.` };
    return { leitura, erro: null };
  } catch (e) {
    return { leitura: null, erro: mensagemDeErro(e) };
  }
}

/* ---------- cálculo ---------- */

export interface GrupoResultado { nome: string; valor: number | null; linhas: number }

export interface ResultadoIndicador {
  id: string;
  nome: string;
  formato: Formato;
  melhor: Melhor;
  secao: string;
  atual: number | null;
  anterior: number | null;
  grupos?: GrupoResultado[];
  /** Como foi calculado, em palavras ("Soma de Valor · Status é igual a Realizada"). */
  descricao: string;
}

export interface ResultadoPersonalizado {
  id: string;
  nome: string;
  comparavel?: string;
  indicadores: ResultadoIndicador[];
  linhasLidas: number;
  ignoradas: number;
  erro: string | null;
}

const dentro = (d: string, p: Periodo) => d >= p.inicio && d <= p.fim;

function comparar(cel: Celula, f: Filtro): boolean {
  const t = textoLimpo(cel);
  switch (f.op) {
    case "vazio": return !t;
    case "preenchido": return !!t;
    case "contem": return normalizar(t).includes(normalizar(f.valor ?? ""));
    case "igual": case "diferente": {
      const aceitos = (f.valor ?? "").split(",").map((v) => normalizar(v)).filter(Boolean);
      const bate = aceitos.length ? aceitos.includes(normalizar(t)) : !t;
      return f.op === "igual" ? bate : !bate;
    }
    case "maior": case "menor": {
      const a = lerValor(cel), b = lerValor(f.valor ?? "");
      if (a !== null && b !== null) return f.op === "maior" ? a > b : a < b;
      const da = lerData(cel), db = lerData(f.valor ?? "");
      if (da && db) return f.op === "maior" ? da > db : da < db;
      return false;
    }
  }
}

function aplicarOperacao(d: IndicadorDef, linhas: LinhaPersonalizada[]): number | null {
  const col = d.coluna ?? "";
  // "~quantidade" sem coluna na planilha: cada linha vale 1 (como no formato antigo).
  const num = (l: LinhaPersonalizada) => (col === "~quantidade" && !(col in l.c) ? 1 : lerValor(l.c[col]));
  switch (d.operacao) {
    case "contar": return linhas.length;
    case "distintos": return new Set(linhas.map((l) => normalizar(l.c[col])).filter(Boolean)).size;
    case "percentual": {
      if (!linhas.length) return null;
      const ok = d.condicao ? linhas.filter((l) => comparar(l.c[d.condicao!.coluna], d.condicao!)).length : linhas.length;
      return Math.round((ok / linhas.length) * 1000) / 10;
    }
    default: {
      const vs = linhas.map(num).filter((v): v is number => v !== null);
      if (!vs.length) return d.operacao === "somar" ? 0 : null;
      if (d.operacao === "somar") return centavos(vs.reduce((a, b) => a + b, 0));
      if (d.operacao === "media") return centavos(vs.reduce((a, b) => a + b, 0) / vs.length);
      if (d.operacao === "minimo") return Math.min(...vs);
      return Math.max(...vs);
    }
  }
}

function calcularSimples(d: IndicadorDef, linhas: LinhaPersonalizada[], periodo: Periodo, anterior: Periodo) {
  const filtradas = linhas.filter((l) => d.filtros.every((f) => comparar(l.c[f.coluna], f)));
  const atuais = filtradas.filter((l) => dentro(l.data, periodo));
  const antes = filtradas.filter((l) => dentro(l.data, anterior));
  let grupos: GrupoResultado[] | undefined;
  if (d.agruparPor) {
    const mapa = new Map<string, { nome: string; linhas: LinhaPersonalizada[] }>();
    for (const l of atuais) {
      const nome = textoLimpo(l.c[d.agruparPor]) || "Não informado";
      const k = normalizar(nome);
      const g = mapa.get(k) ?? { nome, linhas: [] };
      g.linhas.push(l);
      mapa.set(k, g);
    }
    grupos = [...mapa.values()]
      .map((g) => ({ nome: g.nome, valor: aplicarOperacao(d, g.linhas), linhas: g.linhas.length }))
      .sort((a, b) => (b.valor ?? -Infinity) - (a.valor ?? -Infinity) || b.linhas - a.linhas);
  }
  return { atual: aplicarOperacao(d, atuais), anterior: aplicarOperacao(d, antes), grupos };
}

export function aplicarFormula(termos: (number | null)[], ops: OpFormula[]): number | null {
  let acc = termos[0];
  for (let k = 0; k < ops.length; k++) {
    const b = termos[k + 1];
    if (acc === null || acc === undefined || b === null || b === undefined) return null;
    switch (ops[k]) {
      case "+": acc = acc + b; break;
      case "-": acc = acc - b; break;
      case "*": acc = acc * b; break;
      case "/": acc = b === 0 ? null : acc / b; break;
      case "%": acc = b === 0 ? null : (acc / b) * 100; break;
    }
  }
  return acc === null || acc === undefined || !Number.isFinite(acc) ? null : Math.round(acc * 100) / 100;
}

const rotuloOp = (o: Operacao) => ({ contar: "Contagem de linhas", distintos: "Valores diferentes de", somar: "Soma de", media: "Média de", minimo: "Menor valor de", maximo: "Maior valor de", percentual: "% das linhas em que" })[o];
const textoFiltro = (f: Filtro) => `${rotuloRef(f.coluna)} ${OPERADORES.find((o) => o.id === f.op)?.rotulo ?? ""}${f.valor ? ` ${f.valor}` : ""}`;

export function descreverIndicador(d: IndicadorDef, nomeDe: (ref: string) => string = (r) => r): string {
  if (d.tipo === "formula") {
    return d.termos.map((t, k) => (k ? `${OPS_FORMULA.find((o) => o.id === d.ops[k - 1])?.rotulo ?? ""} ${nomeDe(t)}` : nomeDe(t))).join(" ");
  }
  const base = d.operacao === "contar" ? rotuloOp("contar")
    : d.operacao === "percentual" ? `${rotuloOp("percentual")} ${d.condicao ? textoFiltro(d.condicao) : "…"}`
    : `${rotuloOp(d.operacao)} ${rotuloRef(d.coluna ?? "…")}`;
  const filtros = d.filtros.length ? ` · ${d.filtros.map(textoFiltro).join(" e ")}` : "";
  const grupo = d.agruparPor ? ` · por ${rotuloRef(d.agruparPor)}` : "";
  return base + filtros + grupo;
}

export interface Padrao { atual?: Indicadores | null; anterior?: Indicadores | null }

/**
 * Calcula todos os indicadores de todas as fontes do cliente. Fórmulas podem
 * usar indicadores de qualquer fonte (pelo id) e os padrão ("padrao:…").
 */
export function calcularFontes(
  fontes: FontePersonalizada[],
  leituras: Map<string, { leitura: LeituraPersonalizada | null; erro: string | null }>,
  periodo: Periodo,
  anterior: Periodo,
  padrao: Padrao = {},
): ResultadoPersonalizado[] {
  const valores = new Map<string, { atual: number | null; anterior: number | null }>();
  for (const p of PADRAO_FORMULA) valores.set(p.id, { atual: p.ler(padrao.atual), anterior: p.ler(padrao.anterior) });
  const nomes = new Map<string, string>(PADRAO_FORMULA.map((p) => [p.id, p.rotulo]));
  for (const f of fontes) for (const d of f.indicadores) { nomes.set(d.id, d.nome || "indicador"); nomes.set(`${f.id}.${d.id}`, d.nome || "indicador"); }

  const parciais = new Map<string, ResultadoIndicador>();
  const chave = (f: FontePersonalizada, d: IndicadorDef) => `${f.id}.${d.id}`;
  // 1ª passada: cálculos sobre as linhas.
  for (const f of fontes) {
    const l = leituras.get(f.id);
    const linhas = l?.erro ? [] : l?.leitura?.linhas ?? [];
    for (const d of f.indicadores.filter((x) => x.tipo === "calculo")) {
      const r = l?.erro ? { atual: null, anterior: null, grupos: undefined } : calcularSimples(d, linhas, periodo, anterior);
      valores.set(chave(f, d), { atual: r.atual, anterior: r.anterior });
      if (!valores.has(d.id)) valores.set(d.id, { atual: r.atual, anterior: r.anterior });
      parciais.set(chave(f, d), { id: d.id, nome: d.nome || "Indicador", formato: d.formato, melhor: d.melhor, secao: d.secao, atual: r.atual, anterior: r.anterior, grupos: r.grupos, descricao: descreverIndicador(d) });
    }
  }
  // 2ª passada: fórmulas (até 3 rodadas, para fórmula que usa outra fórmula).
  const formulas = fontes.flatMap((f) => f.indicadores.filter((x) => x.tipo === "formula").map((d) => ({ f, d })));
  const termo = (f: FontePersonalizada, t: string) => valores.get(t.startsWith("padrao:") || t.includes(".") ? t : `${f.id}.${t}`) ?? valores.get(t);
  for (let rodada = 0; rodada < 3; rodada++) {
    for (const { f, d } of formulas) {
      const ts = d.termos.map((t) => termo(f, t));
      const pronto = ts.every(Boolean);
      const atual = pronto ? aplicarFormula(ts.map((x) => x!.atual), d.ops) : null;
      const ant = pronto ? aplicarFormula(ts.map((x) => x!.anterior), d.ops) : null;
      if (pronto) { valores.set(chave(f, d), { atual, anterior: ant }); if (!valores.has(d.id)) valores.set(d.id, { atual, anterior: ant }); }
      parciais.set(chave(f, d), { id: d.id, nome: d.nome || "Indicador", formato: d.formato, melhor: d.melhor, secao: d.secao, atual, anterior: ant, descricao: descreverIndicador(d, (r) => nomes.get(r.includes(".") || r.startsWith("padrao:") ? r : `${f.id}.${r}`) ?? nomes.get(r) ?? "?") });
    }
  }

  return fontes.map((f) => {
    const l = leituras.get(f.id);
    return {
      id: f.id, nome: f.nome, comparavel: f.comparavel || undefined,
      indicadores: f.indicadores.filter((d) => !d.oculto).map((d) => parciais.get(chave(f, d))!).filter(Boolean),
      linhasLidas: l?.leitura?.linhas.length ?? 0,
      ignoradas: l?.leitura?.ignoradas.length ?? 0,
      erro: l?.erro ?? null,
    };
  });
}

/** Uma fonte só (tela de prévia). */
export function calcularPersonalizada(f: FontePersonalizada, leitura: LeituraPersonalizada | null, periodo: Periodo, anterior: Periodo, erro: string | null = null, padrao: Padrao = {}): ResultadoPersonalizado {
  return calcularFontes([f], new Map([[f.id, { leitura, erro }]]), periodo, anterior, padrao)[0];
}

/* ---------- compatibilidade com fechamentos já concluídos ---------- */

interface ResultadoAntigo {
  id: string; nome: string; comparavel?: string;
  medidas: { quantidade: boolean; valor: boolean; media: boolean };
  filtro?: { valores: string[] } | null;
  atual: { quantidade: number; valor: number; media: number | null };
  anterior: { quantidade: number; valor: number; media: number | null };
  quebras: { campo: string; rotulo: string; itens: { nome: string; quantidade: number; valor: number }[] }[];
  linhasLidas: number; ignoradas: number; erro: string | null;
}

/** Aceita o resultado no formato atual ou no antigo (retratos congelados até v2.3). */
export function adaptarResultado(x: unknown): ResultadoPersonalizado {
  const r = x as Partial<ResultadoPersonalizado> & Partial<ResultadoAntigo>;
  if (Array.isArray(r.indicadores)) return r as ResultadoPersonalizado;
  const a = r as ResultadoAntigo;
  const filtro = a.filtro?.valores?.length ? ` · só ${a.filtro.valores.join(", ")}` : "";
  const ind = (id: string, nome: string, formato: Formato, at: number | null, an: number | null): ResultadoIndicador => ({ id, nome, formato, melhor: "maior", secao: "fonte", atual: at, anterior: an, descricao: nome + filtro });
  const lista: ResultadoIndicador[] = [];
  if (a.medidas?.quantidade) lista.push(ind("qtd", "Quantidade", "numero", a.atual?.quantidade ?? null, a.anterior?.quantidade ?? null));
  if (a.medidas?.valor) lista.push(ind("valor", "Valor total", "moeda", a.atual?.valor ?? null, a.anterior?.valor ?? null));
  if (a.medidas?.media) lista.push(ind("media", "Valor médio", "moeda", a.atual?.media ?? null, a.anterior?.media ?? null));
  for (const q of a.quebras ?? []) {
    if (!q.itens?.length) continue;
    lista.push({
      ...ind(`por-${q.campo}`, q.rotulo, a.medidas?.valor ? "moeda" : "numero", null, null),
      grupos: q.itens.map((i) => ({ nome: i.nome, valor: a.medidas?.valor ? i.valor : i.quantidade, linhas: i.quantidade })),
    });
  }
  return { id: a.id, nome: a.nome, comparavel: a.comparavel, indicadores: lista, linhasLidas: a.linhasLidas ?? 0, ignoradas: a.ignoradas ?? 0, erro: a.erro ?? null };
}
