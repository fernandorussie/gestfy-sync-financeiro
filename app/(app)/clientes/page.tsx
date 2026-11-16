export const revalidate = 0;

import Link from "next/link";
import { ArrowRight, CircleCheck, CircleDashed, CircleAlert } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { migracoesPendentes } from "@/lib/fechamentos/banco";
import { situacaoCliente, type SituacaoCliente } from "@/lib/fechamentos/historico";
import { fichaPreenchida, limparFicha, type FichaClinica } from "@/lib/fechamentos/ficha";
import { SEGMENTOS } from "@/lib/fechamentos/vocabulario";
import { AvisoBanco } from "../fechamentos/_components/aviso-banco";
import { NovoCliente } from "./_components/cadastro-form";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const SITUACAO: Record<SituacaoCliente, { rotulo: string; cor: string; Icone: typeof CircleCheck }> = {
  pronto: { rotulo: "Pronto", cor: "text-emerald-700 dark:text-emerald-400", Icone: CircleCheck },
  pendente: { rotulo: "Fontes pendentes", cor: "text-amber-700 dark:text-amber-400", Icone: CircleAlert },
  nao_configurado: { rotulo: "Não configurado", cor: "text-muted-foreground", Icone: CircleDashed },
};

type Config = { clinica_id: string; fontes: unknown; fontes_extras?: unknown; ficha?: unknown };

interface LinhaCliente {
  id: string; nome: string; ativa: boolean;
  financeiro: ReturnType<typeof situacaoCliente>;
  planilhas: number; metas: number; perfil: string | null;
}

function Tabela({ itens, mes }: { itens: LinhaCliente[]; mes: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">Cliente</th>
            <th className="px-3 py-2 font-medium">Metas de {mes}</th>
            <th className="px-3 py-2 font-medium">Fontes de dados</th>
            <th className="px-3 py-2 font-medium">Relatórios</th>
            <th className="px-3 py-2 font-medium">Perfil</th>
            <th className="px-4 py-2"><span className="sr-only">Abrir</span></th>
          </tr>
        </thead>
        <tbody>
          {itens.map((c) => {
            const s = SITUACAO[c.financeiro.situacao];
            return (
              <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="px-4 py-3"><Link href={`/clientes/${c.id}`} className="font-medium hover:underline">{c.nome}</Link></td>
                <td className="px-3 py-3 text-xs">{c.metas ? <span>{c.metas} cadastrada{c.metas > 1 ? "s" : ""}</span> : <Link href={`/clientes/${c.id}?aba=metas`} className="text-amber-700 hover:underline dark:text-amber-400">sem metas</Link>}</td>
                <td className="px-3 py-3 text-xs">{c.planilhas ? <span>{c.planilhas} planilha{c.planilhas > 1 ? "s" : ""}</span> : <span className="text-muted-foreground">nenhuma</span>}</td>
                <td className="px-3 py-3">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.cor}`}><s.Icone className="h-3.5 w-3.5" />{s.rotulo}</span>
                  {c.financeiro.situacao === "pendente" && <span className="block text-xs text-muted-foreground">falta {c.financeiro.faltando.join(" e ")}</span>}
                </td>
                <td className="px-3 py-3 text-xs">{c.perfil ? <span>{c.perfil}</span> : <span className="text-muted-foreground">não preenchido</span>}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/clientes/${c.id}`} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted">Abrir<ArrowRight className="h-3.5 w-3.5" /></Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Clientes: o cadastro único do GestfySync. Cada cliente abre em abas (Dados
 * gerais, Metas, Fontes de dados, Estrutura dos relatórios, Alvos &
 * Premiações). Substitui as telas Clínicas e Clientes e configurações.
 */
export default async function ClientesPage() {
  const hoje = new Date();
  const mes = hoje.getMonth() + 1, ano = hoje.getFullYear();
  const db = getSupabaseAdmin();
  const [{ data: clientes, error }, { data: configs }, { data: metas }, pendentes] = await Promise.all([
    db.from("clinicas").select("id, nome, ativa").order("nome"),
    db.from("fechamento_config").select("clinica_id, fontes, fontes_extras, ficha"),
    db.from("metas").select("clinica_id").eq("mes", mes).eq("ano", ano),
    migracoesPendentes(db),
  ]);
  const cfg = new Map(((configs ?? []) as unknown as Config[]).map((c) => [c.clinica_id, c]));
  const conta = (xs: { clinica_id: string }[] | null) => { const m = new Map<string, number>(); for (const x of xs ?? []) m.set(x.clinica_id, (m.get(x.clinica_id) ?? 0) + 1); return m; };
  const nMetas = conta(metas);
  const lista: LinhaCliente[] = (clientes ?? []).map((c) => {
    const k = cfg.get(c.id);
    const ficha = limparFicha((k?.ficha ?? {}) as Partial<FichaClinica>);
    const segmento = SEGMENTOS.find((s) => s.id === ficha.segmentoTipo)?.rotulo ?? "";
    return {
      ...c,
      financeiro: situacaoCliente(k?.fontes),
      planilhas: Object.values((k?.fontes ?? {}) as Record<string, { sheetId?: string } | undefined>).filter((x) => x?.sheetId).length + (Array.isArray(k?.fontes_extras) ? k!.fontes_extras.length : 0),
      metas: nMetas.get(c.id) ?? 0,
      perfil: fichaPreenchida(ficha) || ficha.segmentoTipo ? (segmento || "Preenchido") : null,
    };
  });
  const ativos = lista.filter((c) => c.ativa);
  const inativos = lista.filter((c) => !c.ativa);
  const nomeMes = MESES[mes - 1];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">O cadastro único de cada cliente: dados gerais, metas, fontes de dados e estrutura dos relatórios. Vale para o Report Semanal, o Checkpoint e os fechamentos.</p>
        </div>
        <NovoCliente />
      </div>
      <AvisoBanco pendentes={pendentes} />
      {error && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm"><b>Não foi possível ler o banco de dados:</b> {error.message}</div>}

      <p className="text-sm text-muted-foreground"><b className="text-foreground">{ativos.length}</b> clientes ativos{inativos.length ? ` · ${inativos.length} inativo${inativos.length > 1 ? "s" : ""}` : ""}</p>
      <section className="overflow-hidden rounded-lg border bg-card"><Tabela itens={ativos} mes={nomeMes} /></section>
      {ativos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum cliente ativo. Clique em “Novo cliente” para começar.</p>}

      {inativos.length > 0 && (
        <details className="rounded-lg border bg-card">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Clientes inativos ({inativos.length})</summary>
          <div className="border-t"><Tabela itens={inativos} mes={nomeMes} /></div>
        </details>
      )}
    </div>
  );
}
