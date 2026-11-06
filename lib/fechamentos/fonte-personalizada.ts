/**
 * Fontes personalizadas: qualquer planilha com uma linha por acontecimento
 * (contrato, cirurgia, contato de recall, entrada no banco). O consultor diz o
 * que cada coluna é e escolhe o que medir; não há fórmulas.
 *
 * Só as colunas indicadas são lidas (nada de nomes de pacientes ou observações).
 * Medidas: quantidade (soma da coluna Quantidade ou número de linhas), valor
 * total e valor médio; quebras por categoria, status ou profissional; filtro
 * opcional (ex.: só status "Realizada"). Comparação com o período anterior.
 */
import { resolverColunas, celula, type DefinicaoFonte, type IndicacaoColuna } from "./colunas";
import { mensagemDeErro, faixaDaAba, type LerPlanilha } from "./coleta";
import type { Periodo } from "./indicadores";
import { centavos, lerData, lerValor, normalizar, textoLimpo, type Celula } from "./texto";

export type CampoPersonalizado = "data" | "valor" | "categoria" | "status" | "profissional" | "quantidade";
export type CampoQuebra = "categoria" | "status" | "profissional";

export interface FontePersonalizada {
  id: string;
  nome: string;
  sheetId: string;
  aba: string;
  linhaCabecalho?: number;
  colunas: Partial<Record<CampoPersonalizado, IndicacaoColuna>>;
  /** Só conta as linhas cujo campo tem um destes valores (sem diferenciar maiúsculas e acentos). */
  filtro?: { campo: CampoQuebra; valores: string[] } | null;
  medidas: { quantidade: boolean; valor: boolean; media: boolean };
  quebras: CampoQuebra[];
  /** Tipo do catálogo Gestfy, para comparar entre clínicas no futuro (benchmarking). */
  comparavel?: string;
}

export const ROTULOS_CAMPO: Record<CampoPersonalizado, string> = {
  data: "Data", valor: "Valor", categoria: "Categoria", status: "Status", profissional: "Profissional", quantidade: "Quantidade",
};

/** Nomes de cabeçalho reconhecidos sozinhos; o consultor pode indicar outro nome ou a letra. */
const DEF: DefinicaoFonte<CampoPersonalizado> = {
  data: { rotulo: "Data", nomes: ["data", "data do atendimento", "data da cirurgia", "data do contrato", "data da venda", "dia"], contem: ["data"], obrigatorio: true },
  valor: { rotulo: "Valor", nomes: ["valor", "valor total", "valor pago", "valor recebido", "valor do contrato"], contem: ["valor"] },
  categoria: { rotulo: "Categoria", nomes: ["categoria", "procedimento", "tipo", "plano", "servico", "origem"] },
  status: { rotulo: "Status", nomes: ["status", "situacao", "resultado"] },
  profissional: { rotulo: "Profissional", nomes: ["profissional", "medico", "responsavel", "cirurgiao", "vendedor"] },
  quantidade: { rotulo: "Quantidade", nomes: ["quantidade", "qtd", "qtde"] },
};

export const CATALOGO_COMPARAVEL = [
  { id: "", rotulo: "Não comparar entre clínicas" },
  { id: "contratos", rotulo: "Contratos fechados" },
  { id: "cirurgias", rotulo: "Cirurgias realizadas" },
  { id: "procedimentos", rotulo: "Procedimentos realizados" },
  { id: "recall", rotulo: "Contatos de recall" },
  { id: "entradas_bancarias", rotulo: "Entradas bancárias" },
  { id: "outro", rotulo: "Outro" },
];

export interface LinhaPersonalizada {
  data: string;
  valor: number | null;
  quantidade: number | null;
  categoria: string;
  status: string;
  profissional: string;
}

export interface LeituraPersonalizada {
  linhas: LinhaPersonalizada[];
  ignoradas: { linha: number; motivo: string }[];
  colunas: { campo: CampoPersonalizado; letra: string; cabecalho: string }[];
  faltando: string[];
  cabecalho: string[];
  linhaCabecalho: number;
}

