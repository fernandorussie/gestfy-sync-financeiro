export const revalidate = 0;

import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { LinhaFechamento } from "@/lib/fechamentos/historico";
import { faltaColunaOuTabela, migracoesPendentes } from "@/lib/fechamentos/banco";
import { AvisoBanco } from "../../_components/aviso-banco";
import { HistoricoView } from "./historico-view";

export default async function HistoricoClinicaPage({ params }: { params: Promise<{ clinicaId: string }> }) {
  const { clinicaId } = await params;
  const db = getSupabaseAdmin();
  const buscar = (colunas: string) => db.from("fechamentos").select(colunas).eq("clinica_id", clinicaId).order("inicio", { ascending: false }).limit(200);
  const [{ data: clinica }, { data: config }, primeira, pendentes] = await Promise.all([
    db.from("clinicas").select("id, nome").eq("id", clinicaId).maybeSingle(),
    db.from("fechamento_config").select("fontes").eq("clinica_id", clinicaId).maybeSingle(),
    buscar("id, tipo, inicio, fim, status, versao, indicadores, snapshot, concluido_em, enviado_em, acoes"),
    migracoesPendentes(db),
  ]);
  if (!clinica) notFound();

  // Banco sem a atualização 006: mostra o histórico com as colunas básicas em vez de quebrar.
  let { data: linhas, error } = primeira;
  if (error && faltaColunaOuTabela(error)) ({ data: linhas, error } = await buscar("id, tipo, inicio, fim, status, versao, indicadores"));

  const configurada = Object.keys((config?.fontes ?? {}) as object).length > 0;

  return (
    <>
      {pendentes.length > 0 && <div className="mx-auto max-w-6xl px-6 pt-6 md:px-8"><AvisoBanco pendentes={pendentes} /></div>}
      <HistoricoView clinica={clinica} linhas={(linhas ?? []) as unknown as LinhaFechamento[]} configurada={configurada} erro={error?.message} />
    </>
  );
}
