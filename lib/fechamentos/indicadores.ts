/**
 * Motor de indicadores do fechamento.
 *
 * Uma única definição para cada indicador, usada no quinzenal, no mensal e
 * nos comparativos. Recebe os registros já lidos das planilhas, o período,
 * as regras da clínica e os ajustes decididos na conferência; devolve os
 * números prontos para tela, PDF, texto e IA. Não lê planilha nem banco.
 */
import type { Avaliacao, Despesa, Lead, Orcamento, Recebimento, RespostaNps, Venda } from "./leitores";
import { grupoDaEntrada, type GrupoEntrada } from "./entradas";
import { GRUPO_SEM_CLASSIFICACAO, GRUPOS_DESPESA, montarPlano } from "./plano-contas";
import { centavos, normalizar, type DataISO } from "./texto";

export interface Periodo {
  inicio: DataISO;
  fim: DataISO;
}

/** null = a clínica não tem essa fonte configurada (diferente de "fonte vazia no período"). */
export interface DadosFechamento {
  vendas: Venda[] | null;
  despesas: Despesa[] | null;
  orcamentos: Orcamento[] | null;
  leads: Lead[] | null;
  nps: RespostaNps[] | null;
  avaliacoes: Avaliacao[] | null;
  /** Entradas de caixa (recebimentos). Fonte opcional: sem ela, não existe "resultado de caixa". */
  entradas?: Recebimento[] | null;
}

/** Regras fixas da clínica, guardadas no mapa dela. */
export interface RegrasClinica {
  /** Categoria de despesa → grupo, além do plano padrão. */
  categoriasDespesa?: Record<string, string>;
  /** Categoria de venda → grupo de receita, quando a planilha não tem coluna de grupo. */
  gruposReceita?: Record<string, string>;
  /** Status de lead que contam como agendamento (comparação exata, sem acento/caixa). */
  statusAgendou?: string[];
  /** Trechos de status de orçamento que contam como fechado. */
  statusFechado?: string[];
  statusEmAberto?: string[];
  statusNaoFechou?: string[];
  /** Status de orçamento cancelado (contém): fora das taxas de conversão. */
  statusCancelado?: string[];
  /** Categoria de entrada (normalizada) → grupo, confirmado pelo consultor. */
  categoriasEntrada?: Record<string, GrupoEntrada>;
}

export type CampoUnificavel = "profissional" | "unidade" | "pagamento" | "origem" | "interesse" | "objecao" | "grupoReceita";

/** Decisões tomadas na conferência deste fechamento. */
export interface Ajustes {
  /** Linha da planilha de despesas → nova categoria. */
  reclassificarDespesa?: Record<number, string>;
  /** Por campo: nome como está → nome unificado. Ex.: { profissional: { "Dra. Ana": "Dra. Ana Clara" } }. */
  unificar?: Partial<Record<CampoUnificavel, Record<string, string>>>;
}

export interface ItemValor {
  nome: string;
  valor: number;
  /** Fração do total (0,24 = 24%). */
  pct: number;
}

export interface ItemContagem {
  nome: string;
  quantidade: number;
  pct: number;
}

export interface GrupoReceita extends ItemValor {
  quantidade: number;
  ticket: number;
}

export interface GrupoDespesa extends ItemValor {
  categorias: ItemValor[];
}

