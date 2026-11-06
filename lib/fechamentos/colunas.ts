/**
 * Encontra as colunas de uma planilha pelo nome do cabeçalho.
 *
 * Cada fonte (vendas, despesas…) declara seus campos com os nomes que
 * costumam aparecer nas planilhas das clínicas. Assim a leitura não quebra
 * quando alguém insere uma coluna. Quando o cabeçalho é diferente de tudo
 * (ou está em branco, como a coluna de unidade da Claros), o mapa da
 * clínica informa a coluna pelo nome exato ou pela letra.
 */
import { indiceDaLetra, letraDoIndice, normalizar, type Celula } from "./texto";

export interface DefinicaoCampo {
  /** Rótulo para mensagens ("Valor pago"). */
  rotulo: string;
  /** Nomes de cabeçalho aceitos, em ordem de preferência (comparação exata após normalizar). */
  nomes: string[];
  /** Trechos aceitos quando nenhum nome bate exatamente (ex.: "0 a 10" para a nota do NPS). */
  contem?: string[];
  obrigatorio?: boolean;
}

export type DefinicaoFonte<C extends string> = Record<C, DefinicaoCampo>;

/**
 * Indicação manual de coluna para um campo: o nome exato do cabeçalho
 * ou a letra da coluna (ex.: "R"). Letra só vale com 1 a 3 letras maiúsculas.
 */
export type IndicacaoColuna = string;

export interface ResultadoColunas<C extends string> {
  /** Índice (0 = coluna A) de cada campo encontrado. */
  indices: Partial<Record<C, number>>;
  /** Campos obrigatórios que não foram encontrados. */
  faltando: C[];
  /** Os mesmos campos, pelo rótulo que aparece na tela ("Valor pago"). */
  faltandoRotulos: string[];
  /** Como cada campo foi encontrado, para mostrar na tela de configuração. */
  origem: Partial<Record<C, { letra: string; cabecalho: string; como: "indicado" | "nome" | "trecho" }>>;
}

const EH_LETRA = /^[A-Z]{1,3}$/;

export function resolverColunas<C extends string>(
  cabecalho: Celula[],
  definicao: DefinicaoFonte<C>,
  indicadas: Partial<Record<C, IndicacaoColuna>> = {},
): ResultadoColunas<C> {
  const cab = cabecalho.map(normalizar);
  const usados = new Set<number>();
  const indices: Partial<Record<C, number>> = {};
  const origem: ResultadoColunas<C>["origem"] = {};
  const campos = Object.keys(definicao) as C[];

  const marcar = (campo: C, idx: number, como: "indicado" | "nome" | "trecho") => {
    indices[campo] = idx;
    usados.add(idx);
    origem[campo] = { letra: letraDoIndice(idx), cabecalho: String(cabecalho[idx] ?? ""), como };
  };

  // 1. O que o mapa da clínica indicou manualmente tem prioridade.
  for (const campo of campos) {
    const ind = indicadas[campo];
    if (!ind) continue;
    const idx = EH_LETRA.test(ind) ? indiceDaLetra(ind) : cab.indexOf(normalizar(ind));
    if (idx >= 0) marcar(campo, idx, "indicado");
  }
  // 2. Nome exato, na ordem de preferência de cada campo.
  for (const campo of campos) {
    if (indices[campo] !== undefined) continue;
    for (const nome of definicao[campo].nomes) {
      const idx = cab.findIndex((h, i) => h === normalizar(nome) && !usados.has(i));
      if (idx >= 0) { marcar(campo, idx, "nome"); break; }
    }
  }
  // 3. Trecho do nome.
  for (const campo of campos) {
    if (indices[campo] !== undefined) continue;
    for (const trecho of definicao[campo].contem ?? []) {
      const t = normalizar(trecho);
      const idx = cab.findIndex((h, i) => h.includes(t) && !usados.has(i));
      if (idx >= 0) { marcar(campo, idx, "trecho"); break; }
    }
  }

  const faltando = campos.filter((c) => definicao[c].obrigatorio && indices[c] === undefined);
  return { indices, faltando, faltandoRotulos: faltando.map((c) => definicao[c].rotulo), origem };
}

/** Lê a célula de um campo numa linha (undefined quando o campo não foi mapeado). */
export function celula<C extends string>(linha: Celula[], indices: Partial<Record<C, number>>, campo: C): Celula {
  const idx = indices[campo];
  return idx === undefined ? undefined : linha[idx];
}
