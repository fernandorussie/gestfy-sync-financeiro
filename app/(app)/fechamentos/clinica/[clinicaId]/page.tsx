export const revalidate = 0;

import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { LinhaFechamento } from "@/lib/fechamentos/historico";
import { HistoricoView } from "./historico-view";

export default async function HistoricoClinicaPage({ params }: { params: Promise<{ clinicaId: string }> }) {
  const { clinicaId } = await params;
  const db = getSupabaseAdmin();
  const [{ data: clinica }, { data: config }, { data: linhas, error }] = await Promise.all([
    db.from("clinicas").select("id, nome").eq("id", clinicaId).maybeSingle(),
    db.from("fechamento_config").select("fontes").eq("clinica_id", clinicaId).maybeSingle(),
    db.from("fechamentos")
      .select("id, tipo, inicio, fim, status, versao, indicadores, snapshot, concluido_em, enviado_em, acoes")
      .eq("clinica_id", clinicaId)
      .order("inicio", { ascending: false })
      .limit(200),
  ]);
  if (!clinica) notFound();

  const configurada = Object.keys((config?.fontes ?? {}) as object).length > 0;

  return <HistoricoView clinica={clinica} linhas={(linhas ?? []) as LinhaFechamento[]} configurada={configurada} erro={error?.message} />;
}
