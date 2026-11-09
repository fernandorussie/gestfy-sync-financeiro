/**
 * Leitores das planilhas de origem da clínica.
 *
 * Cada leitor recebe as linhas cruas (como vêm da API do Google Sheets) e
 * devolve registros tipados, sem filtrar período. Linhas com conteúdo mas
 * com data ou valor ilegível viram avisos, para a conferência mostrar.
 * Nenhum leitor chama a API: isso fica na camada de coleta, o que permite
 * testar tudo com dados fixos.
 */
import { celula, resolverColunas, type DefinicaoFonte, type IndicacaoColuna, type ResultadoColunas } from "./colunas";
import { lerData, lerSimNao, lerSituacao, lerValor, normalizar, textoLimpo, type Celula, type DataISO } from "./texto";

export interface AvisoLeitura {
  /** Linha da planilha (1 = primeira linha). */
  linha: number;
  campo: string;
  valor: string;
  motivo: string;
}

export interface Leitura<T, C extends string> {
  registros: T[];
  avisos: AvisoLeitura[];
  colunas: ResultadoColunas<C>;
  /** Linha do cabeçalho (1 = primeira linha da aba). */
  linhaCabecalho: number;
}

export interface OpcoesLeitura<C extends string> {
  /** Colunas indicadas manualmente no mapa da clínica (nome do cabeçalho ou letra). */
  colunas?: Partial<Record<C, IndicacaoColuna>>;
  /** Linha do cabeçalho (1 = primeira). Sem isso, o leitor procura nas 5 primeiras linhas. */
  linhaCabecalho?: number;
}

function acharCabecalho<C extends string>(linhas: Celula[][], def: DefinicaoFonte<C>, op: OpcoesLeitura<C>): number {
  if (op.linhaCabecalho) return op.linhaCabecalho - 1;
  let melhor = 0;
  let pontos = -1;
  for (let i = 0; i < Math.min(5, linhas.length); i++) {
    const r = resolverColunas(linhas[i] ?? [], def, op.colunas);
    const p = Object.keys(r.indices).length - r.faltando.length * 10;
    if (p > pontos) { pontos = p; melhor = i; }
  }
  return melhor;
}

function vazia(linha: Celula[]): boolean {
  return linha.every((c) => c === null || c === undefined || String(c).trim() === "");
}

function ler<T, C extends string>(
  linhas: Celula[][],
  def: DefinicaoFonte<C>,
  op: OpcoesLeitura<C>,
  montar: (get: (c: C) => Celula, aviso: (campo: C, motivo: string) => void, linha: number) => T | null,
): Leitura<T, C> {
  const ic = acharCabecalho(linhas, def, op);
  const colunas = resolverColunas(linhas[ic] ?? [], def, op.colunas);
  const registros: T[] = [];
  const avisos: AvisoLeitura[] = [];
  for (let i = ic + 1; i < linhas.length; i++) {
    const bruta = linhas[i] ?? [];
    if (vazia(bruta)) continue;
    const get = (c: C) => celula(bruta, colunas.indices, c);
    const aviso = (campo: C, motivo: string) =>
      avisos.push({ linha: i + 1, campo: def[campo].rotulo, valor: String(get(campo) ?? ""), motivo });
    const r = montar(get, aviso, i + 1);
    if (r) registros.push(r);
  }
  return { registros, avisos, colunas, linhaCabecalho: ic + 1 };
}

/** Data obrigatória: avisa e descarta a linha quando não dá para ler. */
function dataOuAviso<C extends string>(get: (c: C) => Celula, aviso: (c: C, m: string) => void, campo: C): DataISO | null {
  const bruto = get(campo);
  const d = lerData(bruto);
  if (!d) aviso(campo, bruto === undefined || bruto === "" ? "data em branco" : "data não reconhecida");
  return d;
}

/** Valor opcional: em branco vira null; texto que não é número gera aviso. */
function valorOuAviso<C extends string>(get: (c: C) => Celula, aviso: (c: C, m: string) => void, campo: C): number | null {
  const bruto = get(campo);
  const v = lerValor(bruto);
  if (v === null && bruto !== undefined && bruto !== null && String(bruto).trim() !== "") aviso(campo, "valor não reconhecido");
  return v;
}