export interface Indicadores {
  periodo: Periodo;
  faturamento: {
    total: number;
    lancamentos: number;
    /** Lançamentos com valor zero ou em branco (retornos, cortesias). */
    semValor: number;
    porGrupo: GrupoReceita[];
    porProfissional: ItemValor[];
    porUnidade: ItemValor[];
    porPagamento: ItemValor[];
  } | null;
  pacientes: {
    atendidos: number;
    novos: number;
    ticketMedio: number;
    faturamentoNovos: number;
    ticketNovos: number;
    /** false quando a coluna "1ª vez" não existe ou está toda em branco. */
    temInformacaoDeNovos: boolean;
  } | null;
  despesas: {
    total: number;
    lancamentos: number;
    porGrupo: GrupoDespesa[];
    /** Linhas com data de pagamento no período mas marcadas como não pagas: ficam fora do total. */
    naoPagas?: { quantidade: number; valor: number };
  } | null;
  /** Entradas de caixa do período (só com a fonte de Entradas). */
  entradas?: {
    /** Operacionais + não operacionais: o que entra no resultado de caixa. */
    total: number;
    operacionais: number;
    naoOperacionais: number;
    /** Transferências, empréstimos, aportes: só informação. */
    foraDoResultado: number;
    lancamentos: number;
    porCategoria: (ItemValor & { grupo: GrupoEntrada })[];
    /** Linhas sem situação informada (contadas como recebidas). */
    semSituacao: number;
    /** Linhas marcadas como em aberto/previstas (fora do total). */
    emAberto: { quantidade: number; valor: number };
  } | null;
  /**
   * Resultado do período. real = true: Entradas − Saídas (resultado de caixa, com a fonte de Entradas).
   * real = false: Faturamento − Saídas ("Faturamento x Despesas"); "entradas" aqui é o faturamento.
   */
  caixa: { entradas: number; saidas: number; resultado: number; margem: number | null; real?: boolean } | null;
  leads: {
    total: number;
    agendados: number;
    conversao: number | null;
    porOrigem: ItemContagem[];
    porObjecao: ItemContagem[];
    porInteresse: ItemContagem[];
    /** Canal de entrada (WhatsApp, ligação…). Ausente em fechamentos antigos. */
    porCanal?: ItemContagem[];
  } | null;
  orcamentos: {
    total: number;
    fechados: number;
    emAberto: number;
    naoFechou: number;
    /** Cancelados: ficam fora das taxas de conversão. Ausente em fechamentos antigos. */
    cancelados?: number;
    valorCancelado?: number;
    porStatus: ItemContagem[];
    /** Motivos de não fechamento, da própria fonte de orçamentos (nunca dos leads). */
    porObjecao?: ItemContagem[];
    valorGerado: number;
    valorFechado: number;
    valorEmAberto: number;
    conversaoQuantidade: number | null;
    conversaoValor: number | null;
  } | null;
  nps: {
    respostas: number;
    nps: number | null;
    promotores: number;
    neutros: number;
    detratores: number;
    notas: { profissional: number | null; recepcao: number | null; infraestrutura: number | null; enfermagem: number | null };
  } | null;
  google: { avaliacoes: number; nota: number | null } | null;
  meta: { valor: number; atingimento: number; falta: number } | null;
}

const PADRAO = {
  statusAgendou: ["agendou", "agendado", "sim"],
  statusFechado: ["protocolo", "fechou", "fechado", "vendido"],
  statusEmAberto: ["em negociacao", "agendado", "aguardando", "pendente"],
  statusNaoFechou: ["nao fechou", "perdido", "desistiu"],
  statusCancelado: ["cancelad"],
};

export const NAO_INFORMADO = "Não informado";

const noPeriodo = (d: DataISO | null, p: Periodo) => !!d && d >= p.inicio && d <= p.fim;
const frac = (a: number, b: number) => (b ? a / b : 0);
const fracOuNull = (a: number, b: number) => (b ? a / b : null);
const media = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? centavos(v.reduce((s, x) => s + x, 0) / v.length) : null;
};

/**
 * Agrupa por nome tolerando grafias diferentes ("Bangu", "BANGU", "BANgu" → um
 * grupo só). O nome exibido é a grafia mais frequente. `unificar` junta nomes
 * que a conferência decidiu tratar como o mesmo.
 */
export function agruparPorNome<T>(
  itens: T[],
  nomeDe: (t: T) => string,
  valorDe: (t: T) => number,
  unificar: Record<string, string> = {},
  vazio = NAO_INFORMADO,
): { nome: string; valor: number; quantidade: number; variantes: string[] }[] {
  const alias = new Map(Object.entries(unificar).map(([de, para]) => [normalizar(de), para]));
  const grupos = new Map<string, { valor: number; quantidade: number; grafias: Map<string, number>; fixo?: string }>();
  for (const t of itens) {
    let nome = nomeDe(t).trim() || vazio;
    const destino = alias.get(normalizar(nome));
    if (destino) nome = destino;
    const k = normalizar(nome);
    const g = grupos.get(k) ?? { valor: 0, quantidade: 0, grafias: new Map<string, number>(), fixo: destino };
    g.valor += valorDe(t);
    g.quantidade += 1;
    g.grafias.set(nome, (g.grafias.get(nome) ?? 0) + 1);
    if (destino) g.fixo = destino;
    grupos.set(k, g);
  }
  return [...grupos.values()].map((g) => {
    const grafias = [...g.grafias.entries()].sort((a, b) => b[1] - a[1]);
    return { nome: g.fixo ?? grafias[0][0], valor: centavos(g.valor), quantidade: g.quantidade, variantes: grafias.map((x) => x[0]) };
  });
}

