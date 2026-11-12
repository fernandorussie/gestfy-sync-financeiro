export const revalidate = 0;

import Link from "next/link";
import { FileDown, LineChart, MoreHorizontal } from "lucide-react";
import { LinhaClicavel } from "./linha-clicavel";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { StatusFechamento } from "../_components/status";
import { brl0, dataBR, nomePeriodo } from "../_components/formato";

type Linha = {
  id: string; clinica_id: string; tipo: "mensal" | "quinzenal"; inicio: string; fim: string;
  status: "conferencia" | "analise" | "concluido" | "enviado"; versao: number; indicadores: unknown; atualizado_em: string;
};

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeMesAno = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}`;

const STATUS = [["", "Todas"], ["andamento", "Em andamento"], ["concluido", "Concluídos"], ["enviado", "Enviados"]] as const;

/**
 * Histórico: consulta dos fechamentos salvos, com filtros. Não cria fechamento
 * (isso fica no painel do mês). Cada linha abre o fechamento inteiro ou vai
 * direto para indicadores, análise (texto e plano), entrega ou PDF.
 */
export default async function HistoricoPage({ searchParams }: { searchParams: Promise<{ cliente?: string; tipo?: string; status?: string; ano?: string; mes?: string; versoes?: string }> }) {
  const sp = await searchParams;
  const versoes = sp.versoes === "1";
  const db = getSupabaseAdmin();
  let q = db.from("fechamentos").select("id, clinica_id, tipo, inicio, fim, status, versao, indicadores, atualizado_em")
    .order("inicio", { ascending: false }).order("versao", { ascending: false }).limit(500);
  if (sp.cliente) q = q.eq("clinica_id", sp.cliente);
  if (sp.tipo === "mensal" || sp.tipo === "quinzenal") q = q.eq("tipo", sp.tipo);
  if (sp.status === "andamento") q = q.in("status", ["conferencia", "analise"]);
  else if (sp.status === "concluido" || sp.status === "enviado") q = q.eq("status", sp.status);
  if (sp.mes && /^\d{4}-\d{2}$/.test(sp.mes)) {
    const fim = new Date(Date.UTC(Number(sp.mes.slice(0, 4)), Number(sp.mes.slice(5, 7)), 0)).toISOString().slice(0, 10);
    q = q.gte("inicio", `${sp.mes}-01`).lte("inicio", fim);
  } else if (sp.ano && /^\d{4}$/.test(sp.ano)) q = q.gte("inicio", `${sp.ano}-01-01`).lte("inicio", `${sp.ano}-12-31`);
  const [{ data: clinicas }, { data, error }] = await Promise.all([db.from("clinicas").select("id, nome").order("nome"), q]);
  const nome = new Map((clinicas ?? []).map((c) => [c.id, c.nome]));

  // Por padrão, só a versão mais nova de cada período; as anteriores viram contagem (ou aparecem, com "versões anteriores").
  const grupos = new Map<string, Linha[]>();
  for (const l of (data ?? []) as Linha[]) {
    const k = `${l.clinica_id}|${l.tipo}|${l.inicio}|${l.fim}`;
    grupos.set(k, [...(grupos.get(k) ?? []), l]);
  }
  const linhas = [...grupos.values()].flatMap((g) => (versoes ? g.map((l, n) => ({ linha: l, outras: 0, antiga: n > 0 })) : [{ linha: g[0], outras: g.length - 1, antiga: false }]));
  const anoAtual = new Date().getFullYear();
  // Competências dos últimos 24 meses (o campo de mês do navegador aparece como "--------- ----" quando vazio).
  const hoje = new Date();
  const mesesRecentes = Array.from({ length: 24 }, (_, k) => { const d = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth() - k, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; });
  const campo = "h-9 rounded-md border border-input bg-background px-3 text-sm";
  const filtrado = !!(sp.cliente || sp.tipo || sp.status || sp.ano || sp.mes || versoes);
  const clienteNome = sp.cliente ? nome.get(sp.cliente) : undefined;
  const link = (id: string, etapa: string, rotulo: string) => <Link href={`/fechamentos/${id}?etapa=${etapa}`} className="block rounded px-3 py-1.5 text-sm hover:bg-muted">{rotulo}</Link>;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Relatórios Financeiros</p>
          <h1 className="text-2xl font-semibold">Histórico{clienteNome ? ` · ${clienteNome}` : ""}</h1>
          <p className="text-sm text-muted-foreground">Fechamentos salvos, com indicadores, decisões da conferência, análise, plano de ação, texto e PDF.</p>
        </div>
        {sp.cliente && <Link href={`/fechamentos/comparativos?cliente=${sp.cliente}`} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"><LineChart className="h-4 w-4" />Comparativos deste cliente</Link>}
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4" method="get">
        <label className="flex flex-col gap-1.5 text-sm font-medium">Cliente
          <select name="cliente" defaultValue={sp.cliente ?? ""} className={`${campo} min-w-52`}>
            <option value="">Todos</option>
            {(clinicas ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">Competência
          <select name="mes" defaultValue={sp.mes ?? ""} className={campo}>
            <option value="">Todas</option>
            {mesesRecentes.map((m) => <option key={m} value={m}>{nomeMesAno(m)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">Ano
          <select name="ano" defaultValue={sp.ano ?? ""} className={campo}><option value="">Todos</option>{[0, 1, 2].map((d) => <option key={d} value={anoAtual - d}>{anoAtual - d}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">Tipo
          <select name="tipo" defaultValue={sp.tipo ?? ""} className={campo}><option value="">Todos</option><option value="mensal">Mensal</option><option value="quinzenal">Quinzenal</option></select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">Situação
          <select name="status" defaultValue={sp.status ?? ""} className={campo}>{STATUS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select>
        </label>
        <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" name="versoes" value="1" defaultChecked={versoes} />Versões anteriores</label>
        <button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Filtrar</button>
        {filtrado && <Link href="/fechamentos/historico" className="h-9 px-2 text-sm leading-9 text-muted-foreground hover:underline">Limpar</Link>}
      </form>

      {error && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm"><b>Não foi possível ler o banco de dados:</b> {error.message}</div>}

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Cliente</th><th className="px-3 py-2 font-medium">Competência</th><th className="px-3 py-2 font-medium">Situação</th>
                <th className="px-3 py-2 text-right font-medium">Faturamento</th><th className="px-3 py-2 text-right font-medium">Resultado</th>
                <th className="px-3 py-2 font-medium">Atualizado</th><th className="px-4 py-2 font-medium"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ linha: f, outras, antiga }) => {
                const ind = f.indicadores as { faturamento?: { total: number }; caixa?: { resultado: number } } | null;
                return (
                  <LinhaClicavel key={f.id} href={`/fechamentos/${f.id}`} className={`border-b align-top last:border-0 hover:bg-muted/50 ${antiga ? "text-muted-foreground" : ""}`}>
                    <td className="px-4 py-2.5"><Link href={`/fechamentos/historico?cliente=${f.clinica_id}`} className="hover:underline">{nome.get(f.clinica_id) ?? "—"}</Link></td>
                    <td className="px-3 py-2.5"><Link href={`/fechamentos/${f.id}`} className="font-medium hover:underline">{f.tipo === "mensal" ? "Mensal" : "Quinzenal"} · {nomePeriodo(f.tipo, f.inicio, f.fim)}</Link></td>
                    <td className="px-3 py-2.5">
                      <span className="flex flex-wrap items-center gap-1.5"><StatusFechamento status={f.status} />
                        {(f.versao > 1 || antiga) && <span className="text-xs text-muted-foreground">v{f.versao}{antiga ? " · anterior" : outras ? ` · ${outras} anterior${outras > 1 ? "es" : ""}` : ""}</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{brl0(ind?.faturamento?.total)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${(ind?.caixa?.resultado ?? 0) < 0 ? "text-red-600 dark:text-red-400" : ""}`}>{brl0(ind?.caixa?.resultado)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{dataBR(f.atualizado_em)}</td>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-1">
                        <a href={`/fechamentos-pdf/${f.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted"><FileDown className="h-3.5 w-3.5" />PDF</a>
                        <details className="relative">
                          <summary className="flex cursor-pointer list-none items-center rounded-md border p-1 hover:bg-muted [&::-webkit-details-marker]:hidden" aria-label="Abrir uma etapa"><MoreHorizontal className="h-4 w-4" /></summary>
                          <div className="absolute right-0 z-20 mt-1 w-40 rounded-md border bg-popover py-1 shadow-md">
                            {link(f.id, "conferencia", "Conferência")}{link(f.id, "indicadores", "Indicadores")}{link(f.id, "analise", "Análise")}{link(f.id, "entrega", "Texto e entrega")}
                          </div>
                        </details>
                      </span>
                    </td>
                  </LinhaClicavel>
                );
              })}
            </tbody>
          </table>
        </div>
        {linhas.length === 0 && <p className="p-6 text-sm text-muted-foreground">Nenhum fechamento com esses filtros. Novos fechamentos são iniciados em <Link href="/fechamentos" className="underline">Fechamentos do mês</Link>.</p>}
      </section>
      <p className="text-xs text-muted-foreground">Fechamentos concluídos abrem como foram entregues (números, texto e PDF congelados). Para mudar algo, use “Reabrir” dentro do fechamento: o app cria uma nova versão e mantém a anterior aqui.</p>
    </div>
  );
}
