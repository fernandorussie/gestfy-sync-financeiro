/**
 * Motor de indicadores do fechamento.
 *
 * Uma única definição para cada indicador, usada no quinzenal, no mensal e
 * nos comparativos. Recebe os registros já lidos das planilhas, o período,
 * as regras da clínica e os ajustes decididos na conferência; devolve os
 * números prontos para tela, PDF, texto e IA. Não lê planilha nem banco.
 */
import type { Avaliacao, Despesa, Lead, Orcamento, RespostaNps, Venda } from "./leitores";
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
  } | null;
  caixa: { entradas: number; saidas: number; resultado: number; margem: number | null } | null;
  leads: {
    total: number;
    agendados: number;
    conversao: number | null;
    porOrigem: ItemContagem[];
    porObjecao: ItemContagem[];
    porInteresse: ItemContagem[];
  } | null;
  orcamentos: {
    total: number;
    fechados: number;
    emAberto: number;
    naoFechou: number;
    porStatus: ItemContagem[];
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

export function calcularIndicadores(
  dados: DadosFechamento,
  periodo: Periodo,
  opcoes: { regras?: RegrasClinica; ajustes?: Ajustes; meta?: number | null } = {},
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
    faturamento = {
      total,
      lancamentos: vs.length,
      semValor: vs.filter((v) => !v.valor).length,
      porGrupo: grupos
        .map((g) => ({ nome: g.nome, valor: g.valor, quantidade: g.quantidade, ticket: centavos(frac(g.valor, g.quantidade)), pct: frac(g.valor, total) }))
        .sort((a, b) => b.valor - a.valor || b.quantidade - a.quantidade),
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
    const ds = dados.despesas.filter((d) => noPeriodo(d.dataPagamento, periodo));
    const total = centavos(ds.reduce((s, d) => s + d.valor, 0));
    const porGrupo = new Map<string, Map<string, number>>();
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

  const caixa = faturamento && despesas
    ? { entradas: faturamento.total, saidas: despesas.total, resultado: centavos(faturamento.total - despesas.total), margem: fracOuNull(faturamento.total - despesas.total, faturamento.total) }
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
    };
  }

  /* ---------- orçamentos ---------- */
  let orcamentos: Indicadores["orcamentos"] = null;
  if (dados.orcamentos) {
    const temPrescricao = dados.orcamentos.some((o) => o.prescricao !== null);
    const os = dados.orcamentos.filter((o) => noPeriodo(o.data, periodo) && (!temPrescricao || o.prescricao === true));
    const contem = (lista: string[]) => (o: Orcamento) => lista.map(normalizar).some((t) => normalizar(o.status).includes(t));
    const ehFechado = contem(regras.statusFechado ?? PADRAO.statusFechado);
    const ehNaoFechou = contem(regras.statusNaoFechou ?? PADRAO.statusNaoFechou);
    const ehAberto = (o: Orcamento) => !ehFechado(o) && !ehNaoFechou(o) && contem(regras.statusEmAberto ?? PADRAO.statusEmAberto)(o);
    const fechados = os.filter((o) => ehFechado(o) && !ehNaoFechou(o));
    const abertos = os.filter(ehAberto);
    const soma = (xs: Orcamento[], f: (o: Orcamento) => number) => centavos(xs.reduce((s, o) => s + f(o), 0));
    const valorGerado = soma(os, (o) => o.valorPrescricao);
    const valorFechado = soma(fechados, (o) => o.valorVenda);
    orcamentos = {
      total: os.length,
      fechados: fechados.length,
      emAberto: abertos.length,
      naoFechou: os.filter(ehNaoFechou).length,
      porStatus: itensContagem(agruparPorNome(os, (o) => o.status, () => 1), os.length),
      valorGerado,
      valorFechado,
      valorEmAberto: soma(abertos, (o) => o.valorPrescricao),
      conversaoQuantidade: fracOuNull(fechados.length, os.length),
      conversaoValor: fracOuNull(valorFechado, valorGerado),
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

  return { periodo, faturamento, pacientes, despesas, caixa, leads, orcamentos, nps, google, meta };
}

/* ============================== ANUAL ============================== */

export interface LinhaAnual {
  /** "AAAA-MM" */
  mes: string;
  entradas: number;
  saidasCaixa: number;
  saidasCompetencia: number;
}

/**
 * Entradas e saídas mês a mês do ano, nos dois regimes.
 * Caixa: despesa pela data de pagamento. Competência: pelo mês de competência
 * (sem competência informada, vale o mês do pagamento). A receita segue a data
 * de atendimento nos dois, porque as planilhas não têm data de recebimento.
 */
export function resumoAnual(dados: Pick<DadosFechamento, "vendas" | "despesas">, ano: number, ateMes = 12): LinhaAnual[] {
  const linhas: LinhaAnual[] = [];
  for (let m = 1; m <= ateMes; m++) {
    const mes = `${ano}-${String(m).padStart(2, "0")}`;
    const entradas = (dados.vendas ?? []).filter((v) => v.data.startsWith(mes)).reduce((s, v) => s + (v.valor ?? 0), 0);
    const pagas = (dados.despesas ?? []).filter((d) => d.dataPagamento?.startsWith(mes)).reduce((s, d) => s + d.valor, 0);
    const comp = (dados.despesas ?? [])
      .filter((d) => d.dataPagamento && (d.competencia ?? d.dataPagamento.slice(0, 7)) === mes)
      .reduce((s, d) => s + d.valor, 0);
    linhas.push({ mes, entradas: centavos(entradas), saidasCaixa: centavos(pagas), saidasCompetencia: centavos(comp) });
  }
  return linhas;
}

/** Variação relativa (0,1 = +10%). null quando a base é zero ou falta. */
export function variacao(atual: number | null | undefined, anterior: number | null | undefined): number | null {
  if (atual === null || atual === undefined || !anterior) return null;
  return atual / anterior - 1;
}