const porValor = (a: { valor: number }, b: { valor: number }) => b.valor - a.valor;
const porQuantidade = (a: { quantidade: number }, b: { quantidade: number }) => b.quantidade - a.quantidade;

function itensValor(lista: { nome: string; valor: number }[], total: number): ItemValor[] {
  return lista.map((g) => ({ nome: g.nome, valor: g.valor, pct: frac(g.valor, total) })).sort(porValor);
}
function itensContagem(lista: { nome: string; quantidade: number }[], total: number): ItemContagem[] {
  return lista.map((g) => ({ nome: g.nome, quantidade: g.quantidade, pct: frac(g.quantidade, total) })).sort(porQuantidade);
}

/** "CREDITO 6x", "Crédito 10X" → "CREDITO": o parcelamento não separa o meio de pagamento. */
export function meioDePagamento(texto: string): string {
  return texto.replace(/\s*\(?\d{1,2}\s*x\)?\s*$/i, "").trim();
}

/** Grupo de receita de uma venda: coluna de grupo, depois regra da clínica, depois a própria categoria. */
export function grupoDaVenda(v: Venda, regras: RegrasClinica = {}): string {
  if (v.grupo) return v.grupo;
  const mapa = regras.gruposReceita ?? {};
  const achado = Object.entries(mapa).find(([cat]) => normalizar(cat) === normalizar(v.categoria));
  return achado?.[1] ?? (v.categoria || "Sem categoria");
}

/** Categoria final de uma despesa depois das reclassificações. */
export function categoriaDaDespesa(d: Despesa, ajustes: Ajustes = {}): string {
  return ajustes.reclassificarDespesa?.[d.linha] ?? d.categoria;
}

/** Ordem alfabética (pt-BR), com "Outros", "Sem categoria" e "Não informado" no fim. */
const FIM = new Set(["outros", "sem categoria", normalizar(NAO_INFORMADO)]);
export function ordemAlfabetica(a: { nome: string }, b: { nome: string }): number {
  const fa = FIM.has(normalizar(a.nome)), fb = FIM.has(normalizar(b.nome));
  if (fa !== fb) return fa ? 1 : -1;
  return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
}

