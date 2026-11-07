export const revalidate = 0;

import Link from "next/link";
import { History } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { faltaColunaOuTabela } from "@/lib/fechamentos/banco";
import { agruparPeriodos, anoCaixaCompetencia, concluido, indicadoresDe, seriesComparativas, type LinhaFechamento } from "@/lib/fechamentos/historico";
import { adaptarResultado } from "@/lib/fechamentos/fonte-personalizada";
import { gravarMetricas, metricasDoFechamento } from "@/lib/fechamentos/metricas";
import { limparFicha, type FichaClinica } from "@/lib/fechamentos/ficha";
import { cap, vocabularioDe } from "@/lib/fechamentos/vocabulario";
import { ComparativosView, SeletorCliente } from "./comparativos-view";

export default async function ComparativosPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const { cliente } = await searchParams;
  const db = getSupabaseAdmin();
  // Clientes com algum fechamento mensal (os outros não têm o que comparar).
  const [{ data: todos }, { data: comFechamento }] = await Promise.all([
    db.from("clinicas").select("id, nome").order("nome"),
    db.from("fechamentos").select("clinica_id").eq("tipo", "mensal").limit(2000),
  ]);
  const ids = new Set((comFechamento ?? []).map((x) => x.clinica_id));
  const clientes = (todos ?? []).filter((c) => ids.has(c.id));
  const clinica = clientes.find((c) => c.id === cliente) ?? (clientes.length === 1 ? clientes[0] : undefined);

  const cabecalho = (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">Relatórios Financeiros</p>
      <h1 className="text-2xl font-semibold">Comparativos{clinica ? ` · ${clinica.nome}` : ""}</h1>
      <p className="text-sm text-muted-foreground">Evolução de um cliente ao longo dos meses. A comparação entre clientes (benchmarking) virá numa próxima etapa.</p>
    </div>
  );
  if (!clinica) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
        {cabecalho}
        <div className="rounded-lg border bg-card p-5">
          {clientes.length ? <SeletorCliente clientes={clientes} atual="" /> : <p className="text-sm text-muted-foreground">Ainda não há fechamentos mensais para comparar. Eles começam em <Link href="/fechamentos" className="underline">Fechamentos do mês</Link>.</p>}
        </div>
      </div>
    );
  }
  const clinicaId = clinica.id;
  const [{ data: config }, primeira] = await Promise.all([
    db.from("fechamento_config").select("*").eq("clinica_id", clinicaId).maybeSingle(),
    db.from("fechamentos").select("id, clinica_id, tipo, inicio, fim, status, versao, indicadores, snapshot, concluido_em, enviado_em").eq("clinica_id", clinicaId).order("inicio", { ascending: false }).limit(200),
  ]);
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
        {cabecalho}
        <Link href={`/fechamentos/historico?cliente=${clinicaId}`} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"><History className="h-4 w-4" />Histórico deste cliente</Link>
      </div>
      <div className="rounded-lg border bg-card p-4"><SeletorCliente clientes={clientes} atual={clinicaId} /></div>
      {error && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm"><b>Não foi possível ler o banco de dados:</b> {error.message}</div>}
      <ComparativosView key={clinicaId} series={seriesComparativas(periodos, 24)} ano={anoCaixaCompetencia(periodos)} rotulos={rotulos} />
    </div>
  );
}
