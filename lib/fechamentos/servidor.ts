/**
 * Orquestração do fechamento no servidor: banco + planilhas + motor.
 *
 * Só roda no servidor (usa a service role do Supabase e a conta de serviço
 * do Google). As linhas lidas das planilhas ficam apenas em memória, num
 * cache curto por clínica, para que cada decisão da conferência não precise
 * reler tudo. No banco vão só decisões e totais.
 */
import { garantirFontesUnicas } from "@/lib/clientes/fontes-unicas";
import { calcularRitmo, type Ritmo } from "./ritmo";
import { limparFicha, type FichaClinica } from "./ficha";
import { vocabularioDe, type Vocabulario } from "./vocabulario";
import { gravarMetricas, metricasDoFechamento, type Metrica } from "./metricas";
import { claudeConfigurado } from "./claude-api";
import { agruparPeriodos, concluido, indicadoresDe, mesesDaBase, type LinhaFechamento } from "./historico";
import { metaDoIntervalo } from "./comparativos";
import { extrasDe, limparSecoes, normalizarEstrutura, type ItemSecao, type SecaoPersonalizada } from "./estrutura";
import { adaptarResultado, calcularFontes, colunasUsadas, lerFontePersonalizada, limparFontePersonalizada, type FontePersonalizada, type LeituraPersonalizada, type ResultadoPersonalizado } from "./fonte-personalizada";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { readSheetValues } from "@/lib/google/sheets";
import type { Fechamento, Json } from "@/lib/supabase/types";
import { coletar, type FontesFechamento, type ResultadoColeta } from "./coleta";
import { conferir, type Alerta } from "./conferencia";
import { ajustesDasDecisoes, decisoesVazias, gravesPendentes, gruposEscolhidos, entradasEscolhidas, metaEscolhida, type Decisoes } from "./decisoes";
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

/**
 * Planilhas do cliente pela fonte única (Report Semanal e Checkpoint usam
 * esta entrada; os fechamentos leem a mesma configuração). Usa o mesmo cache
 * de 10 minutos; `releitura` força ler de novo.
 */