/** "out.26", "out/2026", "10/2026", "2026-10" ou uma data → "2026-10". */
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export function lerMes(valor: Celula): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const d = lerData(valor);
  if (d) return d.slice(0, 7);
  const s = normalizar(valor).replace(/\s/g, "");
  let m = s.match(/^([a-z]{3})[a-z]*[./-]?(\d{2}|\d{4})$/);
  if (m) {
    const mes = MESES.indexOf(m[1]);
    if (mes < 0) return null;
    const ano = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    return `${ano}-${String(mes + 1).padStart(2, "0")}`;
  }
  m = s.match(/^(\d{1,2})[./-](\d{4})$/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})-(\d{2})$/);
  return m ? `${m[1]}-${m[2]}` : null;
}

/* ============================== VENDAS ============================== */

export type CampoVenda = "data" | "paciente" | "primeiraVez" | "valor" | "categoria" | "grupo" | "profissional" | "pagamento" | "unidade" | "descricao";

export const DEF_VENDAS: DefinicaoFonte<CampoVenda> = {
  data: { rotulo: "Data de atendimento", nomes: ["data de atendimento", "data do atendimento", "data"], obrigatorio: true },
  paciente: { rotulo: "Cliente / paciente", nomes: ["paciente", "nome do paciente", "nome paciente", "cliente", "nome do cliente", "nome"], obrigatorio: true },
  primeiraVez: { rotulo: "1ª vez (cliente novo)", nomes: ["1ª vez na clinica?", "1a vez na clinica?", "primeira vez", "paciente novo", "novo?"], contem: ["vez na clinica"] },
  valor: { rotulo: "Valor pago", nomes: ["valor pago", "valor recebido", "valor"], obrigatorio: true },
  categoria: { rotulo: "Categoria", nomes: ["categoria", "servico", "procedimento"] },
  grupo: { rotulo: "Grupo de receita", nomes: ["categoria_ajustada", "categoria ajustada", "grupo"] },
  profissional: { rotulo: "Profissional", nomes: ["profissional responsavel", "profissional", "medico responsavel", "medico"] },
  pagamento: { rotulo: "Meio de pagamento", nomes: ["meio de pagamento", "forma de pagamento", "pagamento"] },
  unidade: { rotulo: "Unidade", nomes: ["unidade", "centro de custo", "filial"] },
  descricao: { rotulo: "Descrição", nomes: ["descricao da venda", "descricao"] },
};

export interface Venda {
  linha: number;
  data: DataISO;
  paciente: string;
  primeiraVez: boolean | null;
  /** null = célula em branco. */
  valor: number | null;
  categoria: string;
  grupo: string;
  profissional: string;
  pagamento: string;
  unidade: string;
  descricao: string;
}

export function lerVendas(linhas: Celula[][], op: OpcoesLeitura<CampoVenda> = {}): Leitura<Venda, CampoVenda> {
  return ler(linhas, DEF_VENDAS, op, (get, aviso, linha) => {
    const data = dataOuAviso(get, aviso, "data");
    if (!data) return null;
    const paciente = textoLimpo(get("paciente"));
    const valor = valorOuAviso(get, aviso, "valor");
    if (!paciente && valor === null && !textoLimpo(get("categoria")) && !textoLimpo(get("grupo"))) {
      aviso("paciente", "linha só com a data preenchida (ignorada)");
      return null;
    }
    return {
      linha, data, paciente,
      primeiraVez: lerSimNao(get("primeiraVez")),
      valor,
      categoria: textoLimpo(get("categoria")),
      grupo: textoLimpo(get("grupo")),
      profissional: textoLimpo(get("profissional")),
      pagamento: textoLimpo(get("pagamento")),
      unidade: textoLimpo(get("unidade")),
      descricao: textoLimpo(get("descricao")),
    };
  });
}

/* ============================== DESPESAS ============================== */

export type CampoDespesa = "dataPagamento" | "dataVencimento" | "descricao" | "categoria" | "valor" | "pago" | "periodicidade" | "competencia" | "centroCusto";

