"use server";

/**
 * Cadastro do cliente (tabela `clinicas`). As telas ficam em /clientes; o nome
 * da tabela continua "clinicas" porque todo o GestfySync (Report Semanal,
 * Checkpoint, metas, fechamentos) aponta para ela pelo mesmo ID.
 */
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { clinicaSchema } from "./_schemas";

function nullify(v: string | undefined): string | null {
  return v && v.trim() ? v.trim() : null;
}

function atualizarTelas(id?: string) {
  revalidatePath("/clientes");
  if (id) revalidatePath(`/clientes/${id}`);
  revalidatePath("/fechamentos");
  revalidatePath("/checkpoint");
}

export async function createClinica(data: unknown): Promise<{ ok: true; id: string } | { error: string }> {
  const parsed = clinicaSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const db = getSupabaseAdmin();
  const { data: criada, error } = await db.from("clinicas").insert({
    nome: parsed.data.nome,
    slug: parsed.data.slug,
    tag_curta: nullify(parsed.data.tag_curta),
    google_place_id: nullify(parsed.data.google_place_id),
    ativa: parsed.data.ativa,
  }).select("id").single();

  if (error) {
    if (error.code === "23505") return { error: "Esse identificador já existe. Escolha outro." };
    return { error: error.message };
  }
  atualizarTelas(criada.id);
  return { ok: true, id: criada.id };
}

export async function updateClinica(id: string, data: unknown): Promise<{ ok: true } | { error: string }> {
  const parsed = clinicaSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const db = getSupabaseAdmin();
  const { error } = await db
    .from("clinicas")
    .update({
      nome: parsed.data.nome,
      slug: parsed.data.slug,
      tag_curta: nullify(parsed.data.tag_curta),
      google_place_id: nullify(parsed.data.google_place_id),
      ativa: parsed.data.ativa,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") return { error: "Esse identificador já existe. Escolha outro." };
    return { error: error.message };
  }
  atualizarTelas(id);
  return { ok: true };
}

/** Desativar mantém tudo (metas, fontes, reports, fechamentos); o cliente só sai das listas do dia a dia. */
export async function alterarSituacaoCliente(id: string, ativa: boolean): Promise<{ ok: true } | { error: string }> {
  const db = getSupabaseAdmin();
  const { error } = await db.from("clinicas").update({ ativa }).eq("id", id);
  if (error) return { error: error.message };
  atualizarTelas(id);
  return { ok: true };
}

/** O que impede a exclusão definitiva: qualquer histórico ligado ao cliente. */
export async function historicoDoCliente(id: string): Promise<{ metas: number; reports: number; fechamentos: number }> {
  const db = getSupabaseAdmin();
  const conta = async (tabela: "metas" | "relatorios_gerados" | "fechamentos") => {
    const { count, error } = await db.from(tabela).select("id", { count: "exact", head: true }).eq("clinica_id", id);
    // Na dúvida (erro de leitura), considera que há histórico: a exclusão fica bloqueada.
    return error ? 1 : count ?? 0;
  };
  const [metas, reports, fechamentos] = await Promise.all([conta("metas"), conta("relatorios_gerados"), conta("fechamentos")]);
  return { metas, reports, fechamentos };
}

/**
 * Exclusão definitiva: só para cliente sem nenhum histórico (cadastro feito por
 * engano), e só com o nome digitado igual. Apagar o cliente apaga em cascata
 * tudo o que está ligado a ele no banco.
 */
export async function deleteClinica(id: string, nomeDigitado: string): Promise<{ ok: true } | { error: string }> {
  const db = getSupabaseAdmin();
  const { data: c, error: e1 } = await db.from("clinicas").select("nome").eq("id", id).maybeSingle();
  if (e1) return { error: e1.message };
  if (!c) return { error: "Cliente não encontrado." };
  if (nomeDigitado.trim().toLowerCase() !== c.nome.trim().toLowerCase()) return { error: "O nome digitado não confere." };
  const h = await historicoDoCliente(id);
  if (h.metas || h.reports || h.fechamentos) return { error: "Este cliente tem histórico. Use Desativar: assim nada se perde." };
  const { error } = await db.from("clinicas").delete().eq("id", id);
  if (error) return { error: error.message };
  atualizarTelas();
  return { ok: true };
}
