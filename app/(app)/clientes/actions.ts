"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { RegrasClinica } from "@/lib/fechamentos/indicadores";
import type { CadenciaEscolha } from "@/lib/checkpoint/fontes";
import type { Json } from "@/lib/supabase/types";

/** Como o Checkpoint confere uma fonte do cliente: diária, semanal ou não confere. */
export async function salvarCadenciaCheckpoint(p: { clinicaId: string; fonte: string; cadencia: CadenciaEscolha }): Promise<{ ok: true } | { error: string }> {
  if (!["diaria", "semanal", "nao"].includes(p.cadencia) || !/^[\w:-]{1,80}$/.test(p.fonte)) return { error: "Escolha inválida." };
  const db = getSupabaseAdmin();
  const { data: cfg, error: e1 } = await db.from("fechamento_config").select("regras").eq("clinica_id", p.clinicaId).maybeSingle();
  if (e1) return { error: "Não foi possível ler a configuração do cliente." };
  const regras = (cfg?.regras ?? {}) as unknown as RegrasClinica;
  const novas: RegrasClinica = { ...regras, checkpoint: { ...(regras.checkpoint ?? {}), [p.fonte]: p.cadencia } };
  const { error } = cfg
    ? await db.from("fechamento_config").update({ regras: novas as unknown as Json, atualizado_em: new Date().toISOString() }).eq("clinica_id", p.clinicaId)
    : await db.from("fechamento_config").insert({ clinica_id: p.clinicaId, regras: novas as unknown as Json });
  if (error) return { error: "Não foi possível salvar." };
  revalidatePath(`/clientes/${p.clinicaId}`);
  return { ok: true };
}