export const DEF_DESPESAS: DefinicaoFonte<CampoDespesa> = {
  dataPagamento: { rotulo: "Data de pagamento", nomes: ["data pgto", "data de pagamento", "data pagamento", "data do ultimo pagamento", "pagamento"], obrigatorio: true },
  dataVencimento: { rotulo: "Data de vencimento", nomes: ["data vcto", "data de vencimento", "vencimento"] },
  descricao: { rotulo: "Descrição", nomes: ["descricao", "historico", "fornecedor"] },
  categoria: { rotulo: "Categoria", nomes: ["ajuste_categoria", "categoria ajustada", "categoria"], obrigatorio: true },
  valor: { rotulo: "Valor", nomes: ["valor r$", "valor pago", "valor total pago da parcela (r$)", "valor pago da parcela (r$)", "valor"], obrigatorio: true },
  pago: { rotulo: "Pago? / situação", nomes: ["pago?", "pago", "status", "situacao"] },
  periodicidade: { rotulo: "Periodicidade", nomes: ["periodicidade", "recorrencia"] },
  competencia: { rotulo: "Competência", nomes: ["competencia", "mes de competencia", "mes_comp", "data de competencia"] },
  centroCusto: { rotulo: "Centro de custo", nomes: ["centro de custo", "unidade"] },
};

export interface Despesa {
  linha: number;
  /** null = ainda não paga (conta a pagar, se tiver vencimento). */
  dataPagamento: DataISO | null;
  dataVencimento: DataISO | null;
  descricao: string;
  categoria: string;
  /** Sempre positivo: planilhas que lançam saída como negativo são normalizadas. */
  valor: number;
  /** false = marcada como não paga / em aberto (fica fora das saídas); null = sem a informação. */
  pago: boolean | null;
  periodicidade: string;
  /** "AAAA-MM" */
  competencia: string | null;
  centroCusto: string;
}

export function lerDespesas(linhas: Celula[][], op: OpcoesLeitura<CampoDespesa> = {}): Leitura<Despesa, CampoDespesa> {
  return ler(linhas, DEF_DESPESAS, op, (get, aviso, linha) => {
    const dataPagamento = lerData(get("dataPagamento"));
    const dataVencimento = lerData(get("dataVencimento"));
    if (!dataPagamento && !dataVencimento) { aviso("dataPagamento", "sem data de pagamento nem de vencimento"); return null; }
    const valor = valorOuAviso(get, aviso, "valor");
    if (valor === null) { if (get("valor") === undefined || String(get("valor")).trim() === "") aviso("valor", "valor em branco"); return null; }
    return {
      linha, dataPagamento, dataVencimento,
      descricao: textoLimpo(get("descricao")),
      categoria: textoLimpo(get("categoria")),
      valor: Math.abs(valor),
      pago: lerSituacao(get("pago")),
      periodicidade: textoLimpo(get("periodicidade")),
      competencia: lerMes(get("competencia")),
      centroCusto: textoLimpo(get("centroCusto")),
    };
  });
}

/* ============================== ENTRADAS (recebimentos) ============================== */

export type CampoEntrada = "data" | "valor" | "situacao" | "categoria" | "forma" | "competencia" | "descricao";

/**
 * Entradas de caixa: dinheiro que entrou de fato. Fonte opcional. Os nomes
 * cobrem planilhas manuais ("Data Receb.", "Vl Receb. R$", "Status") e
 * exportações de sistemas financeiros ("Data do último pagamento",
 * "Valor total recebido da parcela", "Situação").
 */
export const DEF_ENTRADAS: DefinicaoFonte<CampoEntrada> = {
  data: { rotulo: "Data do recebimento", nomes: ["data receb", "data do recebimento", "data de recebimento", "data recebimento", "data do ultimo pagamento", "data pgto", "data de pagamento", "data"], obrigatorio: true },
  valor: { rotulo: "Valor recebido", nomes: ["valor total recebido da parcela (r$)", "valor recebido da parcela (r$)", "vl receb r$", "vl receb", "valor recebido", "valor r$", "valor"], obrigatorio: true },
  situacao: { rotulo: "Situação", nomes: ["status recebido", "status do recebimento", "recebido?", "recebido", "status", "situacao"] },
  categoria: { rotulo: "Categoria", nomes: ["categoria", "categoria 1", "categoria gestfy"] },
  forma: { rotulo: "Forma de recebimento", nomes: ["forma receb", "forma de recebimento", "forma de pagamento", "meio de pagamento"] },
  competencia: { rotulo: "Competência", nomes: ["data de competencia", "competencia", "mes de competencia"] },
  descricao: { rotulo: "Descrição", nomes: ["descricao", "cliente/forneced/descricao", "historico"] },
};

