/**
 * Orquestração do fechamento no servidor: banco + planilhas + motor.
 *
 * Só roda no servidor (usa a service role do Supabase e a conta de serviço
 * do Google). As linhas lidas das planilhas ficam apenas em memória, num
 * cache curto por clínica, para que cada decisão da conferência não precise
 * reler tudo. No banco vão só decisões e totais.
 */
import { calcularRitmo, type Ritmo } from "./ritmo";
import { limparFicha, type FichaClinica } from "./ficha";
import { vocabularioDe, type Vocabulario } from "./vocabulario";
import { gravarMetricas, metricasDoFechamento } from "./metricas";
import { claudeConfigurado } from "./claude-api";
import { mesesDaBase } from "./historico";
import { extrasDe, limparSecoes, normalizarEstrutura, type ItemSecao, type SecaoPersonalizada } from "./estrutura";
import { adaptarResultado, calcularFontes, colunasUsadas, lerFontePersonalizada, limparFontePersonalizada, type FontePersonalizada, type LeituraPersonalizada, type ResultadoPersonalizado } from "./fonte-personalizada";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { readSheetValues } from "@/lib/google/sheets";
import type { Fechamento, Json } from "@/lib/supabase/types";
import { coletar, type FontesFechamento, type ResultadoColeta } from "./coleta";
import { conferir, type Alerta } from "./conferencia";
import { ajustesDasDecisoes, decisoesVazias, gravesPendentes, gruposEscolhidos, metaEscolhida, type Decisoes } from "./decisoes";
import { calcularIndicadores, resumoAnual, type Indicadores, type LinhaAnual, type Periodo, type RegrasClinica } from "./indicadores";
import { periodoAnterior } from "./periodo";
import { textoVazio, type Acao, type Acompanhamento, type TextoFechamento } from "./texto-fechamento";

import { periodoDe } from "./periodo";
export { periodoDe, periodoAnterior } from "./periodo";

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { em: number; coleta: ResultadoColeta }>();

export interface ResumoFonte {
  fonte: string;
  linhas: number;
  erro?: string;
  avisos: number;
}

export interface ResultadoFechamento {
  fechamento: Fechamento;
  clinicaNome: string;
  periodo: Periodo;
  alertas: Alerta[];
  decisoes: Decisoes;
  pendentesGraves: number;
  indicadores: Indicadores;
  /** Mesmo cálculo para o período anterior (mês ou quinzena), para as comparações. */
  anterior: Indicadores;
  anual: LinhaAnual[];
  fontes: ResumoFonte[];
  metaMensal: number | null;
  lidoEm: string;
  /** Quinzenal: faturamento por dia útil, projeção, despesas a pagar. Null no mensal. */
  ritmo: Ritmo | null;
  /** true = concluído: números do retrato congelado, sem reler planilhas. */
  congelado: boolean;
  texto: TextoFechamento;
  acoes: Acao[];
  /** Andamento das ações do fechamento anterior (começa com as ações dele). */
  acompanhamento: Acompanhamento[];
  /** Nomes já usados como responsáveis na clínica. */
  equipe: string[];
  /** Ficha da clínica (contexto para o Claude). Vazia até ser preenchida. */
  ficha: FichaClinica;
  /** A chave da API do Claude está configurada (gerar análise dentro do app). */
  iaLigada: boolean;
  /** Seções do relatório (ordem, ligadas, nível). Concluído: a estrutura usada na conclusão. */
  estrutura: ItemSecao[];
  /** Números das fontes personalizadas (contratos, cirurgias, recall…). */
  personalizadas: ResultadoPersonalizado[];
  /** Seções criadas no editor de estrutura (título), onde entram indicadores escolhidos. */
  secoes: SecaoPersonalizada[];
  /** Palavras do relatório conforme o segmento do cliente (paciente/cliente, médico/profissional…). */
  vocab: Vocabulario;
}

/** O que fica gravado ao concluir: tudo que a tela e o PDF precisam, só totais. */
interface Retrato {
  alertas: Alerta[];
  indicadores: Indicadores;
  anterior: Indicadores;
  anual: LinhaAnual[];
  fontes: ResumoFonte[];
  metaMensal: number | null;
  lidoEm: string;
  ritmo?: Ritmo | null;
  /** Estrutura do relatório no momento da conclusão. */
  estrutura?: ItemSecao[];
  personalizadas?: ResultadoPersonalizado[];
  secoes?: SecaoPersonalizada[];
}

