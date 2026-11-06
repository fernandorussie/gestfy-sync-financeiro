/**
 * Orquestração do fechamento no servidor: banco + planilhas + motor.
 *
 * Só roda no servidor (usa a service role do Supabase e a conta de serviço
 * do Google). As linhas lidas das planilhas ficam apenas em memória, num
 * cache curto por clínica, para que cada decisão da conferência não precise
 * reler tudo. No banco vão só decisões e totais.
 */
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { readSheetValues } from "@/lib/google/sheets";
import type { Fechamento, Json } from "@/lib/supabase/types";
import { coletar, type FontesFechamento, type ResultadoColeta } from "./coleta";
import { conferir, type Alerta } from "./conferencia";
import { ajustesDasDecisoes, decisoesVazias, gravesPendentes, gruposEscolhidos, metaEscolhida, type Decisoes } from "./decisoes";
import { calcularIndicadores, resumoAnual, type Indicadores, type LinhaAnual, type Periodo, type RegrasClinica } from "./indicadores";
import { periodoAnterior } from "./periodo";
import { textoVazio, type Acao, type Acompanhamento, type TextoFechamento } from "./texto-fechamento";

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
  /** true = concluído: números do retrato congelado, sem reler planilhas. */
  congelado: boolean;
  texto: TextoFechamento;
  acoes: Acao[];
  /** Andamento das ações do fechamento anterior (começa com as ações dele). */
  acompanhamento: Acompanhamento[];
  /** Nomes já usados como responsáveis na clínica. */
  equipe: string[];
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
  if (!config) throw new Error("A clínica ainda não tem as planilhas configuradas para fechamento.");

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
  };

  const congelado = (f.status === "concluido" || f.status === "enviado") && !!f.snapshot;
  if (congelado) {
    const r = f.snapshot as unknown as Retrato;
    return { ...comuns, ...r, pendentesGraves: gravesPendentes(r.alertas, decisoes).length, congelado: true };
  }
  const retrato = await calcularRetrato(f, config, decisoes, !!opcoes.releitura);
  await db.from("fechamentos").update({
    indicadores: retrato.indicadores as unknown as Json,
    alertas: retrato.alertas as unknown as Json,
    calculado_em: new Date().toISOString(),
  }).eq("id", id);
  return { ...comuns, ...retrato, pendentesGraves: gravesPendentes(retrato.alertas, decisoes).length, congelado: false };
}

/** Lê as planilhas (ou o cache) e calcula alertas, indicadores, período anterior e ano. */
async function calcularRetrato(
  f: Fechamento,
  config: { fontes: Json; regras: Json },
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
  const indicadores = calcularIndicadores(coleta.dados, periodo, { regras, ajustes, meta });
  const anterior = calcularIndicadores(coleta.dados, periodoAnterior(periodo, f.tipo), { regras });
  const [ano, mes] = f.fim.split("-").map(Number);
  const anual = resumoAnual(coleta.dados, ano, mes);
  const nomes = ["vendas", "despesas", "orcamentos", "leads", "nps", "avaliacoes"] as const;
  return {
    alertas, indicadores, anterior, anual, metaMensal,
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
  const retrato: Retrato = { alertas: r.alertas, indicadores: r.indicadores, anterior: r.anterior, anual: r.anual, fontes: r.fontes, metaMensal: r.metaMensal, lidoEm: r.lidoEm };
  const agora = new Date().toISOString();
  await db.from("fechamentos").update({ status: "concluido", snapshot: retrato as unknown as Json, acompanhamento: r.acompanhamento as unknown as Json, concluido_em: agora, atualizado_em: agora }).eq("id", id);
}
