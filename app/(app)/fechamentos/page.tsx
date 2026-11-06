export const revalidate = 0;

import Link from "next/link";
import { Settings2 } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NovoFechamento } from "./_components/novo-fechamento";
import { StatusFechamento } from "./_components/status";
import { brl0, nomePeriodo } from "./_components/formato";

export default async function FechamentosPage() {
  const db = getSupabaseAdmin();
  const [{ data: clinicas }, { data: configs }, { data: fechamentos }] = await Promise.all([
    db.from("clinicas").select("id, nome").eq("ativa", true).order("nome"),
    db.from("fechamento_config").select("clinica_id, fontes"),
    db.from("fechamentos").select("id, clinica_id, tipo, inicio, fim, status, versao, indicadores, calculado_em").order("inicio", { ascending: false }).limit(40),
  ]);
  const configuradas = new Set((configs ?? []).filter((c) => Object.keys((c.fontes ?? {}) as object).length > 0).map((c) => c.clinica_id));
  const nomeClinica = new Map((clinicas ?? []).map((c) => [c.id, c.nome]));
  const lista = clinicas ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Reports financeiros</p>
        <h1 className="text-2xl font-semibold">Fechamentos</h1>
      </div>

      <NovoFechamento clinicas={lista.filter((c) => configuradas.has(c.id))} />

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Fechamentos abertos e concluídos</CardTitle></CardHeader>
        <CardContent className="p-0">
          {(fechamentos ?? []).length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">Nenhum fechamento ainda. Escolha a clínica e o mês acima para abrir o primeiro.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr><th className="px-6 py-2 font-medium">Clínica</th><th className="px-3 py-2 font-medium">Período</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 text-right font-medium">Faturamento</th><th className="px-6 py-2 text-right font-medium">Resultado de caixa</th></tr>
                </thead>
                <tbody>
                  {(fechamentos ?? []).map((f) => {
                    const ind = f.indicadores as { faturamento?: { total: number }; caixa?: { resultado: number } } | null;
                    return (
                      <tr key={f.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="px-6 py-3"><Link href={`/fechamentos/${f.id}`} className="font-medium hover:underline">{nomeClinica.get(f.clinica_id) ?? "—"}</Link></td>
                        <td className="px-3 py-3">{f.tipo === "mensal" ? "Mensal" : "Quinzenal"} · {nomePeriodo(f.tipo, f.inicio, f.fim)}{f.versao > 1 ? ` · v${f.versao}` : ""}</td>
                        <td className="px-3 py-3"><StatusFechamento status={f.status} /></td>
                        <td className="px-3 py-3 text-right tabular-nums">{brl0(ind?.faturamento?.total)}</td>
                        <td className="px-6 py-3 text-right tabular-nums">{brl0(ind?.caixa?.resultado)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Planilhas das clínicas</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">Cada clínica precisa ter as planilhas de vendas e despesas configuradas para abrir um fechamento.</p>
          <ul className="divide-y rounded-md border">
            {lista.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="font-medium">{c.nome}</span>
                <span className="flex items-center gap-3">
                  <span className={configuradas.has(c.id) ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>{configuradas.has(c.id) ? "Configurada" : "Sem planilhas"}</span>
                  <Link href={`/fechamentos/configurar/${c.id}`} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted"><Settings2 className="h-3.5 w-3.5" />Configurar</Link>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