/* ---------- leitura ---------- */

async function coletarClinica(clinicaId: string, fontes: FontesFechamento, releitura: boolean): Promise<{ coleta: ResultadoColeta; em: number }> {
  const c = cache.get(clinicaId);
  if (!releitura && c && Date.now() - c.em < CACHE_MS) return c;
  const coleta = await coletar(fontes, readSheetValues);
  const novo = { coleta, em: Date.now() };
  cache.set(clinicaId, novo);
  return novo;
}

export function limparCache(clinicaId: string) {
  cache.delete(clinicaId);
}

/** Lê uma fonte isolada, sem cache (tela de configuração). */
export async function testarFonte(nome: keyof FontesFechamento, cfg: NonNullable<FontesFechamento[keyof FontesFechamento]>) {
  const r = await coletar({ [nome]: cfg } as FontesFechamento, readSheetValues);
  return { leitura: r.leituras[nome] ?? null, erro: r.erros[nome] ?? null };
}

/* ---------- cálculo ---------- */

async function metaDoMes(clinicaId: string, inicio: string): Promise<number | null> {
  const db = getSupabaseAdmin();
  const [ano, mes] = inicio.split("-").map(Number);
  const { data: tipos } = await db.from("tipos_meta").select("id").ilike("nome", "faturamento");
  if (!tipos?.length) return null;
  const { data } = await db
    .from("metas")
    .select("valor_meta_mensal")
    .eq("clinica_id", clinicaId)
    .eq("ano", ano)
    .eq("mes", mes)
    .in("tipo_meta_id", tipos.map((t) => t.id));
  const v = data?.[0]?.valor_meta_mensal;
  return v ? Number(v) : null;
}

export function lerDecisoes(json: Json | null): Decisoes {
  const d = json as unknown as Decisoes | null;
  return d && Array.isArray(d.registro) ? d : decisoesVazias();
}

const lista = <T,>(j: Json | null | undefined): T[] => (Array.isArray(j) ? (j as unknown as T[]) : []);

/** Ações do último fechamento anterior da clínica (mesmo tipo), para acompanhar no atual. */
async function acoesDoAnterior(f: Fechamento): Promise<Acompanhamento[]> {
  const { data } = await getSupabaseAdmin()
    .from("fechamentos").select("acoes").eq("clinica_id", f.clinica_id).eq("tipo", f.tipo).lt("inicio", f.inicio)
    .order("inicio", { ascending: false }).order("versao", { ascending: false }).limit(1).maybeSingle();
  return lista<Acao>(data?.acoes).map((a) => ({ id: a.id, titulo: a.titulo, responsaveis: a.responsaveis ?? [], status: null, nota: "" }));
}

