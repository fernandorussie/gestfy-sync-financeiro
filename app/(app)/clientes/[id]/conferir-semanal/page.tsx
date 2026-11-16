export const revalidate = 0;
export const maxDuration = 60;

import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { coletarPreConsulta } from "@/lib/coletores/pre-consulta";
import { coletarNPS } from "@/lib/coletores/nps";
import { coletarLeads } from "@/lib/coletores/leads";
import { coletarFaturamento } from "@/lib/coletores/faturamento";
import { coletarFontesDoCliente } from "@/lib/fechamentos/servidor";
import { reportSemanalDaFonte, isoDe } from "@/lib/relatorio/fonte-unica";
import type { FonteDados } from "@/lib/supabase/types";

/**
 * Conferência da troca de fontes do Report Semanal: os números de uma semana
 * pela configuração antiga (tabela fontes_dados) e pela fonte única, lado a
 * lado. Serve para validar a mudança; não grava nada.
 */
const brl = (v: number | null | undefined) => (v == null ? "—" : `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const num = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR"));
const deISO = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

function semanaPassada(): { ini: string; fim: string } {
  const h = new Date();
  const dia = (h.getDay() + 6) % 7; // 0 = segunda
  const seg = new Date(h.getFullYear(), h.getMonth(), h.getDate() - dia - 7);
  const dom = new Date(seg.getFullYear(), seg.getMonth(), seg.getDate() + 6);
  return { ini: isoDe(seg), fim: isoDe(dom) };
}

async function talvez<T>(f: (() => Promise<T>) | null): Promise<{ v: T | null; erro: string | null }> {
  if (!f) return { v: null, erro: "não configurada" };
  try { return { v: await f(), erro: null }; } catch (e) { return { v: null, erro: e instanceof Error ? e.message : String(e) }; }
}

export default async function ConferirSemanal({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ini?: string; fim?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const padrao = semanaPassada();
  const ok = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const ini = ok(sp.ini) ? sp.ini! : padrao.ini;
  const fim = ok(sp.fim) ? sp.fim! : padrao.fim;
  const dIni = deISO(ini), dFim = deISO(fim), inicioMes = new Date(dFim.getFullYear(), dFim.getMonth(), 1);

  const db = getSupabaseAdmin();
  const [{ data: cliente }, { data: antigas }] = await Promise.all([
    db.from("clinicas").select("id, nome").eq("id", id).maybeSingle(),
    db.from("fontes_dados").select("*").eq("clinica_id", id),
  ]);
  if (!cliente) notFound();
  const a = (tipo: string) => ((antigas ?? []) as FonteDados[]).find((f) => f.tipo === tipo) ?? null;
  const fat = a("faturamento"), nps = a("nps"), leads = a("leads"), pre = a("pre_consulta");

  const [velhoFat, velhoAcum, velhoNps, velhoLeads, velhoPre, novo] = await Promise.all([
    talvez(fat ? () => coletarFaturamento(fat, dIni, dFim) : null),
    talvez(fat ? () => coletarFaturamento(fat, inicioMes, dFim) : null),
    talvez(nps ? () => coletarNPS(nps, dIni, dFim) : null),
    talvez(leads ? () => coletarLeads(leads, dIni, dFim) : null),
    talvez(pre ? () => coletarPreConsulta(pre, dIni, dFim) : null),
    talvez(async () => { const { coleta, regras } = await coletarFontesDoCliente(id, true); return { r: reportSemanalDaFonte(coleta.dados, regras, dIni, dFim), erros: coleta.erros }; }),
  ]);
  const n = novo.v?.r;

  const linhas: { rotulo: string; antes: string; agora: string }[] = [
    { rotulo: "Faturamento da semana", antes: velhoFat.erro ?? brl(velhoFat.v?.total_faturado), agora: n?.fatFiltro ? brl(n.fatFiltro.total_faturado) : novo.v?.erros.vendas ?? "não configurada" },
    { rotulo: "Lançamentos de faturamento na semana", antes: velhoFat.erro ?? num(velhoFat.v?.qtd_lancamentos), agora: n?.fatFiltro ? num(n.fatFiltro.qtd_lancamentos) : "—" },
    { rotulo: "Faturamento acumulado do mês", antes: velhoAcum.erro ?? brl(velhoAcum.v?.total_faturado), agora: n?.fatAcum ? brl(n.fatAcum.total_faturado) : "—" },
    { rotulo: "NPS: respostas", antes: velhoNps.erro ?? num(velhoNps.v?.total), agora: n?.nps ? num(n.nps.total) : novo.v?.erros.nps ?? "não configurada" },
    { rotulo: "NPS: nota", antes: velhoNps.erro ?? num(velhoNps.v?.nps_score), agora: n?.nps ? num(n.nps.nps_score) : "—" },
    { rotulo: "NPS: comentários", antes: velhoNps.erro ?? num(velhoNps.v?.comentarios.length), agora: n?.nps ? num(n.nps.comentarios.length) : "—" },
    { rotulo: "NPS: indicações", antes: velhoNps.erro ?? num(velhoNps.v?.indicacoes.length), agora: n?.nps ? num(n.nps.indicacoes.length) : "—" },
    { rotulo: "Leads", antes: velhoLeads.erro ?? num(velhoLeads.v?.total), agora: n?.leads ? num(n.leads.total) : novo.v?.erros.leads ?? "não configurada" },
    { rotulo: "Leads convertidos (agendados)", antes: velhoLeads.erro ?? num(velhoLeads.v?.convertidos), agora: n?.leads ? num(n.leads.convertidos) : "—" },
    { rotulo: "Pré-consulta: respostas", antes: velhoPre.erro ?? num(velhoPre.v?.total), agora: n?.pre ? num(n.pre.total) : novo.v?.erros.preConsulta ?? "não configurada" },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground"><Link href="/clientes" className="hover:underline">Clientes</Link> / <Link href={`/clientes/${id}?aba=fontes`} className="hover:underline">{cliente.nome}</Link> / Conferir Report Semanal</p>
        <h1 className="text-2xl font-semibold">Report Semanal: antes x agora</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">Os números de uma semana pela configuração antiga do Report Semanal e pela fonte única do cliente. Diferenças costumam vir de colunas diferentes (por exemplo, a coluna de conversão dos leads) ou de linhas que uma leitura aceita e a outra não. Nada é gravado.</p>
      </div>
      <form className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <label className="flex flex-col gap-1 text-sm font-medium">De<input type="date" name="ini" defaultValue={ini} className="h-9 rounded-md border border-input bg-background px-2 text-sm" /></label>
        <label className="flex flex-col gap-1 text-sm font-medium">Até<input type="date" name="fim" defaultValue={fim} className="h-9 rounded-md border border-input bg-background px-2 text-sm" /></label>
        <button className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Comparar</button>
      </form>
      {novo.erro && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm"><b>Fonte única:</b> {novo.erro}</div>}
      <section className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="px-4 py-2 font-medium">Número</th><th className="px-3 py-2 font-medium">Configuração antiga</th><th className="px-3 py-2 font-medium">Fonte única</th><th className="px-3 py-2"><span className="sr-only">Situação</span></th></tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const igual = l.antes === l.agora;
              return (
                <tr key={l.rotulo} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium">{l.rotulo}</td>
                  <td className="px-3 py-2 tabular-nums">{l.antes}</td>
                  <td className="px-3 py-2 tabular-nums">{l.agora}</td>
                  <td className="px-3 py-2 text-xs">{igual ? <span className="text-emerald-700 dark:text-emerald-400">igual</span> : <span className="font-medium text-amber-700 dark:text-amber-400">diferente</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
