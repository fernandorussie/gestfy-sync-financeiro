export const revalidate = 0;

import Link from "next/link";
import { FileDown } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { StatusFechamento } from "../_components/status";
import { brl0, dataBR, nomePeriodo } from "../_components/formato";

type Linha = { id: string; clinica_id: string; tipo: "mensal" | "quinzenal"; inicio: string; fim: string; status: "conferencia" | "analise" | "concluido" | "enviado"; versao: number; indicadores: unknown; atualizado_em: string };

const STATUS = [["", "Todos"], ["andamento", "Em andamento"], ["concluido", "Concluídos"], ["enviado", "Enviados"]] as const;

/** Histórico geral: todos os fechamentos de todos os clientes, com filtros. Cada linha abre o fechamento. */
export default async function HistoricoGeralPage({ searchParams }: { searchParams: Promise<{ cliente?: string; tipo?: string; status?: string; ano?: string }> }) {
  const sp = await searchParams;
  const db = getSupabaseAdmin();
  let q = db.from("fechamentos").select("id, clinica_id, tipo, inicio, fim, status, versao, indicadores, atualizado_em").order("inicio", { ascending: false }).order("versao", { ascending: false }).limit(400);
  if (sp.cliente) q = q.eq("clinica_id", sp.cliente);
  if (sp.tipo === "mensal" || sp.tipo === "quinzenal") q = q.eq("tipo", sp.tipo);
  if (sp.status === "andamento") q = q.in("status", ["conferencia", "analise"]);
  else if (sp.status === "concluido" || sp.status === "enviado") q = q.eq("status", sp.status);
  if (sp.ano && /^\d{4}$/.test(sp.ano)) q = q.gte("inicio", `${sp.ano}-01-01`).lte("inicio", `${sp.ano}-12-31`);
  const [{ data: clinicas }, { data, error }] = await Promise.all([db.from("clinicas").select("id, nome").order("nome"), q]);
  const nome = new Map((clinicas ?? []).map((c) => [c.id, c.nome]));

  // Versão mais nova de cada período; as anteriores viram contagem.
  const vistos = new Map<string, { linha: Linha; outras: number }>();
  for (const l of (data ?? []) as Linha[]) {
    const k = `${l.clinica_id}|${l.tipo}|${l.inicio}|${l.fim}`;
    const v = vistos.get(k);
    if (v) v.outras++; else vistos.set(k, { linha: l, outras: 0 });
  }
  const linhas = [...vistos.values()];
  const anoAtual = new Date().getFullYear();
  const campo = "h-9 rounded-md border border-input bg-background px-3 text-sm";

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground"><Link href="/fechamentos" className="hover:underline">Fechamentos</Link> / Histórico geral</p>
        <h1 className="text-2xl font-semibold">Histórico geral</h1>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4" method="get">
        <label className="flex flex-col gap-1.5 text-sm font-medium">Cliente
          <select name="cliente" defaultValue={sp.cliente ?? ""} className={`${campo} min-w-56`}>
            <option value="">Todos</option>
            {(clinicas ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">Tipo
          <select name="tipo" defaultValue={sp.tipo ?? ""} className={campo}><option value="">Todos</option><option value="mensal">Mensal</option><option value="quinzenal">Quinzenal</option></select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">Situação
          <select name="status" defaultValue={sp.status ?? ""} className={campo}>{STATUS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">Ano
          <select name="ano" defaultValue={sp.ano ?? ""} className={campo}><option value="">Todos</option>{[0, 1, 2].map((d) => <option key={d} value={anoAtual - d}>{anoAtual - d}</option>)}</select>
        </label>
        <button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Filtrar</button>
        {(sp.cliente || sp.tipo || sp.status || sp.ano) && <Link href="/fechamentos/historico" className="h-9 px-2 text-sm leading-9 text-muted-foreground hover:underline">Limpar</Link>}
      </form>

      {error && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm"><b>Não foi possível ler o banco de dados:</b> {error.message}</div>}

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-2 font-medium">Cliente</th><th className="px-3 py-2 font-medium">Período</th><th className="px-3 py-2 font-medium">Situação</th><th className="px-3 py-2 text-right font-medium">Faturamento</th><th className="px-3 py-2 text-right font-medium">Resultado</th><th className="px-3 py-2 font-medium">Atualizado</th><th className="px-4 py-2" /></tr>
            </thead>
            <tbody>
              {linhas.map(({ linha: f, outras }) => {
                const ind = f.indicadores as { faturamento?: { total: number }; caixa?: { resultado: number } } | null;
                return (
                  <tr key={f.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-2.5"><Link href={`/fechamentos/clinica/${f.clinica_id}`} className="hover:underline">{nome.get(f.clinica_id) ?? "—"}</Link></td>
                    <td className="px-3 py-2.5"><Link href={`/fechamentos/${f.id}`} className="font-medium hover:underline">{f.tipo === "mensal" ? "Mensal" : "Quinzenal"} · {nomePeriodo(f.tipo, f.inicio, f.fim)}</Link></td>
                    <td className="px-3 py-2.5"><span className="flex flex-wrap items-center gap-1.5"><StatusFechamento status={f.status} />{f.versao > 1 && <span className="text-xs text-muted-foreground">v{f.versao}{outras ? ` · ${outras} anterior${outras > 1 ? "es" : ""}` : ""}</span>}</span></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{brl0(ind?.faturamento?.total)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${(ind?.caixa?.resultado ?? 0) < 0 ? "text-red-600 dark:text-red-400" : ""}`}>{brl0(ind?.caixa?.resultado)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{dataBR(f.atualizado_em)}</td>
                    <td className="px-4 py-2.5 text-right"><a href={`/fechamentos-pdf/${f.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted"><FileDown className="h-3.5 w-3.5" />PDF</a></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {linhas.length === 0 && <p className="p-6 text-sm text-muted-foreground">Nenhum fechamento com esses filtros.</p>}
      </section>
      <p className="text-xs text-muted-foreground">Mostra a versão mais recente de cada período. As versões anteriores ficam no histórico do cliente.</p>
    </div>
  );
}