export async function coletarFontesDoCliente(clinicaId: string, releitura = false): Promise<{ coleta: ResultadoColeta; regras: RegrasClinica; fontes: FontesFechamento; extras: FontePersonalizada[] }> {
  await garantirFontesUnicas(clinicaId);
  const { data: config } = await getSupabaseAdmin().from("fechamento_config").select("*").eq("clinica_id", clinicaId).maybeSingle();
  const fontes = (config?.fontes ?? {}) as unknown as FontesFechamento;
  const regras = (config?.regras ?? {}) as unknown as RegrasClinica;
  const { coleta } = await coletarClinica(clinicaId, fontes, releitura);
  return { coleta, regras, fontes, extras: fontesExtras((config as { fontes_extras?: unknown } | null)?.fontes_extras) };
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

/**
 * PDF de exemplo para o editor de Estrutura quando o cliente ainda não tem
 * fechamento daquele tipo: lê as planilhas do último período fechado (mês
 * anterior; quinzenal = 1–15 do mês, ou do mês anterior antes do dia 16) e
 * monta o relatório sem salvar nada.
 */
export async function calcularExemplo(clinicaId: string, tipo: "mensal" | "quinzenal"): Promise<ResultadoFechamento> {
  const db = getSupabaseAdmin();
  const [{ data: clinica }, { data: config }] = await Promise.all([
    db.from("clinicas").select("nome").eq("id", clinicaId).maybeSingle(),
    db.from("fechamento_config").select("*").eq("clinica_id", clinicaId).maybeSingle(),
  ]);
  if (!clinica) throw new Error("Fechamento não encontrado.");
  const fontes = (config?.fontes ?? {}) as unknown as FontesFechamento;
  if (!config || !fontes.vendas || !fontes.despesas) throw new Error("Configure as fontes de vendas e despesas deste cliente para ver o PDF de exemplo.");
  const hoje = new Date();
  const ref = new Date(hoje.getFullYear(), hoje.getMonth() - (tipo === "mensal" || hoje.getDate() <= 15 ? 1 : 0), 1);
  const mes = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
  const p = periodoDe(mes, tipo);
  const agora = hoje.toISOString();
  const f = {
    id: "exemplo", clinica_id: clinicaId, tipo, inicio: p.inicio, fim: p.fim, status: "conferencia", versao: 1,
    decisoes: null, texto: null, acoes: null, acompanhamento: null, snapshot: null, indicadores: null, alertas: null,
    criado_em: agora, atualizado_em: agora, calculado_em: null,
  } as unknown as Fechamento;
  const decisoes = lerDecisoes(null);
  const ficha = limparFicha((config.ficha ?? {}) as Partial<FichaClinica>);
  const retrato = await calcularRetrato(f, config, decisoes, false);
  return {
    fechamento: f, clinicaNome: clinica.nome ?? "", periodo: p, decisoes,
    texto: textoVazio(), acoes: [], acompanhamento: [], equipe: lista<string>(config.equipe), ficha, vocab: vocabularioDe(ficha), iaLigada: false,
    estrutura: normalizarEstrutura(((config as { relatorio?: Record<string, unknown> }).relatorio ?? {})[tipo], tipo, extrasDaConfig(config)),
    secoes: secoesDaConfig(config),
    ...retrato, ritmo: retrato.ritmo ?? null, personalizadas: retrato.personalizadas ?? [], pendentesGraves: gravesPendentes(retrato.alertas, decisoes).length, congelado: false,
  };
}

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
    const chave = `${clinicaId}|${f.id}|${f.sheetId}|${f.aba}|${f.linhaCabecalho ?? ""}|${f.modo ?? ""}|${f.colunaData}|${colunasUsadas(f).join("|")}`;
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
  // Posição atual não tem meses na planilha: calcula no mês de hoje (a referência dos filtros de data).
  const m = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : alvo.modo === "posicao" ? new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 7) : meses[0];
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
  const regras: RegrasClinica = {
    ...regrasBase,
    categoriasDespesa: { ...(regrasBase.categoriasDespesa ?? {}), ...gruposEscolhidos(decisoes) },
    categoriasEntrada: { ...(regrasBase.categoriasEntrada ?? {}), ...entradasEscolhidas(decisoes) },
  };
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
  const anual = resumoAnual(coleta.dados, ano, mes, regras);
  const nomes = ["vendas", "despesas", "entradas", "orcamentos", "leads", "nps", "avaliacoes"] as const;
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
  const linhas = resumoAnual(coleta.dados, ano, mesN, regras).filter((m) => m.entradas || m.recebido || m.saidasCaixa || m.saidasCompetencia);
  return { meses: out, ano: linhas.length ? { ano: String(ano), linhas } : null, erro: null };
}


/* ======================= Comparativos v2 ======================= */

export interface PontoComparativo {
  chave: string;
  rotulo: string;
  inicio: string;
  fim: string;
  parcial: boolean;
  /** fechamento = números congelados de um fechamento concluído; planilha = calculado agora. */
  origem: "fechamento" | "planilha";
  fechamentoId: string | null;
  metricas: Metrica[];
}

/** Período anterior do mesmo tamanho (para as variações das personalizadas). */
function mesmoTamanhoAntes(p: Periodo): Periodo {
  const d = (s: string) => Date.parse(`${s}T00:00:00Z`);
  const dias = Math.round((d(p.fim) - d(p.inicio)) / 864e5);
  const fim = new Date(d(p.inicio) - 864e5);
  const ini = new Date(fim.getTime() - dias * 864e5);
  const f = (x: Date) => x.toISOString().slice(0, 10);
  return { inicio: f(ini), fim: f(fim) };
}

/**
 * Indicadores de um cliente em vários períodos (pontos do gráfico ou os
 * períodos A e B). Um ponto que coincide com um fechamento concluído (mês
 * inteiro ou 1ª quinzena) usa os números dele; os demais são calculados das
 * planilhas, com a mesma regra dos fechamentos. A meta só entra em períodos de
 * meses inteiros (soma das metas mensais de faturamento).
 */
