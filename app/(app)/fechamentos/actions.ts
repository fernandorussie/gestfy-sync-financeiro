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
import { calcularFechamento, concluirFechamento, fontesExtras, lerDecisoes, limparCache, periodoDe, testarFonte, testarFontePersonalizada, type ResultadoFechamento } from "@/lib/fechamentos/servidor";
import { limparFontePersonalizada, type FontePersonalizada } from "@/lib/fechamentos/fonte-personalizada";
import type { Acao, Acompanhamento, TextoFechamento } from "@/lib/fechamentos/texto-fechamento";
import { limparFicha, type FichaClinica } from "@/lib/fechamentos/ficha";
import { montarPacote } from "@/lib/fechamentos/pacote-ia";
import { limparEstrutura, type EstruturaRelatorio } from "@/lib/fechamentos/estrutura";
import { chamarClaude, claudeConfigurado } from "@/lib/fechamentos/claude-api";

type Resposta<T> = { ok: true; dados: T } | { ok: false; erro: string };

async function limite(n = 20): Promise<string | null> {
  const h = await headers();
  return checkRateLimit(rateLimitKey(h), n) ? null : "Muitas ações em sequência. Aguarde 1 minuto.";
}

function falha(e: unknown): { ok: false; erro: string } {
  return { ok: false, erro: e instanceof Error ? e.message : "Erro inesperado." };
}

/** Abre o fechamento do período (ou o mais recente já existente) e devolve o id. */
export async function criarFechamento(p: { clinicaId: string; tipo: "mensal" | "quinzenal"; mes: string }): Promise<Resposta<{ id: string }>> {
  const bloqueio = await limite(); if (bloqueio) return { ok: false, erro: bloqueio };
  if (!/^\d{4}-\d{2}$/.test(p.mes)) return { ok: false, erro: "Escolha o mês." };
  // Quinzenal = parcial do dia 1 ao 15 (a 2ª metade do mês fica com o mensal).
  const periodo = periodoDe(p.mes, p.tipo, 1);
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
    const { data: f } = await db.from("fechamentos").select("decisoes, clinica_id, alertas, status").eq("id", p.id).maybeSingle();
    if (!f) return { ok: false, erro: "Fechamento não encontrado." };
    if (f.status === "concluido" || f.status === "enviado") return { ok: false, erro: CONGELADO };
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
    const { data: f } = await db.from("fechamentos").select("decisoes, status").eq("id", p.id).maybeSingle();
    if (!f) return { ok: false, erro: "Fechamento não encontrado." };
    if (f.status === "concluido" || f.status === "enviado") return { ok: false, erro: CONGELADO };
    await db.from("fechamentos").update({ decisoes: desfazer(lerDecisoes(f.decisoes), p.chave) as unknown as Json, atualizado_em: new Date().toISOString() }).eq("id", p.id);
    return { ok: true, dados: await calcularFechamento(p.id) };
  } catch (e) { return falha(e); }
}

