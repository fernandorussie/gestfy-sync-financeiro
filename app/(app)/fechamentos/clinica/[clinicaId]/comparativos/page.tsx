export const revalidate = 0;

import Link from "next/link";
import { notFound } from "next/navigation";
import { History } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { faltaColunaOuTabela } from "@/lib/fechamentos/banco";
import { agruparPeriodos, anoCaixaCompetencia, concluido, indicadoresDe, seriesComparativas, type LinhaFechamento } from "@/lib/fechamentos/historico";
import { adaptarResultado } from "@/lib/fechamentos/fonte-personalizada";
import { gravarMetricas, metricasDoFechamento } from "@/lib/fechamentos/metricas";
import { limparFicha, type FichaClinica } from "@/lib/fechamentos/ficha";
import { cap, vocabularioDe } from "@/lib/fechamentos/vocabulario";
import { ComparativosView } from "../comparativos-view";

export default async function ComparativosPage({ params }: { params: Promise<{ clinicaId: string }> }) {
  const { clinicaId } = await params;
  const db = getSupabaseAdmin();
  const [{ data: clinica }, { data: config }, primeira] = await Promise.all([
    db.from("clinicas").select("id, nome").eq("id", clinicaId).maybeSingle(),
    db.from("fechamento_config").select("*").eq("clinica_id", clinicaId).maybeSingle(),
    db.from("fechamentos").select("id, clinica_id, tipo, inicio, fim, status, versao, indicadores, snapshot, concluido_em, enviado_em").eq("clinica_id", clinicaId).order("inicio", { ascending: false }).limit(200),
  ]);
  if (!clinica) notFound();
  let { data: linhas, error } = primeira as { data: unknown[] | null; error: { message: string; code?: string } | null };
  if (error && faltaColunaOuTabela(error)) {
    ({ data: linhas, error } = await db.from("fechamentos").select("id, clinica_id, tipo, inicio, fim, status, versao, indicadores").eq("clinica_id", clinicaId).order("inicio", { ascending: false }).limit(200));
  }
  const lista = (linhas ?? []) as (LinhaFechamento & { clinica_id: string })[];
  const periodos = agruparPeriodos(lista);

  // Completa a base padronizada de métricas com fechamentos concluídos antes dela existir.
  const concluidos = lista.filter((l) => concluido(l) && l.snapshot);
  if (concluidos.length) {
    const { data: ja, error: e } = await db.from("fechamento_metricas").select("fechamento_id").eq("clinica_id", clinicaId);
    if (!e) {
      const tem = new Set((ja ?? []).map((x) => x.fechamento_id));
      for (const l of concluidos.filter((x) => !tem.has(x.id))) {
        const snap = l.snapshot as { personalizadas?: unknown[] };
        await gravarMetricas(db, l, metricasDoFechamento(indicadoresDe(l), (snap.personalizadas ?? []).map(adaptarResultado)));
      }
    }
  }

  const vocab = vocabularioDe(limparFicha(((config as { ficha?: unknown } | null)?.ficha ?? {}) as Partial<FichaClinica>));
  const rotulos = { atendidos: `${cap(vocab.clientes)} atendidos`, novos: `${cap(vocab.clientes)} novos` };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground"><Link href="/fechamentos" className="hover:underline">Fechamentos</Link> / <Link href={`/fechamentos/clinica/${clinica.id}`} className="hover:underline">{clinica.nome}</Link> / Comparativos</p>
          <h1 className="text-2xl font-semibold">Comparativos · {clinica.nome}</h1>
        </div>
        <Link href={`/fechamentos/clinica/${clinica.id}`} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"><History className="h-4 w-4" />Histórico</Link>
      </div>
      {error && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm"><b>Não foi possível ler o banco de dados:</b> {error.message}</div>}
      <ComparativosView series={seriesComparativas(periodos, 24)} ano={anoCaixaCompetencia(periodos)} rotulos={rotulos} />
    </div>
  );
}