export function calcularIndicadores(
  dados: DadosFechamento,
  periodo: Periodo,
  opcoes: {
    regras?: RegrasClinica;
    ajustes?: Ajustes;
    meta?: number | null;
    /**
     * AAAA-MM-DD. Mantém nas tabelas, com valor zero, toda categoria de receita
     * e de despesa que teve lançamento desde esta data até o fim do período.
     */
    catalogoDesde?: string;
  } = {},
): Indicadores {
  const regras = opcoes.regras ?? {};
  const ajustes = opcoes.ajustes ?? {};
  const un = ajustes.unificar ?? {};

  /* ---------- faturamento e pacientes ---------- */
  let faturamento: Indicadores["faturamento"] = null;
  let pacientes: Indicadores["pacientes"] = null;
  if (dados.vendas) {
    const vs = dados.vendas.filter((v) => noPeriodo(v.data, periodo));
    const valor = (v: Venda) => v.valor ?? 0;
    const total = centavos(vs.reduce((s, v) => s + valor(v), 0));
    const grupos = agruparPorNome(vs, (v) => grupoDaVenda(v, regras), valor, un.grupoReceita, "Sem categoria");
    if (opcoes.catalogoDesde) {
      const janela = { inicio: opcoes.catalogoDesde, fim: periodo.fim };
      const historico = agruparPorNome(dados.vendas.filter((v) => noPeriodo(v.data, janela)), (v) => grupoDaVenda(v, regras), valor, un.grupoReceita, "Sem categoria");
      for (const h of historico) {
        if (!grupos.some((g) => normalizar(g.nome) === normalizar(h.nome))) grupos.push({ ...h, valor: 0, quantidade: 0, variantes: [] });
      }
    }
    faturamento = {
      total,
      lancamentos: vs.length,
      semValor: vs.filter((v) => !v.valor).length,
      porGrupo: grupos
        .map((g) => ({ nome: g.nome, valor: g.valor, quantidade: g.quantidade, ticket: centavos(frac(g.valor, g.quantidade)), pct: frac(g.valor, total) }))
        .sort(ordemAlfabetica),
      porProfissional: itensValor(agruparPorNome(vs, (v) => v.profissional, valor, un.profissional), total),
      porUnidade: itensValor(agruparPorNome(vs, (v) => v.unidade, valor, un.unidade), total),
      porPagamento: itensValor(agruparPorNome(vs.filter((v) => valor(v) > 0), (v) => meioDePagamento(v.pagamento), valor, un.pagamento), total),
    };
    const chave = (v: Venda) => normalizar(v.paciente);
    const atendidos = new Set(vs.map(chave).filter(Boolean));
    const novosVs = vs.filter((v) => v.primeiraVez === true);
    const novos = new Set(novosVs.map(chave).filter(Boolean));
    const faturamentoNovos = centavos(novosVs.reduce((s, v) => s + valor(v), 0));
    pacientes = {
      atendidos: atendidos.size,
      novos: novos.size,
      ticketMedio: centavos(frac(total, atendidos.size)),
      faturamentoNovos,
      ticketNovos: centavos(frac(faturamentoNovos, novos.size)),
      temInformacaoDeNovos: vs.some((v) => v.primeiraVez !== null),
    };
  }

  /* ---------- despesas (regime de caixa: data de pagamento) ---------- */
  let despesas: Indicadores["despesas"] = null;
  if (dados.despesas) {
    const plano = montarPlano(regras.categoriasDespesa);
    const doPeriodo = dados.despesas.filter((d) => noPeriodo(d.dataPagamento, periodo));
    // Saída é só o que foi pago: "Pago? Não" / "Em aberto" com data preenchida fica de fora.
    const ds = doPeriodo.filter((d) => d.pago !== false);
    const naoPagas = doPeriodo.filter((d) => d.pago === false);
    const total = centavos(ds.reduce((s, d) => s + d.valor, 0));
    const porGrupo = new Map<string, Map<string, number>>();
    if (opcoes.catalogoDesde) {
      const janela = { inicio: opcoes.catalogoDesde, fim: periodo.fim };
      for (const d of dados.despesas.filter((x) => noPeriodo(x.dataPagamento, janela))) {
        const cat = categoriaDaDespesa(d, ajustes);
        const grupo = plano.grupoDe(cat) ?? GRUPO_SEM_CLASSIFICACAO;
        const cats = porGrupo.get(grupo) ?? new Map<string, number>();
        cats.set(plano.nomeDe(cat) || NAO_INFORMADO, 0);
        porGrupo.set(grupo, cats);
      }
    }
    for (const d of ds) {
      const cat = categoriaDaDespesa(d, ajustes);
      const grupo = plano.grupoDe(cat) ?? GRUPO_SEM_CLASSIFICACAO;
      const nome = plano.nomeDe(cat) || NAO_INFORMADO;
      const cats = porGrupo.get(grupo) ?? new Map<string, number>();
      cats.set(nome, (cats.get(nome) ?? 0) + d.valor);
      porGrupo.set(grupo, cats);
    }
    const ordemCat = (grupo: string, cat: string) => {
      const g = GRUPOS_DESPESA.find((x) => x.grupo === grupo);
      const i = g ? g.categorias.findIndex((c) => normalizar(c) === normalizar(cat)) : -1;
      return i < 0 ? 999 : i;
    };
    despesas = {
      total,
      lancamentos: ds.length,
      ...(naoPagas.length ? { naoPagas: { quantidade: naoPagas.length, valor: centavos(naoPagas.reduce((s, d) => s + d.valor, 0)) } } : {}),
      porGrupo: [...porGrupo.entries()]
        .map(([grupo, cats]) => {
          const v = centavos([...cats.values()].reduce((s, x) => s + x, 0));
          return {
            nome: grupo, valor: v, pct: frac(v, total),
            categorias: [...cats.entries()]
              .map(([nome, valor]) => ({ nome, valor: centavos(valor), pct: frac(valor, total) }))
              .sort((a, b) => ordemCat(grupo, a.nome) - ordemCat(grupo, b.nome) || b.valor - a.valor),
          };
        })
        .sort((a, b) => plano.ordemGrupo(a.nome) - plano.ordemGrupo(b.nome)),
    };
  }

  /* ---------- entradas (recebimentos) ---------- */
  let entradas: Indicadores["entradas"] = null;
  if (dados.entradas) {
    const doPeriodo = dados.entradas.filter((r) => noPeriodo(r.data, periodo));
    const validas = doPeriodo.filter((r) => r.recebido !== false);
    const abertas = doPeriodo.filter((r) => r.recebido === false);
    const porCat = new Map<string, { nome: string; valor: number; grupo: GrupoEntrada }>();
    const soma = { operacional: 0, nao_operacional: 0, fora: 0 } as Record<GrupoEntrada, number>;
    for (const r of validas) {
      const nome = r.categoria || NAO_INFORMADO;
      const { grupo } = grupoDaEntrada(nome, regras.categoriasEntrada);
      soma[grupo] += r.valor;
      const k = `${grupo}|${normalizar(nome)}`;
      const it = porCat.get(k) ?? { nome, valor: 0, grupo };
      it.valor += r.valor;
      porCat.set(k, it);
    }
    const total = centavos(soma.operacional + soma.nao_operacional);
    entradas = {
      total, operacionais: centavos(soma.operacional), naoOperacionais: centavos(soma.nao_operacional), foraDoResultado: centavos(soma.fora),
      lancamentos: validas.length,
      porCategoria: [...porCat.values()].map((x) => ({ nome: x.nome, valor: centavos(x.valor), pct: frac(x.valor, total), grupo: x.grupo }))
        .sort((a, b) => (a.grupo === b.grupo ? b.valor - a.valor : ["operacional", "nao_operacional", "fora"].indexOf(a.grupo) - ["operacional", "nao_operacional", "fora"].indexOf(b.grupo))),
      semSituacao: validas.filter((r) => r.recebido === null).length,
      emAberto: { quantidade: abertas.length, valor: centavos(abertas.reduce((s, r) => s + r.valor, 0)) },
    };
  }

  // Com Entradas: resultado de caixa de verdade. Sem: faturamento − saídas, nunca chamado de caixa.
  const caixa = entradas && despesas
    ? { entradas: entradas.total, saidas: despesas.total, resultado: centavos(entradas.total - despesas.total), margem: fracOuNull(entradas.total - despesas.total, entradas.total), real: true }
    : faturamento && despesas
      ? { entradas: faturamento.total, saidas: despesas.total, resultado: centavos(faturamento.total - despesas.total), margem: fracOuNull(faturamento.total - despesas.total, faturamento.total), real: false }
      : null;

  /* ---------- leads ---------- */
  let leads: Indicadores["leads"] = null;
  if (dados.leads) {
    const ls = dados.leads.filter((l) => noPeriodo(l.data, periodo));
    const agendou = new Set((regras.statusAgendou ?? PADRAO.statusAgendou).map(normalizar));
    const agendados = ls.filter((l) => agendou.has(normalizar(l.status))).length;
    const um = () => 1;
    leads = {
      total: ls.length,
      agendados,
      conversao: fracOuNull(agendados, ls.length),
      porOrigem: itensContagem(agruparPorNome(ls, (l) => l.origem, um, un.origem), ls.length),
      porObjecao: itensContagem(agruparPorNome(ls, (l) => l.objecao, um, un.objecao), ls.length),
      porInteresse: itensContagem(agruparPorNome(ls, (l) => l.interesse, um, un.interesse), ls.length),
      porCanal: itensContagem(agruparPorNome(ls, (l) => l.canal, um), ls.length),
    };
  }

  /* ---------- orçamentos ---------- */
  let orcamentos: Indicadores["orcamentos"] = null;
  if (dados.orcamentos) {
    const temPrescricao = dados.orcamentos.some((o) => o.prescricao !== null);
    const os = dados.orcamentos.filter((o) => noPeriodo(o.data, periodo) && (!temPrescricao || o.prescricao === true));
    const contem = (lista: string[]) => (o: Orcamento) => lista.map(normalizar).some((t) => normalizar(o.status).includes(t));
    const ehCancelado = contem(regras.statusCancelado ?? PADRAO.statusCancelado);
    const ehFechado = (o: Orcamento) => !ehCancelado(o) && contem(regras.statusFechado ?? PADRAO.statusFechado)(o);
    const ehNaoFechou = (o: Orcamento) => !ehCancelado(o) && contem(regras.statusNaoFechou ?? PADRAO.statusNaoFechou)(o);
    const ehAberto = (o: Orcamento) => !ehCancelado(o) && !ehFechado(o) && !ehNaoFechou(o) && contem(regras.statusEmAberto ?? PADRAO.statusEmAberto)(o);
    const fechados = os.filter((o) => ehFechado(o) && !ehNaoFechou(o));
    const abertos = os.filter(ehAberto);
    const cancelados = os.filter(ehCancelado);
    const soma = (xs: Orcamento[], f: (o: Orcamento) => number) => centavos(xs.reduce((s, o) => s + f(o), 0));
    const valorGerado = soma(os, (o) => o.valorPrescricao);
    const valorFechado = soma(fechados, (o) => o.valorVenda);
    const valorCancelado = soma(cancelados, (o) => o.valorPrescricao);
    const comMotivo = os.filter((o) => o.objecao);
    orcamentos = {
      total: os.length,
      fechados: fechados.length,
      emAberto: abertos.length,
      naoFechou: os.filter(ehNaoFechou).length,
      cancelados: cancelados.length,
      valorCancelado,
      porStatus: itensContagem(agruparPorNome(os, (o) => o.status, () => 1), os.length),
      porObjecao: itensContagem(agruparPorNome(comMotivo, (o) => o.objecao ?? "", () => 1), comMotivo.length),
      valorGerado,
      valorFechado,
      valorEmAberto: soma(abertos, (o) => o.valorPrescricao),
      // Cancelados saem do denominador (decisão de 10/11).
      conversaoQuantidade: fracOuNull(fechados.length, os.length - cancelados.length),
      conversaoValor: fracOuNull(valorFechado, valorGerado - valorCancelado),
    };
  }

  /* ---------- NPS ---------- */
  let nps: Indicadores["nps"] = null;
  if (dados.nps) {
    const rs = dados.nps.filter((r) => noPeriodo(r.data, periodo));
    const notas = rs.map((r) => r.indicacao).filter((n): n is number => n !== null);
    const promotores = notas.filter((n) => n >= 9).length;
    const detratores = notas.filter((n) => n <= 6).length;
    nps = {
      respostas: rs.length,
      nps: notas.length ? Math.round(((promotores - detratores) / notas.length) * 100) : null,
      promotores,
      neutros: notas.length - promotores - detratores,
      detratores,
      notas: {
        profissional: media(rs.map((r) => r.profissional)),
        recepcao: media(rs.map((r) => r.recepcao)),
        infraestrutura: media(rs.map((r) => r.infraestrutura)),
        enfermagem: media(rs.map((r) => r.enfermagem)),
      },
    };
  }

  /* ---------- Google ---------- */
  let google: Indicadores["google"] = null;
  if (dados.avaliacoes) {
    const as = dados.avaliacoes.filter((a) => noPeriodo(a.data, periodo));
    google = { avaliacoes: as.length, nota: media(as.map((a) => a.nota)) };
  }

  const meta = opcoes.meta && faturamento
    ? { valor: opcoes.meta, atingimento: faturamento.total / opcoes.meta, falta: centavos(Math.max(0, opcoes.meta - faturamento.total)) }
    : null;

  return { periodo, faturamento, pacientes, despesas, entradas, caixa, leads, orcamentos, nps, google, meta };
}

