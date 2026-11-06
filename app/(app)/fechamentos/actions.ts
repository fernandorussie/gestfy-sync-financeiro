"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import type { FontesFechamento } from "@/lib/fechamentos/coleta";
import type { Alerta } from "@/lib/fechamentos/conferencia";
import { GRUPOS_DESPESA } from "@/lib/fechamentos/plano-contas";
import { decidir, desfazer, type AcaoDecisao, type Decisao } from "@/lib/fechamentos/decisoes";
import { calcularFechamento, lerDecisoes, limparCache, periodoDe, testarFonte, type ResultadoFechamento } from "@/lib/fechamentos/servidor";

type Resposta<T> = { ok: true; dados: T } | { ok: false; erro: string };

async function limite(n = 20): Promise<string | null> {
  const h = await headers();
  return checkRateLimit(rateLimitKey(h), n) ? null : "Muitas ações em sequência. Aguarde 1 minuto.";
}

function falha(e: unknown): { ok: false; erro: string } {
  return { ok: false, erro: e instanceof Error ? e.message : "Erro inesperado." };
}

/** Abre o fechamento do período (ou o mais recente já existente) e devolve o id. */
export async function criarFechamento(p: { clinicaId: string; tipo: "mensal" | "quinzenal"; mes: string; quinzena?: 1 | 2 }): Promise<Resposta<{ id: string }>> {
  const bloqueio = await limite(); if (bloqueio) return { ok: false, erro: bloqueio };
  if (!/^\d{4}-\d{2}$/.test(p.mes)) return { ok: false, erro: "Escolha o mês." };
  const periodo = periodoDe(p.mes, p.tipo, p.quinzena ?? 1);
  const db = getSupabaseAdmin();
  const { data: existente } = await db.from("fechamentos").select("id").eq("clinica_id", p.clinicaId).eq("tipo", p.tipo)
    .eq("inicio", periodo.inicio).eq("fim", periodo.fim).order("versao", { ascending: false }).limit(1).maybeSingle();
  if (existente) return { ok: true, dados: { id: existente.id } };
  const { data, error } = await db.from("fechamentos").insert({ clinica_id: p.clinicaId, tipo: p.tipo, inicio: periodo.inicio, fim: periodo.fim }).select("id").single();
  if (error || !data) return { ok: false, erro: "Não foi possível criar o fechamento." };
  revalidatePath("/fechamentos");
  return { ok: true, dados: { id: data.id } };
}

export async function recalcular(id: string, releitura = false): Promise<Resposta<ResultadoFechamento>> {
  const bloqueio = await limite(); if (bloqueio) return { ok: false, erro: bloqueio };
  try { return { ok: true, dados: await calcularFechamento(id, { releitura }) }; } catch (e) { return falha(e); }
}

/** Registra a decisão do consultor num alerta e recalcula. */
export async function decidirAlerta(p: { id: string; chave: string; acao: AcaoDecisao; escolha?: Decisao["escolha"] }): Promise<Resposta<ResultadoFechamento>> {
  const bloqueio = await limite(40); if (bloqueio) return { ok: false, erro: bloqueio };
  try {
    const db = getSupabaseAdmin();
    const { data: f } = await db.from("fechamentos").select("decisoes, clinica_id, alertas").eq("id", p.id).maybeSingle();
    if (!f) return { ok: false, erro: "Fechamento não encontrado." };
    // O alerta vem do último cálculo salvo, não da tela: a sugestão aplicada é sempre a do motor.
    const alerta = ((f.alertas ?? []) as unknown as Alerta[]).find((a) => a.chave === p.chave);
    if (!alerta) return { ok: false, erro: "Este alerta mudou desde a última leitura. Atualize a página." };
    const gruposValidos = new Set(GRUPOS_DESPESA.map((g) => g.grupo));
    if (p.escolha?.grupos && Object.values(p.escolha.grupos).some((g) => !gruposValidos.has(g))) return { ok: false, erro: "Grupo de despesa inválido." };
    if (p.escolha?.meta !== undefined && !(p.escolha.meta > 0)) return { ok: false, erro: "Meta inválida." };
    const novas = decidir(lerDecisoes(f.decisoes), alerta, p.acao, p.escolha);
    await db.from("fechamentos").update({ decisoes: novas as unknown as Json, atualizado_em: new Date().toISOString() }).eq("id", p.id);
    // Grupo escolhido para categoria fora do plano vale para os próximos fechamentos da clínica.
    if (p.escolha?.grupos) {
      const { data: cfg } = await db.from("fechamento_config").select("regras").eq("clinica_id", f.clinica_id).maybeSingle();
      const regras = (cfg?.regras ?? {}) as { categoriasDespesa?: Record<string, string> };
      regras.categoriasDespesa = { ...(regras.categoriasDespesa ?? {}), ...p.escolha.grupos };
      await db.from("fechamento_config").update({ regras: regras as unknown as Json, atualizado_em: new Date().toISOString() }).eq("clinica_id", f.clinica_id);
    }
    return { ok: true, dados: await calcularFechamento(p.id) };
  } catch (e) { return falha(e); }
}