/* ---------- configuração ---------- */

export function limparFontePersonalizada(f: Partial<FontePersonalizada>): FontePersonalizada {
  const s = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
  const campos = Object.keys(DEF) as CampoPersonalizado[];
  const quebrasOk: CampoQuebra[] = ["categoria", "status", "profissional"];
  const colunas: FontePersonalizada["colunas"] = {};
  for (const c of campos) {
    const v = s(f.colunas?.[c], 80);
    if (v) colunas[c] = /^[a-z]{1,2}$/i.test(v) ? v.toUpperCase() : v;
  }
  const filtroCampo = quebrasOk.find((q) => q === f.filtro?.campo);
  const valores = (f.filtro?.valores ?? []).map((v) => s(v, 60)).filter(Boolean).slice(0, 10);
  return {
    id: s(f.id, 40) || crypto.randomUUID(),
    nome: s(f.nome, 60) || "Fonte personalizada",
    sheetId: extrairId(s(f.sheetId, 300)),
    aba: s(f.aba, 100),
    linhaCabecalho: f.linhaCabecalho && f.linhaCabecalho > 0 ? Math.min(50, Math.floor(f.linhaCabecalho)) : undefined,
    colunas,
    filtro: filtroCampo && valores.length ? { campo: filtroCampo, valores } : null,
    medidas: { quantidade: f.medidas?.quantidade !== false, valor: !!f.medidas?.valor, media: !!f.medidas?.media },
    quebras: (f.quebras ?? []).filter((q): q is CampoQuebra => quebrasOk.includes(q as CampoQuebra)).slice(0, 3),
    comparavel: CATALOGO_COMPARAVEL.some((c) => c.id === f.comparavel) ? f.comparavel : "",
  };
}

function extrairId(t: string): string {
  const m = t.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : t;
}

/* ---------- leitura ---------- */

export function lerPlanilhaPersonalizada(valores: Celula[][], f: FontePersonalizada): LeituraPersonalizada {
  let ic = f.linhaCabecalho ? f.linhaCabecalho - 1 : 0;
  if (!f.linhaCabecalho) {
    let melhor = -1;
    for (let i = 0; i < Math.min(5, valores.length); i++) {
      const r = resolverColunas(valores[i] ?? [], DEF, f.colunas);
      const p = Object.keys(r.indices).length - r.faltando.length * 10;
      if (p > melhor) { melhor = p; ic = i; }
    }
  }
  const cab = valores[ic] ?? [];
  const res = resolverColunas(cab, DEF, f.colunas);
  const colunas = (Object.keys(res.origem) as CampoPersonalizado[]).map((c) => ({ campo: c, letra: res.origem[c]!.letra, cabecalho: res.origem[c]!.cabecalho }));
  const leitura: LeituraPersonalizada = { linhas: [], ignoradas: [], colunas, faltando: res.faltandoRotulos, cabecalho: cab.map((c) => textoLimpo(c)), linhaCabecalho: ic + 1 };
  if (res.faltando.length) return leitura;
  for (let i = ic + 1; i < valores.length; i++) {
    const bruta = valores[i] ?? [];
    if (bruta.every((c) => c === null || c === undefined || String(c).trim() === "")) continue;
    const get = (c: CampoPersonalizado) => celula(bruta, res.indices, c);
    const data = lerData(get("data"));
    if (!data) {
      // Linha só com texto sem data (subtotal, anotação) não conta como erro se não tiver valor.
      if (textoLimpo(get("data")) || lerValor(get("valor")) !== null) leitura.ignoradas.push({ linha: i + 1, motivo: `data ilegível: "${textoLimpo(get("data"))}"` });
      continue;
    }
    const valor = res.indices.valor !== undefined ? lerValor(get("valor")) : null;
    const qtd = res.indices.quantidade !== undefined ? lerValor(get("quantidade")) : null;
    leitura.linhas.push({
      data, valor, quantidade: qtd,
      categoria: textoLimpo(get("categoria")) || "Não informado",
      status: textoLimpo(get("status")) || "Não informado",
      profissional: textoLimpo(get("profissional")) || "Não informado",
    });
  }
  return leitura;
}