/* ============================== ANUAL ============================== */

export interface LinhaAnual {
  /** "AAAA-MM" */
  mes: string;
  /** FATURAMENTO do mês (nome antigo mantido para os fechamentos já guardados). */
  entradas: number;
  /** Entradas de caixa de verdade (recebimentos operacionais + não operacionais). null = cliente sem a fonte. */
  recebido?: number | null;
  saidasCaixa: number;
  saidasCompetencia: number;
}

/** Rótulo do resultado: só é "de caixa" quando há fonte de Entradas. */
export function rotuloResultado(caixa: { real?: boolean } | null | undefined): string {
  return caixa?.real ? "Resultado de caixa" : "Faturamento x Despesas";
}

/**
 * Faturamento, recebimentos e saídas mês a mês do ano.
 * Saídas: só as pagas. Caixa: pela data de pagamento. Competência: pelo mês de
 * competência (sem ela, o mês do pagamento). O faturamento segue a data da
 * venda; os recebimentos, a data do recebimento.
 */
export function resumoAnual(dados: Pick<DadosFechamento, "vendas" | "despesas" | "entradas">, ano: number, ateMes = 12, regras: RegrasClinica = {}): LinhaAnual[] {
  const linhas: LinhaAnual[] = [];
  for (let m = 1; m <= ateMes; m++) {
    const mes = `${ano}-${String(m).padStart(2, "0")}`;
    const entradas = (dados.vendas ?? []).filter((v) => v.data.startsWith(mes)).reduce((s, v) => s + (v.valor ?? 0), 0);
    const despesasPagas = (dados.despesas ?? []).filter((d) => d.pago !== false);
    const pagas = despesasPagas.filter((d) => d.dataPagamento?.startsWith(mes)).reduce((s, d) => s + d.valor, 0);
    const comp = despesasPagas
      .filter((d) => d.dataPagamento && (d.competencia ?? d.dataPagamento.slice(0, 7)) === mes)
      .reduce((s, d) => s + d.valor, 0);
    const recebido = dados.entradas
      ? dados.entradas.filter((r) => r.recebido !== false && r.data.startsWith(mes) && grupoDaEntrada(r.categoria || NAO_INFORMADO, regras.categoriasEntrada).grupo !== "fora").reduce((s, r) => s + r.valor, 0)
      : null;
    linhas.push({ mes, entradas: centavos(entradas), recebido: recebido === null ? null : centavos(recebido), saidasCaixa: centavos(pagas), saidasCompetencia: centavos(comp) });
  }
  return linhas;
}