export async function desfazerDecisao(p: { id: string; chave: string }): Promise<Resposta<ResultadoFechamento>> {
  const bloqueio = await limite(40); if (bloqueio) return { ok: false, erro: bloqueio };
  try {
    const db = getSupabaseAdmin();
    const { data: f } = await db.from("fechamentos").select("decisoes").eq("id", p.id).maybeSingle();
    if (!f) return { ok: false, erro: "Fechamento não encontrado." };
    await db.from("fechamentos").update({ decisoes: desfazer(lerDecisoes(f.decisoes), p.chave) as unknown as Json, atualizado_em: new Date().toISOString() }).eq("id", p.id);
    return { ok: true, dados: await calcularFechamento(p.id) };
  } catch (e) { return falha(e); }
}

export async function salvarMetaAjustada(p: { id: string; valor: number | null }): Promise<Resposta<ResultadoFechamento>> {
  const bloqueio = await limite(); if (bloqueio) return { ok: false, erro: bloqueio };
  try {
    await getSupabaseAdmin().from("fechamentos").update({ meta_ajustada: p.valor && p.valor > 0 ? p.valor : null }).eq("id", p.id);
    return { ok: true, dados: await calcularFechamento(p.id) };
  } catch (e) { return falha(e); }
}

/* ---------- configuração das planilhas ---------- */

/** Aceita o link inteiro da planilha ou só o ID. */
function extrairSheetId(texto: string): string {
  const m = texto.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return (m ? m[1] : texto).trim();
}

function limparFontes(fontes: FontesFechamento): FontesFechamento {
  const out: FontesFechamento = {};
  for (const [nome, cfg] of Object.entries(fontes) as [keyof FontesFechamento, FontesFechamento[keyof FontesFechamento]][]) {
    if (!cfg || !cfg.sheetId?.trim() || !cfg.aba?.trim()) continue;
    const colunas = Object.fromEntries(Object.entries(cfg.colunas ?? {}).filter(([, v]) => typeof v === "string" && v.trim()).map(([k, v]) => { const t = (v as string).trim(); return [k, /^[a-z]{1,2}$/i.test(t) ? t.toUpperCase() : t]; }));
    (out as Record<string, unknown>)[nome] = {
      sheetId: extrairSheetId(cfg.sheetId), aba: cfg.aba.trim(),
      ...(Object.keys(colunas).length ? { colunas } : {}),
      ...(cfg.linhaCabecalho ? { linhaCabecalho: cfg.linhaCabecalho } : {}),
    };
  }
  return out;
}

export async function salvarConfig(p: { clinicaId: string; fontes: FontesFechamento }): Promise<Resposta<null>> {
  const bloqueio = await limite(); if (bloqueio) return { ok: false, erro: bloqueio };
  const db = getSupabaseAdmin();
  const fontes = limparFontes(p.fontes);
  const { error } = await db.from("fechamento_config").upsert({ clinica_id: p.clinicaId, fontes: fontes as unknown as Json, atualizado_em: new Date().toISOString() });
  if (error) return { ok: false, erro: "Não foi possível salvar." };
  limparCache(p.clinicaId);
  revalidatePath("/fechamentos");
  return { ok: true, dados: null };
}

export async function testarLeitura(p: { nome: keyof FontesFechamento; cfg: NonNullable<FontesFechamento[keyof FontesFechamento]> }) {
  const bloqueio = await limite(); if (bloqueio) return { leitura: null, erro: bloqueio };
  const limpo = limparFontes({ [p.nome]: p.cfg } as FontesFechamento)[p.nome];
  if (!limpo) return { leitura: null, erro: "Informe o link da planilha e o nome da aba." };
  try { return await testarFonte(p.nome, limpo); } catch (e) { return { leitura: null, erro: e instanceof Error ? e.message : "Erro inesperado." }; }
}