export async function calcularFechamento(id: string, opcoes: { releitura?: boolean } = {}): Promise<ResultadoFechamento> {
  const db = getSupabaseAdmin();
  const { data: f, error } = await db.from("fechamentos").select("*").eq("id", id).maybeSingle();
  if (error || !f) throw new Error("Fechamento não encontrado.");
  const [{ data: clinica }, { data: config }] = await Promise.all([
    db.from("clinicas").select("nome").eq("id", f.clinica_id).maybeSingle(),
    db.from("fechamento_config").select("*").eq("clinica_id", f.clinica_id).maybeSingle(),
  ]);
  if (!config) throw new Error("Este cliente ainda não tem as planilhas configuradas para fechamento.");

  const decisoes = lerDecisoes(f.decisoes);
  const salvoAcomp = lista<Acompanhamento>(f.acompanhamento);
  const comuns = {
    fechamento: f,
    clinicaNome: clinica?.nome ?? "",
    periodo: { inicio: f.inicio, fim: f.fim } as Periodo,
    decisoes,
    texto: { ...textoVazio(), ...((f.texto ?? {}) as Partial<TextoFechamento>) },
    acoes: lista<Acao>(f.acoes),
    acompanhamento: salvoAcomp.length ? salvoAcomp : await acoesDoAnterior(f),
    equipe: lista<string>(config.equipe),
    ficha: limparFicha((config.ficha ?? {}) as Partial<FichaClinica>),
    vocab: vocabularioDe(limparFicha((config.ficha ?? {}) as Partial<FichaClinica>)),
    iaLigada: claudeConfigurado(),
    estrutura: normalizarEstrutura(((config as { relatorio?: Record<string, unknown> }).relatorio ?? {})[f.tipo], f.tipo, extrasDaConfig(config)),
    secoes: secoesDaConfig(config),
  };

  const congelado = (f.status === "concluido" || f.status === "enviado") && !!f.snapshot;
  if (congelado) {
    const r = f.snapshot as unknown as Retrato;
    // Retratos antigos guardam as fontes no formato anterior; adaptarResultado converte para exibir.
    const personalizadas = (r.personalizadas ?? []).map(adaptarResultado);
    const secoes = r.secoes ?? (r.estrutura ? [] : comuns.secoes);
    const estrutura = r.estrutura ? normalizarEstrutura(r.estrutura, f.tipo, extrasDe(personalizadas, secoes)) : comuns.estrutura;
    return { ...comuns, ...r, ritmo: r.ritmo ?? null, estrutura, personalizadas, secoes, pendentesGraves: gravesPendentes(r.alertas, decisoes).length, congelado: true };
  }
  const retrato = await calcularRetrato(f, config, decisoes, !!opcoes.releitura);
  await db.from("fechamentos").update({
    indicadores: retrato.indicadores as unknown as Json,
    alertas: retrato.alertas as unknown as Json,
    calculado_em: new Date().toISOString(),
  }).eq("id", id);
  return { ...comuns, ...retrato, ritmo: retrato.ritmo ?? null, personalizadas: retrato.personalizadas ?? [], pendentesGraves: gravesPendentes(retrato.alertas, decisoes).length, congelado: false };
}

/** Lê as planilhas (ou o cache) e calcula alertas, indicadores, período anterior e ano. */
/* ---------- fontes personalizadas ---------- */

const cacheExtras = new Map<string, { em: number; leitura: LeituraPersonalizada | null; erro: string | null }>();

export function fontesExtras(json: unknown): FontePersonalizada[] {
  return (Array.isArray(json) ? json : []).map((x) => limparFontePersonalizada(x as Partial<FontePersonalizada>));
}
export function secoesDaConfig(config: unknown): SecaoPersonalizada[] {
  return limparSecoes(((config as { relatorio?: { secoes?: unknown } }).relatorio ?? {}).secoes);
}
export function extrasDaConfig(config: unknown) {
  return extrasDe(fontesExtras((config as { fontes_extras?: unknown }).fontes_extras), secoesDaConfig(config));
}

async function calcularPersonalizadas(clinicaId: string, fontes: FontePersonalizada[], periodo: Periodo, anterior: Periodo, releitura: boolean, padrao: { atual: Indicadores; anterior: Indicadores }): Promise<ResultadoPersonalizado[]> {
  const leituras = new Map<string, { leitura: LeituraPersonalizada | null; erro: string | null }>();
  await Promise.all(fontes.map(async (f) => {
    const chave = `${clinicaId}|${f.id}|${f.sheetId}|${f.aba}|${f.linhaCabecalho ?? ""}|${f.colunaData}|${colunasUsadas(f).join("|")}`;
    let c = cacheExtras.get(chave);
    if (releitura || !c || Date.now() - c.em > CACHE_MS) {
      c = { em: Date.now(), ...(await lerFontePersonalizada(f, readSheetValues)) };
      cacheExtras.set(chave, c);
    }
    leituras.set(f.id, { leitura: c.erro ? null : c.leitura, erro: c.erro });
  }));
  return calcularFontes(fontes, leituras, periodo, anterior, padrao);
}

function alertasPersonalizadas(rs: ResultadoPersonalizado[]): Alerta[] {
  const a: Alerta[] = [];
  for (const r of rs) {
    if (r.erro) a.push({ chave: `personalizada-erro:${r.id}`, regra: "personalizada-erro", gravidade: "atencao", area: r.nome, titulo: `${r.nome}: planilha não lida`, descricao: `${r.erro} Os números desta fonte ficam fora do relatório.`, evidencias: [], sugestao: { tipo: "corrigir-na-origem" } });
    else if (r.ignoradas) a.push({ chave: `personalizada-ilegivel:${r.id}`, regra: "personalizada-ilegivel", gravidade: "atencao", area: r.nome, titulo: `${r.nome}: ${r.ignoradas} ${r.ignoradas === 1 ? "linha" : "linhas"} com data ilegível`, descricao: "Essas linhas ficaram fora do cálculo. Corrija a data na planilha e leia de novo.", evidencias: [], sugestao: { tipo: "corrigir-na-origem" } });
  }
  return a;
}