/** Variação relativa (0,1 = +10%). null quando a base é zero ou falta. */
export function variacao(atual: number | null | undefined, anterior: number | null | undefined): number | null {
  if (atual === null || atual === undefined || !anterior) return null;
  return atual / anterior - 1;
}

/** Mês sem nenhum lançamento (faturamento, entradas e despesas zerados). */
export const mesVazio = (l: LinhaAnual) => !l.entradas && !l.recebido && !l.saidasCaixa && !l.saidasCompetencia;

/**
 * Meses para mostrar no ano: começa no primeiro mês com lançamento (antes disso
 * a planilha ainda não existia; mostrar R$ 0 pareceria resultado real).
 */
export function mesesComDados(linhas: LinhaAnual[]): LinhaAnual[] {
  const k = linhas.findIndex((l) => !mesVazio(l));
  return k < 0 ? [] : linhas.slice(k);
}

export interface LinhaRegime {
  mes: string;
  faturamento: number;
  /** Recebimentos (null = cliente sem a fonte de Entradas). */
  entradas: number | null;
  saidasCaixa: number;
  /** Com Entradas: entradas − saídas pagas. Sem: faturamento − saídas pagas. */
  resultadoCaixa: number;
  despesasCompetencia: number;
  /** Faturamento do mês − despesas do mês de competência. */
  resultadoCompetencia: number;
}