export async function comparativoDoCliente(clinicaId: string, fatias: (Periodo & { chave: string; rotulo: string; parcial: boolean })[]): Promise<{ pontos: PontoComparativo[]; erro: string | null }> {
  const db = getSupabaseAdmin();
  const { coleta, regras, fontes, extras } = await coletarFontesDoCliente(clinicaId);
  const erroBase = !fontes.vendas ? "Cliente sem a planilha de vendas configurada." : coleta.erros.vendas ?? null;
  if (!fatias.length) return { pontos: [], erro: erroBase };
  const ini = fatias[0].inicio, fim = fatias[fatias.length - 1].fim;

  const [{ data: linhas }, { data: tipos }] = await Promise.all([
    db.from("fechamentos").select("id, clinica_id, tipo, inicio, fim, status, versao, indicadores, snapshot, concluido_em, enviado_em").eq("clinica_id", clinicaId).gte("inicio", ini).lte("fim", fim).limit(500),
    db.from("tipos_meta").select("id").ilike("nome", "faturamento"),
  ]);
  const metas = new Map<string, number>();
  if (tipos?.length) {
    const { data: ms } = await db.from("metas").select("mes, ano, valor_meta_mensal").eq("clinica_id", clinicaId).in("tipo_meta_id", tipos.map((t) => t.id));
    for (const m of ms ?? []) if (m.valor_meta_mensal) metas.set(`${m.ano}-${String(m.mes).padStart(2, "0")}`, Number(m.valor_meta_mensal));
  }
  const concluidos = new Map(agruparPeriodos((linhas ?? []) as LinhaFechamento[]).filter((p) => concluido(p.atual)).map((p) => [`${p.inicio}|${p.fim}`, p.atual]));

  const pontos: PontoComparativo[] = [];
  for (const f of fatias) {
    const fech = concluidos.get(`${f.inicio}|${f.fim}`);
    if (fech) {
      const snap = fech.snapshot as { personalizadas?: unknown[] } | null;
      pontos.push({ ...f, origem: "fechamento", fechamentoId: fech.id, metricas: metricasDoFechamento(indicadoresDe(fech), (snap?.personalizadas ?? []).map(adaptarResultado)) });
      continue;
    }
    if (erroBase) continue;
    const periodo = { inicio: f.inicio, fim: f.fim };
    const ind = calcularIndicadores(coleta.dados, periodo, { regras, meta: metaDoIntervalo(periodo, metas) });
    if (!ind.faturamento?.total && !ind.despesas?.total && !ind.leads?.total) continue; // período sem lançamento
    let pers: ResultadoPersonalizado[] = [];
    if (extras.length) {
      const antes = mesmoTamanhoAntes(periodo);
      pers = await calcularPersonalizadas(clinicaId, extras, periodo, antes, false, { atual: ind, anterior: calcularIndicadores(coleta.dados, antes, { regras }) });
    }
    pontos.push({ ...f, origem: "planilha", fechamentoId: null, metricas: metricasDoFechamento(ind, pers) });
  }
  return { pontos, erro: erroBase };
}

/** Caixa x competência do ano do fim do período, calculado das planilhas. */
export async function anoDoCliente(clinicaId: string, fimISO: string): Promise<{ ano: string; linhas: LinhaAnual[] } | null> {
  const { coleta, regras, fontes } = await coletarFontesDoCliente(clinicaId);
  if (!fontes.vendas || !fontes.despesas || coleta.erros.vendas || coleta.erros.despesas) return null;
  const ano = Number(fimISO.slice(0, 4)), mes = Number(fimISO.slice(5, 7));
  const linhas = resumoAnual(coleta.dados, ano, mes, regras).filter((m) => m.entradas || m.recebido || m.saidasCaixa || m.saidasCompetencia);
  return linhas.length ? { ano: String(ano), linhas } : null;
}

/* ---------- Report Semanal: modelo financeiro e operacional ---------- */

export interface SemanalFinanceiro {
  financeiro: { origemEntradas: "entradas" | "vendas"; entradas: number | null; entradasMes: number | null; saidas: number | null; saidasMes: number | null } | null;
  /** Maiores categorias de despesa paga no período (nome, valor). */
  despesas: { nome: string; valor: number }[];
  /** Indicadores personalizados pela chave "<fonteId>.<indicadorId>". */
  personalizados: Map<string, { nome: string; formato: ResultadoPersonalizado["indicadores"][number]["formato"]; melhor: ResultadoPersonalizado["indicadores"][number]["melhor"]; atual: number | null; anterior: number | null; posicao: boolean }>;
  erros: string[];
}