export async function lerFontePersonalizada(f: FontePersonalizada, ler: LerPlanilha): Promise<{ leitura: LeituraPersonalizada | null; erro: string | null }> {
  if (!f.sheetId || !f.aba) return { leitura: null, erro: "Informe o link da planilha e o nome da aba." };
  try {
    const valores = await ler(f.sheetId, faixaDaAba(f.aba));
    const leitura = lerPlanilhaPersonalizada(valores, f);
    if (leitura.faltando.length) return { leitura, erro: `Coluna não encontrada: ${leitura.faltando.join(", ")}. Indique a coluna pelo nome do cabeçalho ou pela letra.` };
    return { leitura, erro: null };
  } catch (e) {
    return { leitura: null, erro: mensagemDeErro(e) };
  }
}

/* ---------- cálculo ---------- */

export interface ItemQuebra { nome: string; quantidade: number; valor: number }
export interface NumerosPersonalizados { quantidade: number; valor: number; media: number | null }

export interface ResultadoPersonalizado {
  id: string;
  nome: string;
  medidas: FontePersonalizada["medidas"];
  filtro: FontePersonalizada["filtro"];
  comparavel?: string;
  atual: NumerosPersonalizados;
  anterior: NumerosPersonalizados;
  quebras: { campo: CampoQuebra; rotulo: string; itens: ItemQuebra[] }[];
  linhasLidas: number;
  ignoradas: number;
  erro: string | null;
}

const dentro = (d: string, p: Periodo) => d >= p.inicio && d <= p.fim;

function filtrar(linhas: LinhaPersonalizada[], f: FontePersonalizada): LinhaPersonalizada[] {
  if (!f.filtro) return linhas;
  const aceitos = new Set(f.filtro.valores.map(normalizar));
  return linhas.filter((l) => aceitos.has(normalizar(l[f.filtro!.campo])));
}

function numeros(linhas: LinhaPersonalizada[]): NumerosPersonalizados {
  const quantidade = linhas.reduce((s, l) => s + (l.quantidade ?? 1), 0);
  const comValor = linhas.filter((l) => l.valor !== null);
  const valor = centavos(comValor.reduce((s, l) => s + (l.valor ?? 0), 0));
  return { quantidade, valor, media: comValor.length ? centavos(valor / comValor.reduce((s, l) => s + (l.quantidade ?? 1), 0)) : null };
}

const ROTULO_QUEBRA: Record<CampoQuebra, string> = { categoria: "Por categoria", status: "Por status", profissional: "Por profissional" };

export function calcularPersonalizada(f: FontePersonalizada, leitura: LeituraPersonalizada | null, periodo: Periodo, anterior: Periodo, erro: string | null = null): ResultadoPersonalizado {
  const todas = filtrar(leitura?.linhas ?? [], f);
  const atual = todas.filter((l) => dentro(l.data, periodo));
  const antes = todas.filter((l) => dentro(l.data, anterior));
  const quebras = f.quebras.map((campo) => {
    const mapa = new Map<string, ItemQuebra>();
    for (const l of atual) {
      const k = normalizar(l[campo]);
      const it = mapa.get(k) ?? { nome: l[campo], quantidade: 0, valor: 0 };
      it.quantidade += l.quantidade ?? 1;
      it.valor = centavos(it.valor + (l.valor ?? 0));
      mapa.set(k, it);
    }
    const itens = [...mapa.values()].sort((a, b) => (f.medidas.valor ? b.valor - a.valor : 0) || b.quantidade - a.quantidade);
    return { campo, rotulo: ROTULO_QUEBRA[campo], itens };
  });
  return {
    id: f.id, nome: f.nome, medidas: f.medidas, filtro: f.filtro ?? null, comparavel: f.comparavel || undefined,
    atual: numeros(atual), anterior: numeros(antes), quebras,
    linhasLidas: leitura?.linhas.length ?? 0, ignoradas: leitura?.ignoradas.length ?? 0, erro,
  };
}