export interface Recebimento {
  linha: number;
  data: DataISO;
  /** Pode ser negativo (estorno). */
  valor: number;
  /** true = recebido, false = em aberto/previsto, null = sem situação informada. */
  recebido: boolean | null;
  situacao: string;
  categoria: string;
  forma: string;
  /** "AAAA-MM" */
  competencia: string | null;
  /** Só para conferência na tela; nunca vai para relatório nem para o Claude. */
  descricao: string;
}

export function lerEntradas(linhas: Celula[][], op: OpcoesLeitura<CampoEntrada> = {}): Leitura<Recebimento, CampoEntrada> {
  return ler(linhas, DEF_ENTRADAS, op, (get, aviso, linha) => {
    const bruto = get("valor");
    // Linha sem valor (saldo inicial em branco, anotação) não é recebimento nem erro.
    if (bruto === undefined || bruto === null || String(bruto).trim() === "") return null;
    const valor = valorOuAviso(get, aviso, "valor");
    if (valor === null || valor === 0) return null;
    const data = lerData(get("data"));
    if (!data) { aviso("data", "sem data de recebimento"); return null; }
    return {
      linha, data, valor,
      recebido: lerSituacao(get("situacao")),
      situacao: textoLimpo(get("situacao")),
      categoria: textoLimpo(get("categoria")),
      forma: textoLimpo(get("forma")),
      competencia: lerMes(get("competencia")),
      descricao: textoLimpo(get("descricao")),
    };
  });
}

/* ============================== ORÇAMENTOS ============================== */

export type CampoOrcamento = "data" | "paciente" | "profissional" | "prescricao" | "status" | "valorVenda" | "valorPrescricao";

export const DEF_ORCAMENTOS: DefinicaoFonte<CampoOrcamento> = {
  data: { rotulo: "Data", nomes: ["data", "data da consulta", "data do orcamento"], obrigatorio: true },
  paciente: { rotulo: "Cliente / paciente", nomes: ["nome paciente", "paciente", "cliente", "nome"] },
  profissional: { rotulo: "Profissional", nomes: ["medico responsavel", "profissional", "medico"] },
  prescricao: { rotulo: "Prescrição de tratamento", nomes: ["prescricao de tratamentos?", "prescricao de tratamento?", "prescricao"], contem: ["prescricao de trat"] },
  status: { rotulo: "Fechamento", nomes: ["fechamento", "status do orcamento", "situacao"], obrigatorio: true },
  valorVenda: { rotulo: "Valor da venda", nomes: ["valor da venda", "valor fechado", "valor vendido"] },
  valorPrescricao: { rotulo: "Valor da prescrição", nomes: ["valor prescricao", "valor da prescricao", "valor orcado", "valor do orcamento"] },
};

export interface Orcamento {
  linha: number;
  data: DataISO;
  paciente: string;
  profissional: string;
  prescricao: boolean | null;
  status: string;
  valorVenda: number;
  valorPrescricao: number;
}

export function lerOrcamentos(linhas: Celula[][], op: OpcoesLeitura<CampoOrcamento> = {}): Leitura<Orcamento, CampoOrcamento> {
  return ler(linhas, DEF_ORCAMENTOS, op, (get, aviso, linha) => {
    const data = dataOuAviso(get, aviso, "data");
    if (!data) return null;
    return {
      linha, data,
      paciente: textoLimpo(get("paciente")),
      profissional: textoLimpo(get("profissional")),
      prescricao: lerSimNao(get("prescricao")),
      status: textoLimpo(get("status")),
      valorVenda: valorOuAviso(get, aviso, "valorVenda") ?? 0,
      valorPrescricao: valorOuAviso(get, aviso, "valorPrescricao") ?? 0,
    };
  });
}

/* ============================== LEADS ============================== */

export type CampoLead = "data" | "origem" | "canal" | "interesse" | "status" | "objecao" | "responsavel";