/**
 * Números do modelo financeiro do Report Semanal, com as mesmas regras dos
 * fechamentos: entradas pela planilha de Entradas (sem ela, Vendas), saídas =
 * despesas pagas pela data de pagamento, e os indicadores personalizados.
 */
export async function semanalFinanceiroDoCliente(clinicaId: string, periodo: Periodo, pedido: { financeiro: boolean; despesas: boolean; personalizados: boolean }): Promise<SemanalFinanceiro> {
  const out: SemanalFinanceiro = { financeiro: null, despesas: [], personalizados: new Map(), erros: [] };
  if (!pedido.financeiro && !pedido.despesas && !pedido.personalizados) return out;
  const { coleta, regras, fontes, extras } = await coletarFontesDoCliente(clinicaId);
  const ind = calcularIndicadores(coleta.dados, periodo, { regras });

  if (pedido.financeiro || pedido.despesas) {
    if (!fontes.despesas) out.erros.push("Saídas: planilha de Despesas não configurada em Clientes → Fontes de dados.");
    else if (coleta.erros.despesas) out.erros.push(`Despesas: ${coleta.erros.despesas}`);
    out.erros.push(...avisosDeValor("Despesas", coleta.leituras.despesas?.avisos ?? []));
  }
  if (pedido.financeiro) {
    const mes = { inicio: `${periodo.fim.slice(0, 8)}01`, fim: periodo.fim };
    const indMes = calcularIndicadores(coleta.dados, mes, { regras });
    const comEntradas = !!fontes.entradas && !!coleta.dados.entradas && !coleta.erros.entradas;
    if (fontes.entradas && coleta.erros.entradas) out.erros.push(`Entradas: ${coleta.erros.entradas} (usei Vendas no lugar).`);
    if (!comEntradas && coleta.erros.vendas) out.erros.push(`Vendas: ${coleta.erros.vendas}`);
    out.financeiro = {
      origemEntradas: comEntradas ? "entradas" : "vendas",
      entradas: comEntradas ? ind.entradas?.total ?? null : ind.faturamento?.total ?? null,
      entradasMes: comEntradas ? indMes.entradas?.total ?? null : indMes.faturamento?.total ?? null,
      saidas: ind.despesas?.total ?? null,
      saidasMes: indMes.despesas?.total ?? null,
    };
  }
  if (pedido.despesas && ind.despesas) {
    out.despesas = ind.despesas.porGrupo.flatMap((g) => g.categorias).filter((c) => c.valor > 0).sort((a, b) => b.valor - a.valor).slice(0, 5).map((c) => ({ nome: c.nome, valor: c.valor }));
  }
  if (pedido.personalizados && extras.length) {
    const antes = mesmoTamanhoAntes(periodo);
    const rs = await calcularPersonalizadas(clinicaId, extras, periodo, antes, false, { atual: ind, anterior: calcularIndicadores(coleta.dados, antes, { regras }) });
    for (const r of rs) {
      const f = extras.find((x) => x.id === r.id);
      if (r.erro) out.erros.push(`${r.nome}: ${r.erro}`);
      for (const i of r.indicadores) out.personalizados.set(`${r.id}.${i.id}`, { nome: i.nome, formato: i.formato, melhor: i.melhor, atual: i.atual, anterior: i.anterior, posicao: f?.modo === "posicao" });
    }
  }
  return out;
}

/**
 * Linhas que a leitura descartou por valor que não é número (ex.: colunas da aba
 * do mês fora de ordem: "Pix" caindo na coluna Valor). Sem este aviso, o total
 * sai menor (ou zero) sem explicação.
 */
function avisosDeValor(fonte: string, avisos: { linha: number; campo: string; valor: string; motivo: string }[]): string[] {
  const ruins = avisos.filter((a) => a.campo === "valor" && a.valor.trim() !== "");
  if (!ruins.length) return [];
  const ex = ruins.slice(0, 3).map((a) => `linha ${a.linha}: “${a.valor.slice(0, 30)}”`).join("; ");
  return [`${fonte}: ${ruins.length} linha(s) ignorada(s) porque a coluna Valor não tem um número (${ex}). Confira se as colunas da aba estão na mesma ordem das outras.`];
}