export async function salvarMetaAjustada(p: { id: string; valor: number | null }): Promise<Resposta<ResultadoFechamento>> {
  const bloqueio = await limite(); if (bloqueio) return { ok: false, erro: bloqueio };
  const st = await statusDe(p.id);
  if (st?.status === "concluido" || st?.status === "enviado") return { ok: false, erro: CONGELADO };
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

/** Ficha da clínica: contexto do cliente para a análise com o Claude. */
export async function salvarFicha(p: { clinicaId: string; ficha: FichaClinica }): Promise<Resposta<FichaClinica>> {
  const bloqueio = await limite(); if (bloqueio) return { ok: false, erro: bloqueio };
  const ficha = { ...limparFicha(p.ficha), atualizadoEm: new Date().toISOString() };
  const db = getSupabaseAdmin();
  const { data: atual } = await db.from("fechamento_config").select("clinica_id").eq("clinica_id", p.clinicaId).maybeSingle();
  const { error } = atual
    ? await db.from("fechamento_config").update({ ficha: ficha as unknown as Json, atualizado_em: new Date().toISOString() }).eq("clinica_id", p.clinicaId)
    : await db.from("fechamento_config").insert({ clinica_id: p.clinicaId, ficha: ficha as unknown as Json });
  if (error) return { ok: false, erro: /ficha/.test(error.message) ? "Falta rodar a atualização do banco 007_ficha_clinica.sql no Supabase." : "Não foi possível salvar a ficha." };
  revalidatePath(`/fechamentos/configurar/${p.clinicaId}`);
  return { ok: true, dados: ficha };
}

/** Estrutura do relatório da clínica (seções, ordem e nível), mensal e quinzenal. */
export async function salvarEstrutura(p: { clinicaId: string; estrutura: EstruturaRelatorio }): Promise<Resposta<Required<EstruturaRelatorio>>> {
  const bloqueio = await limite(); if (bloqueio) return { ok: false, erro: bloqueio };
  const db = getSupabaseAdmin();
  const { data: cfg } = await db.from("fechamento_config").select("*").eq("clinica_id", p.clinicaId).maybeSingle();
  const extras = fontesExtras((cfg as { fontes_extras?: unknown } | null)?.fontes_extras).map((x) => ({ id: x.id, nome: x.nome }));
  const estrutura = limparEstrutura(p.estrutura, extras) as Required<EstruturaRelatorio>;
  const { data: atual } = await db.from("fechamento_config").select("clinica_id").eq("clinica_id", p.clinicaId).maybeSingle();
  const { error } = atual
    ? await db.from("fechamento_config").update({ relatorio: estrutura as unknown as Json, atualizado_em: new Date().toISOString() }).eq("clinica_id", p.clinicaId)
    : await db.from("fechamento_config").insert({ clinica_id: p.clinicaId, relatorio: estrutura as unknown as Json });
  if (error) return { ok: false, erro: /relatorio/.test(error.message) ? "Falta rodar a atualização do banco 008_estrutura_relatorio.sql no Supabase." : "Não foi possível salvar a estrutura." };
  limparCache(p.clinicaId);
  revalidatePath(`/fechamentos/configurar/${p.clinicaId}`);
  return { ok: true, dados: estrutura };
}

/** Fontes personalizadas da clínica (lista completa, na ordem da tela). */
export async function salvarFontesExtras(p: { clinicaId: string; fontes: FontePersonalizada[] }): Promise<Resposta<FontePersonalizada[]>> {
  const bloqueio = await limite(); if (bloqueio) return { ok: false, erro: bloqueio };
  const fontes = (p.fontes ?? []).slice(0, 12).map((f) => limparFontePersonalizada(f));
  if (fontes.some((f) => !f.sheetId || !f.aba)) return { ok: false, erro: "Cada fonte precisa do link da planilha e do nome da aba." };
  const db = getSupabaseAdmin();
  const { data: atual } = await db.from("fechamento_config").select("clinica_id").eq("clinica_id", p.clinicaId).maybeSingle();
  const { error } = atual
    ? await db.from("fechamento_config").update({ fontes_extras: fontes as unknown as Json, atualizado_em: new Date().toISOString() }).eq("clinica_id", p.clinicaId)
    : await db.from("fechamento_config").insert({ clinica_id: p.clinicaId, fontes_extras: fontes as unknown as Json });
  if (error) return { ok: false, erro: /fontes_extras/.test(error.message) ? "Falta rodar a atualização do banco 009_fontes_personalizadas.sql no Supabase." : "Não foi possível salvar as fontes." };
  limparCache(p.clinicaId);
  revalidatePath(`/fechamentos/configurar/${p.clinicaId}`);
  return { ok: true, dados: fontes };
}

/** Testa a leitura de uma fonte personalizada e devolve colunas, contagem e amostra. */
export async function testarFonteExtra(p: { fonte: FontePersonalizada }) {
  const bloqueio = await limite(); if (bloqueio) return { erro: bloqueio, leitura: null };
  const f = limparFontePersonalizada(p.fonte);
  const r = await testarFontePersonalizada(f);
  if (!r.leitura) return { erro: r.erro, leitura: null };
  const l = r.leitura;
  return {
    erro: r.erro,
    leitura: {
      linhas: l.linhas.length, linhaCabecalho: l.linhaCabecalho, cabecalho: l.cabecalho.filter(Boolean).slice(0, 30), colunas: l.colunas,
      ignoradas: l.ignoradas.slice(0, 5), totalIgnoradas: l.ignoradas.length,
      // Amostra só com campos agregáveis (sem observação), para conferir a leitura.
      amostra: l.linhas.slice(-5).map((x) => ({ data: x.data, valor: x.valor, quantidade: x.quantidade, categoria: x.categoria, status: x.status, profissional: x.profissional })),
      valoresStatus: [...new Set(l.linhas.map((x) => x.status))].slice(0, 15),
      valoresCategoria: [...new Set(l.linhas.map((x) => x.categoria))].slice(0, 15),
    },
  };
}

/* ---------- análise e entrega ---------- */

/**
 * Rascunho com o Claude dentro do app (API): números do fechamento + ficha da
 * clínica + o que o consultor já anotou. Devolve o texto bruto; a tela lê as
 * seções e o plano e mostra para revisar antes de aplicar.
 */
export async function gerarComClaude(p: { id: string; anonimizar: boolean; texto: TextoFechamento; acompanhamento: Acompanhamento[]; acoes: Acao[] }): Promise<Resposta<{ resposta: string; custoUsd: number; modelo: string }>> {
  const bloqueio = await limite(6); if (bloqueio) return { ok: false, erro: bloqueio };
  if (!claudeConfigurado()) return { ok: false, erro: "A IA ainda não está ligada: falta cadastrar a chave ANTHROPIC_API_KEY nas variáveis da Vercel." };
  try {
    const r = await calcularFechamento(p.id);
    if (r.congelado) return { ok: false, erro: CONGELADO };
    const corta = (t: unknown, n: number) => String(t ?? "").slice(0, n);
    const texto: TextoFechamento = { contexto: corta(p.texto?.contexto, 4000), observacao: corta(p.texto?.observacao, 8000), destaques: corta(p.texto?.destaques, 6000), comercial: corta(p.texto?.comercial, 6000), atencao: corta(p.texto?.atencao, 6000) };
    const prompt = montarPacote({
      clinica: r.clinicaNome, tipo: r.fechamento.tipo, indicadores: r.indicadores, anterior: r.anterior, anual: r.anual, ritmo: r.ritmo,
      alertas: r.alertas, decisoes: r.decisoes, texto, acoes: (p.acoes ?? []).slice(0, 20), acompanhamento: (p.acompanhamento ?? []).slice(0, 20), ficha: r.ficha, personalizadas: r.personalizadas,
    }, { anonimizar: !!p.anonimizar, destino: "api" });
    const res = await chamarClaude(prompt);
    // Estimativa pelo preço do Sonnet (US$ 2 / US$ 10 por milhão de tokens); só para referência na tela.
    const custoUsd = (res.tokensEntrada * 2 + res.tokensSaida * 10) / 1_000_000;
    return { ok: true, dados: { resposta: res.texto, custoUsd, modelo: res.modelo } };
  } catch (e) { return falha(e); }
}

const CONGELADO = "Este fechamento já foi concluído. Use “Reabrir” para criar uma nova versão.";

async function statusDe(id: string) {
  const { data } = await getSupabaseAdmin().from("fechamentos").select("status, clinica_id").eq("id", id).maybeSingle();
  return data;
}

/** Salva texto, plano de ação e acompanhamento. Os responsáveis entram na equipe da clínica. */
export async function salvarAnalise(p: { id: string; texto: TextoFechamento; acoes: Acao[]; acompanhamento: Acompanhamento[] }): Promise<Resposta<null>> {
  const bloqueio = await limite(60); if (bloqueio) return { ok: false, erro: bloqueio };
  const f = await statusDe(p.id);
  if (!f) return { ok: false, erro: "Fechamento não encontrado." };
  if (f.status === "concluido" || f.status === "enviado") return { ok: false, erro: CONGELADO };
  const corta = (t: unknown, n: number) => String(t ?? "").slice(0, n);
  const texto: TextoFechamento = {
    contexto: corta(p.texto.contexto, 4000), observacao: corta(p.texto.observacao, 8000), destaques: corta(p.texto.destaques, 6000),
    comercial: corta(p.texto.comercial, 6000), atencao: corta(p.texto.atencao, 6000),
  };
  const acoes: Acao[] = p.acoes.slice(0, 20).map((a) => ({
    id: corta(a.id, 40), titulo: corta(a.titulo, 200), descricao: corta(a.descricao, 1500), indicador: corta(a.indicador, 300),
    responsaveis: (a.responsaveis ?? []).map((r) => corta(r, 60).trim()).filter(Boolean).slice(0, 8),
    prazo: /^\d{4}-\d{2}-\d{2}$/.test(a.prazo ?? "") ? a.prazo : null,
  }));
  const acompanhamento: Acompanhamento[] = p.acompanhamento.slice(0, 30).map((a) => ({
    id: corta(a.id, 40), titulo: corta(a.titulo, 200), responsaveis: (a.responsaveis ?? []).map((r) => corta(r, 60)),
    status: a.status === "concluida" || a.status === "andamento" || a.status === "nao_feita" ? a.status : null, nota: corta(a.nota, 500),
  }));
  const db = getSupabaseAdmin();
  const { error } = await db.from("fechamentos").update({
    texto: texto as unknown as Json, acoes: acoes as unknown as Json, acompanhamento: acompanhamento as unknown as Json,
    status: f.status === "conferencia" ? "analise" : f.status, atualizado_em: new Date().toISOString(),
  }).eq("id", p.id);
  if (error) return { ok: false, erro: "Não foi possível salvar." };
  const nomes = acoes.flatMap((a) => a.responsaveis);
  if (nomes.length) {
    const { data: cfg } = await db.from("fechamento_config").select("equipe").eq("clinica_id", f.clinica_id).maybeSingle();
    const atual = Array.isArray(cfg?.equipe) ? (cfg!.equipe as string[]) : [];
    const novos = nomes.filter((n) => !atual.some((x) => x.toLowerCase() === n.toLowerCase()));
    if (novos.length) await db.from("fechamento_config").update({ equipe: [...atual, ...new Set(novos)].slice(0, 60) as unknown as Json }).eq("clinica_id", f.clinica_id);
  }
  return { ok: true, dados: null };
}

export async function concluir(p: { id: string }): Promise<Resposta<ResultadoFechamento>> {
  const bloqueio = await limite(); if (bloqueio) return { ok: false, erro: bloqueio };
  try {
    await concluirFechamento(p.id);
    revalidatePath("/fechamentos");
    return { ok: true, dados: await calcularFechamento(p.id) };
  } catch (e) { return falha(e); }
}

export async function marcarEnviado(p: { id: string }): Promise<Resposta<ResultadoFechamento>> {
  const bloqueio = await limite(); if (bloqueio) return { ok: false, erro: bloqueio };
  const f = await statusDe(p.id);
  if (f?.status !== "concluido") return { ok: false, erro: "Conclua o fechamento antes de marcar como enviado." };
  const agora = new Date().toISOString();
  await getSupabaseAdmin().from("fechamentos").update({ status: "enviado", enviado_em: agora, atualizado_em: agora }).eq("id", p.id);
  revalidatePath("/fechamentos");
  try { return { ok: true, dados: await calcularFechamento(p.id) }; } catch (e) { return falha(e); }
}

/** Cria a versão seguinte de um fechamento concluído, com as mesmas decisões, texto e plano. A anterior fica no histórico. */
export async function reabrir(p: { id: string }): Promise<Resposta<{ id: string }>> {
  const bloqueio = await limite(); if (bloqueio) return { ok: false, erro: bloqueio };
  const db = getSupabaseAdmin();
  const { data: f } = await db.from("fechamentos").select("*").eq("id", p.id).maybeSingle();
  if (!f) return { ok: false, erro: "Fechamento não encontrado." };
  if (f.status !== "concluido" && f.status !== "enviado") return { ok: false, erro: "Só fechamentos concluídos podem ser reabertos." };
  const { data: ultima } = await db.from("fechamentos").select("versao").eq("clinica_id", f.clinica_id).eq("tipo", f.tipo)
    .eq("inicio", f.inicio).eq("fim", f.fim).order("versao", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await db.from("fechamentos").insert({
    clinica_id: f.clinica_id, tipo: f.tipo, inicio: f.inicio, fim: f.fim, versao: (ultima?.versao ?? f.versao) + 1, status: "analise",
    meta_ajustada: f.meta_ajustada, decisoes: f.decisoes, texto: f.texto, acoes: f.acoes, acompanhamento: f.acompanhamento,
  }).select("id").single();
  if (error || !data) return { ok: false, erro: "Não foi possível reabrir." };
  limparCache(f.clinica_id);
  revalidatePath("/fechamentos");
  return { ok: true, dados: { id: data.id } };
}