export const DEF_LEADS: DefinicaoFonte<CampoLead> = {
  // "Data_Ajuste" primeiro: a data do 1º contato vem em UTC e pode cair no dia anterior.
  data: { rotulo: "Data do contato", nomes: ["data_ajuste", "data ajustada", "data 1º contato", "data do 1º contato", "data"], contem: ["contato"], obrigatorio: true },
  origem: { rotulo: "Origem", nomes: ["origem", "por onde veio?", "como conheceu"] },
  canal: { rotulo: "Canal", nomes: ["canal", "contato cliente"] },
  interesse: { rotulo: "Interesse", nomes: ["interesse", "servico"] },
  status: { rotulo: "Status", nomes: ["status final", "agendou?", "status"], obrigatorio: true },
  objecao: { rotulo: "Objeção", nomes: ["objecao", "objecao (caso nao agende)", "motivo de perda"], contem: ["objecao"] },
  responsavel: { rotulo: "Responsável", nomes: ["responsavel", "atendente"] },
};

export interface Lead {
  linha: number;
  data: DataISO;
  origem: string;
  canal: string;
  interesse: string;
  status: string;
  objecao: string;
  responsavel: string;
}

export function lerLeads(linhas: Celula[][], op: OpcoesLeitura<CampoLead> = {}): Leitura<Lead, CampoLead> {
  return ler(linhas, DEF_LEADS, op, (get, aviso, linha) => {
    const data = dataOuAviso(get, aviso, "data");
    if (!data) return null;
    return {
      linha, data,
      origem: textoLimpo(get("origem")),
      canal: textoLimpo(get("canal")),
      interesse: textoLimpo(get("interesse")),
      status: textoLimpo(get("status")),
      objecao: textoLimpo(get("objecao")),
      responsavel: textoLimpo(get("responsavel")),
    };
  });
}

/* ============================== NPS ============================== */

export type CampoNps = "data" | "indicacao" | "profissional" | "recepcao" | "infraestrutura" | "enfermagem";

export const DEF_NPS: DefinicaoFonte<CampoNps> = {
  data: { rotulo: "Data", nomes: ["data ajustada", "data", "carimbo de data/hora"], obrigatorio: true },
  indicacao: { rotulo: "Nota de 0 a 10", nomes: ["nps", "nota"], contem: ["0 a 10", "indicaria"], obrigatorio: true },
  profissional: { rotulo: "Nota do profissional", nomes: [], contem: ["profissional de saude", "atendimento do profissional", "medico"] },
  recepcao: { rotulo: "Nota da recepção", nomes: [], contem: ["recepcao"] },
  infraestrutura: { rotulo: "Nota da infraestrutura", nomes: [], contem: ["infraestrutura", "estrutura"] },
  enfermagem: { rotulo: "Nota da enfermagem", nomes: [], contem: ["enfermagem"] },
};

export interface RespostaNps {
  linha: number;
  data: DataISO;
  indicacao: number | null;
  profissional: number | null;
  recepcao: number | null;
  infraestrutura: number | null;
  enfermagem: number | null;
}

export function lerNps(linhas: Celula[][], op: OpcoesLeitura<CampoNps> = {}): Leitura<RespostaNps, CampoNps> {
  return ler(linhas, DEF_NPS, op, (get, aviso, linha) => {
    const data = dataOuAviso(get, aviso, "data");
    if (!data) return null;
    return {
      linha, data,
      indicacao: valorOuAviso(get, aviso, "indicacao"),
      profissional: valorOuAviso(get, aviso, "profissional"),
      recepcao: valorOuAviso(get, aviso, "recepcao"),
      infraestrutura: valorOuAviso(get, aviso, "infraestrutura"),
      enfermagem: valorOuAviso(get, aviso, "enfermagem"),
    };
  });
}

/* ============================== AVALIAÇÕES GOOGLE ============================== */

export type CampoAvaliacao = "data" | "nota";

export const DEF_AVALIACOES: DefinicaoFonte<CampoAvaliacao> = {
  data: { rotulo: "Data", nomes: ["data ajustada", "data", "data iso"], obrigatorio: true },
  nota: { rotulo: "Nota", nomes: ["nota (rating)", "nota", "rating"], obrigatorio: true },
};

export interface Avaliacao {
  linha: number;
  data: DataISO;
  nota: number | null;
}

export function lerAvaliacoes(linhas: Celula[][], op: OpcoesLeitura<CampoAvaliacao> = {}): Leitura<Avaliacao, CampoAvaliacao> {
  return ler(linhas, DEF_AVALIACOES, op, (get, aviso, linha) => {
    const data = dataOuAviso(get, aviso, "data");
    if (!data) return null;
    return { linha, data, nota: valorOuAviso(get, aviso, "nota") };
  });
}