/** Lê uma fonte personalizada isolada (tela de configuração), sem cache. */
export async function testarFontePersonalizada(f: FontePersonalizada) {
  return lerFontePersonalizada(f, readSheetValues);
}

export interface PreviaFonte {
  erro: string | null;
  leitura: {
    linhas: number; linhaCabecalho: number; cabecalho: string[]; colunas: { ref: string; letra: string; cabecalho: string }[];
    ignoradas: { linha: number; motivo: string }[]; totalIgnoradas: number;
    /** Valores que aparecem nas colunas usadas (sem as de dado pessoal), para sugerir nos filtros. */
    valores: Record<string, string[]>;
    /** Últimas linhas, só com as colunas usadas e sem as de dado pessoal. */
    amostra: { data: string; c: Record<string, string> }[];
    /** Meses com linhas, do mais recente para o mais antigo. */
    meses: string[];
  } | null;
  periodo: Periodo | null;
  resultado: ResultadoPersonalizado | null;
}

/**
 * Prévia de uma fonte na configuração: lê a planilha e calcula os indicadores
 * num mês (o pedido, ou o último com linhas) contra o mês anterior. As fórmulas
 * podem usar as outras fontes da tela e os indicadores padrão do cliente.
 */
export async function previaFontePersonalizada(clinicaId: string, alvo: FontePersonalizada, outras: FontePersonalizada[], mes?: string): Promise<PreviaFonte> {
  const r = await lerFontePersonalizada(alvo, readSheetValues);
  if (!r.leitura) return { erro: r.erro, leitura: null, periodo: null, resultado: null };
  const l = r.leitura;
  const pessoais = new Set(alvo.pessoais.map((x) => x.toLowerCase()));
  const publica = (ref: string) => !pessoais.has(ref.toLowerCase()) && !pessoais.has((l.colunas.find((c) => c.ref === ref)?.cabecalho ?? "").toLowerCase());
  const refs = l.colunas.map((c) => c.ref).filter((ref) => ref !== (alvo.colunaData || "~data") && publica(ref));
  const valores: Record<string, string[]> = {};
  for (const ref of refs) valores[ref] = [...new Set(l.linhas.map((x) => String(x.c[ref] ?? "").trim()).filter(Boolean))].slice(0, 25);
  const meses = [...new Set(l.linhas.map((x) => x.data.slice(0, 7)))].sort().reverse();
  const leitura = {
    linhas: l.linhas.length, linhaCabecalho: l.linhaCabecalho, cabecalho: l.cabecalho.filter(Boolean).slice(0, 60), colunas: l.colunas,
    ignoradas: l.ignoradas.slice(0, 5), totalIgnoradas: l.ignoradas.length, valores, meses,
    amostra: l.linhas.slice(-5).map((x) => ({ data: x.data, c: Object.fromEntries(refs.map((ref) => [ref, String(x.c[ref] ?? "")])) })),
  };
  const m = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : meses[0];
  if (!m || r.erro) return { erro: r.erro, leitura, periodo: null, resultado: null };
  const periodo = periodoDe(m, "mensal", 1);
  const anterior = periodoAnterior(periodo, "mensal");

  // Outras fontes (para fórmulas) e indicadores padrão, só quando alguma fórmula usa.
  const formulas = alvo.indicadores.filter((d) => d.tipo === "formula").flatMap((d) => d.termos);
  const usadas = outras.filter((o) => o.id !== alvo.id && o.indicadores.some((d) => formulas.includes(d.id) || formulas.some((t) => t.startsWith(`${o.id}.`))));
  const leituras = new Map<string, { leitura: LeituraPersonalizada | null; erro: string | null }>([[alvo.id, { leitura: l, erro: null }]]);
  for (const o of usadas) leituras.set(o.id, await lerFontePersonalizada(o, readSheetValues));
  let padrao: { atual: Indicadores | null; anterior: Indicadores | null } = { atual: null, anterior: null };
  if (formulas.some((t) => t.startsWith("padrao:"))) {
    const { data: config } = await getSupabaseAdmin().from("fechamento_config").select("fontes, regras").eq("clinica_id", clinicaId).maybeSingle();
    if (config?.fontes && Object.keys(config.fontes as object).length) {
      const { coleta } = await coletarClinica(clinicaId, config.fontes as unknown as FontesFechamento, false);
      const regras = (config.regras ?? {}) as unknown as RegrasClinica;
      padrao = { atual: calcularIndicadores(coleta.dados, periodo, { regras }), anterior: calcularIndicadores(coleta.dados, anterior, { regras }) };
    }
  }
  const todos = calcularFontes([alvo, ...usadas], leituras, periodo, anterior, padrao);
  // Grupos por coluna de dado pessoal não aparecem.
  const resultado = todos[0];
  return { erro: null, leitura, periodo, resultado };
}

