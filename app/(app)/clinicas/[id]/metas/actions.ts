"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { metaSchema, editarMetaSchema, atualizarRealizadosSchema } from "./_schemas";

export type CopiarResult =
  | { ok: true; copiadas: number }
  | { aviso: { existentes: number } }
  | { erro: string };

function toNumber(v: string): number {
  return parseFloat(v.replace(",", ".")) || 0;
}

export async function criarMeta(
  clinicaId: string,
  mes: number,
  ano: number,
  data: unknown
) {
  const parsed = metaSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const db = getSupabaseAdmin();
  const { error } = await db.from("metas").insert({
    clinica_id: clinicaId,
    tipo_meta_id: parsed.data.tipo_meta_id,
    mes,
    ano,
    valor_meta_mensal: toNumber(parsed.data.valor_meta_mensal),
    valor_realizado: 0,
    valor_realizado_semana: 0,
  });

  if (error) {
    if (error.code === "23505") return { error: "Já existe uma meta deste tipo para este mês." };
    return { error: error.message };
  }
  revalidatePath(`/clientes/${clinicaId}`);
  return { ok: true };
}

export async function editarMeta(id: string, clinicaId: string, data: unknown) {
  const parsed = editarMetaSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const db = getSupabaseAdmin();
  const { error } = await db
    .from("metas")
    .update({ valor_meta_mensal: toNumber(parsed.data.valor_meta_mensal) })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath(`/clientes/${clinicaId}`);
  return { ok: true };
}

export async function deletarMeta(id: string, clinicaId: string) {
  const db = getSupabaseAdmin();
  const { error } = await db.from("metas").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/clientes/${clinicaId}`);
  return { ok: true };
}

export async function copiarMetasMesAnterior(
  clinicaId: string,
  mes: number,
  ano: number,
  forcar: boolean
): Promise<CopiarResult> {
  let mesPrev = mes - 1;
  let anoPrev = ano;
  if (mesPrev < 1) { mesPrev = 12; anoPrev--; }

  const db = getSupabaseAdmin();

  const { data: metasPrev } = await db
    .from("metas")
    .select("tipo_meta_id, valor_meta_mensal")
    .eq("clinica_id", clinicaId)
    .eq("mes", mesPrev)
    .eq("ano", anoPrev);

  if (!metasPrev || metasPrev.length === 0) {
    return { erro: "Nenhuma meta encontrada no mês anterior." };
  }

  const { data: metasAtuais } = await db
    .from("metas")
    .select("tipo_meta_id")
    .eq("clinica_id", clinicaId)
    .eq("mes", mes)
    .eq("ano", ano);

  const tiposExistentes = new Set((metasAtuais ?? []).map((m) => m.tipo_meta_id));

  if (!forcar && tiposExistentes.size > 0) {
    return { aviso: { existentes: tiposExistentes.size } };
  }

  const novas = metasPrev.filter((m) => !tiposExistentes.has(m.tipo_meta_id));

  if (novas.length === 0) {
    return { ok: true, copiadas: 0 };
  }

  const inserts = novas.map((m) => ({
    clinica_id:            clinicaId,
    tipo_meta_id:          m.tipo_meta_id,
    mes,
    ano,
    valor_meta_mensal:     m.valor_meta_mensal,
    valor_realizado:       0,
    valor_realizado_semana: 0,
  }));

  const { error } = await db.from("metas").insert(inserts);
  if (error) return { erro: error.message };

  revalidatePath(`/clientes/${clinicaId}`);
  return { ok: true, copiadas: novas.length };
}

export async function atualizarRealizados(clinicaId: string, data: unknown) {
  const parsed = atualizarRealizadosSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const db = getSupabaseAdmin();
  const promises = parsed.data.updates.map(({ id, valor_realizado }) =>
    db.from("metas").update({
      valor_realizado: toNumber(valor_realizado),
      data_referencia: parsed.data.data_referencia,
    }).eq("id", id)
  );

  const results = await Promise.all(promises);
  const err = results.find((r) => r.error);
  if (err?.error) return { error: err.error.message };

  revalidatePath(`/clientes/${clinicaId}`);
  return { ok: true };
}