/**
 * Tabela "Caixa x competência" a partir do resumo anual. Aceita fechamentos
 * antigos (sem "recebido"): nesse caso o resultado é Faturamento x Despesas.
 */
export function regimesAnuais(todas: LinhaAnual[]): { real: boolean; linhas: (LinhaRegime & { vazio?: boolean })[]; total: Omit<LinhaRegime, "mes"> } {
  const real = todas.some((l) => l.recebido != null);
  const linhas = mesesComDados(todas);
  const out: (LinhaRegime & { vazio?: boolean })[] = linhas.map((l) => {
    const base = real ? (l.recebido ?? 0) : l.entradas;
    return {
      mes: l.mes, faturamento: l.entradas, entradas: real ? (l.recebido ?? 0) : null, saidasCaixa: l.saidasCaixa,
      resultadoCaixa: centavos(base - l.saidasCaixa), despesasCompetencia: l.saidasCompetencia, resultadoCompetencia: centavos(l.entradas - l.saidasCompetencia),
      ...(mesVazio(l) ? { vazio: true } : {}),
    };
  });
  const soma = (f: (l: LinhaRegime) => number) => centavos(out.reduce((s, l) => s + f(l), 0));
  return {
    real, linhas: out,
    total: {
      faturamento: soma((l) => l.faturamento), entradas: real ? soma((l) => l.entradas ?? 0) : null, saidasCaixa: soma((l) => l.saidasCaixa),
      resultadoCaixa: soma((l) => l.resultadoCaixa), despesasCompetencia: soma((l) => l.despesasCompetencia), resultadoCompetencia: soma((l) => l.resultadoCompetencia),
    },
  };
}