async function calcularRetrato(
  f: Fechamento,
  config: { fontes: Json; regras: Json; fontes_extras?: Json },
  decisoes: Decisoes,
  releitura: boolean,
): Promise<Retrato> {
  const fontes = config.fontes as unknown as FontesFechamento;
  const { coleta, em } = await coletarClinica(f.clinica_id, fontes, releitura);
  const regrasBase = (config.regras ?? {}) as unknown as RegrasClinica;
  const regras: RegrasClinica = { ...regrasBase, categoriasDespesa: { ...(regrasBase.categoriasDespesa ?? {}), ...gruposEscolhidos(decisoes) } };
  const ajustes = ajustesDasDecisoes(decisoes);
  const periodo: Periodo = { inicio: f.inicio, fim: f.fim };

  const metaMensal = await metaDoMes(f.clinica_id, f.inicio);
  const escolhida = metaEscolhida(decisoes);
  const metas = escolhida
    ? [{ origem: "Meta escolhida na conferência", valor: escolhida }]
    : [
        ...(metaMensal ? [{ origem: "Meta mensal (GestfySync)", valor: metaMensal }] : []),
        ...(f.meta_ajustada ? [{ origem: "Meta ajustada do fechamento", valor: Number(f.meta_ajustada) }] : []),
      ];
  const valoresMeta = [...new Set(metas.map((m) => m.valor))];
  const meta = escolhida ?? (valoresMeta.length === 1 ? valoresMeta[0] : null);

  const alertas = conferir({ dados: coleta.dados, periodo, regras, ajustes, metas, leituras: coleta.leituras });
  // Tabelas mantêm, zeradas, as categorias usadas nos últimos 12 meses.
  const [aIni, mIni] = f.inicio.split("-").map(Number);
  const catalogoDesde = `${aIni - 1}-${String(mIni).padStart(2, "0")}-01`;
  const indicadores = calcularIndicadores(coleta.dados, periodo, { regras, ajustes, meta, catalogoDesde });
  let ritmo: Ritmo | null = null;
  if (f.tipo === "quinzenal") {
    const { data: feriados } = await getSupabaseAdmin().from("feriados").select("data").gte("data", f.inicio.slice(0, 8) + "01").lte("data", new Date(Date.UTC(aIni, mIni, 0)).toISOString().slice(0, 10));
    ritmo = calcularRitmo({ dados: coleta.dados, periodo, feriados: (feriados ?? []).map((x) => x.data.slice(0, 10)), meta, regras, ajustes });
  }
  const anterior = calcularIndicadores(coleta.dados, periodoAnterior(periodo, f.tipo), { regras });
  const [ano, mes] = f.fim.split("-").map(Number);
  const anual = resumoAnual(coleta.dados, ano, mes);
  const nomes = ["vendas", "despesas", "orcamentos", "leads", "nps", "avaliacoes"] as const;
  const personalizadas = await calcularPersonalizadas(f.clinica_id, fontesExtras(config.fontes_extras), periodo, periodoAnterior(periodo, f.tipo), releitura, { atual: indicadores, anterior });
  alertas.push(...alertasPersonalizadas(personalizadas));
  return {
    alertas, indicadores, anterior, anual, metaMensal, ritmo, personalizadas,
    fontes: nomes
      .filter((n) => fontes[n] || coleta.erros[n])
      .map((n) => ({ fonte: n, linhas: coleta.leituras[n]?.linhas ?? 0, erro: coleta.erros[n], avisos: coleta.leituras[n]?.avisos.length ?? 0 })),
    lidoEm: new Date(em).toISOString(),
  };
}

