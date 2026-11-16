"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { INDICADORES } from "@/lib/checkpoint/indicadores";
import type { NomeIndicador, CheckpointIndicadorInsert } from "@/lib/supabase/types";

/**
 * Grava quais indicadores a clínica acompanha. Salva uma linha por indicador da
 * lista fixa (inclusive os desligados), para a escolha do usuário sobreviver a
 * mudanças futuras no padrão sugerido.
 */
export async function salvarIndicadores(
  clinicaId: string,
  ativos: NomeIndicador[],
): Promise<{ ok: boolean; erro?: string }> {
  const db = getSupabaseAdmin();
  const marcados = new Set(ativos);

  const linhas: CheckpointIndicadorInsert[] = INDICADORES.map((indicador) => ({
    clinica_id: clinicaId,
    indicador,
    ativo: marcados.has(indicador),
  }));

  const { error } = await db
    .from("checkpoint_indicadores")
    .upsert(linhas, { onConflict: "clinica_id,indicador" });

  if (error) return { ok: false, erro: error.message };

  revalidatePath(`/clientes/${clinicaId}`);
  revalidatePath("/checkpoint");
  return { ok: true };
}