/** Conclui: recalcula com as decisões atuais e grava o retrato congelado. */
export async function concluirFechamento(id: string): Promise<void> {
  const db = getSupabaseAdmin();
  const r = await calcularFechamento(id);
  if (r.congelado) return;
  if (r.pendentesGraves) throw new Error("Ainda há alertas graves sem decisão na conferência.");
  if (r.fontes.some((x) => x.erro && (x.fonte === "vendas" || x.fonte === "despesas"))) throw new Error("Vendas ou despesas não foram lidas. Corrija antes de concluir.");
  const retrato: Retrato = { alertas: r.alertas, indicadores: r.indicadores, anterior: r.anterior, anual: r.anual, fontes: r.fontes, metaMensal: r.metaMensal, lidoEm: r.lidoEm, ritmo: r.ritmo, estrutura: r.estrutura, personalizadas: r.personalizadas, secoes: r.secoes };
  const agora = new Date().toISOString();
  await db.from("fechamentos").update({ status: "concluido", snapshot: retrato as unknown as Json, acompanhamento: r.acompanhamento as unknown as Json, concluido_em: agora, atualizado_em: agora }).eq("id", id);
  // Base padronizada para comparativos e benchmarking (ignora se a tabela ainda não existe).
  await gravarMetricas(db, r.fechamento, metricasDoFechamento(r.indicadores, r.personalizadas));
}

/* ---------- comparativos direto da base (planilhas) ---------- */

export interface MesDaBase { mes: string; indicadores: Indicadores; personalizadas: ResultadoPersonalizado[] }

export interface DadosDaBase {
  meses: MesDaBase[];
  /** Caixa x competência do ano do último mês da janela. */
  ano: { ano: string; linhas: LinhaAnual[] } | null;
  erro: string | null;
}

/**
 * Indicadores mês a mês calculados direto das planilhas do cliente (com as
 * regras salvas da conferência), para os comparativos não dependerem de
 * fechamentos feitos. Considera os últimos `quantos` meses completos.
 * Meses sem nenhum lançamento ficam de fora.
 */
export async function dadosDaBase(clinicaId: string, quantos = 24, hoje = new Date()): Promise<DadosDaBase> {
  const { data: config } = await getSupabaseAdmin().from("fechamento_config").select("*").eq("clinica_id", clinicaId).maybeSingle();
  const fontes = (config?.fontes ?? {}) as unknown as FontesFechamento;
  if (!fontes.vendas || !fontes.despesas) return { meses: [], ano: null, erro: "Cliente sem as planilhas de vendas e despesas configuradas." };
  const { coleta } = await coletarClinica(clinicaId, fontes, false);
  const erroBase = coleta.erros.vendas ?? coleta.erros.despesas;
  if (erroBase) return { meses: [], ano: null, erro: erroBase };
  const regras = (config?.regras ?? {}) as unknown as RegrasClinica;
  const extras = fontesExtras((config as { fontes_extras?: unknown } | null)?.fontes_extras);

  // Janela: do mês anterior ao atual para trás (o mês corrente ainda não fechou).
  const meses: string[] = [];
  for (let k = quantos; k >= 1; k--) {
    const d = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth() - k, 1));
    meses.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const out: MesDaBase[] = [];
  for (const m of mesesDaBase(coleta.dados, regras, meses)) {
    const personalizadas = extras.length ? await calcularPersonalizadas(clinicaId, extras, m.periodo, m.periodoAnterior, false, { atual: m.indicadores, anterior: m.anterior }) : [];
    out.push({ mes: m.mes, indicadores: m.indicadores, personalizadas });
  }
  const ultimo = meses[meses.length - 1];
  const ano = Number(ultimo.slice(0, 4)), mesN = Number(ultimo.slice(5, 7));
  const linhas = resumoAnual(coleta.dados, ano, mesN).filter((m) => m.entradas || m.saidasCaixa || m.saidasCompetencia);
  return { meses: out, ano: linhas.length ? { ano: String(ano), linhas } : null, erro: null };
}

