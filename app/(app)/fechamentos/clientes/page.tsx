export const revalidate = 0;

import Link from "next/link";
import { ArrowRight, CircleCheck, CircleDashed, CircleAlert } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { migracoesPendentes } from "@/lib/fechamentos/banco";
import { situacaoCliente, type SituacaoCliente } from "@/lib/fechamentos/historico";
import { fichaPreenchida, limparFicha, type FichaClinica } from "@/lib/fechamentos/ficha";
import { SEGMENTOS } from "@/lib/fechamentos/vocabulario";
import { AvisoBanco } from "../_components/aviso-banco";
import { dataBR } from "../_components/formato";

const PADRAO = ["vendas", "despesas", "entradas", "orcamentos", "leads", "nps"] as const;

const SITUACAO: Record<SituacaoCliente, { rotulo: string; cor: string; Icone: typeof CircleCheck }> = {
  pronto: { rotulo: "Pronto para fechar", cor: "text-emerald-700 dark:text-emerald-400", Icone: CircleCheck },
  pendente: { rotulo: "Fontes pendentes", cor: "text-amber-700 dark:text-amber-400", Icone: CircleAlert },
  nao_configurado: { rotulo: "Não configurado", cor: "text-muted-foreground", Icone: CircleDashed },
};

type Config = { clinica_id: string; fontes: unknown; fontes_extras?: unknown; ficha?: unknown; relatorio?: unknown };

interface LinhaCliente {
  id: string; nome: string; ativa: boolean;
  situacao: ReturnType<typeof situacaoCliente>;
  padrao: number; extras: number; ficha: FichaClinica; perfil: boolean; segmento: string; estrutura: boolean;
}

function Tabela({ itens }: { itens: LinhaCliente[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">Cliente</th>
            <th className="px-3 py-2 font-medium">Situação</th>
            <th className="px-3 py-2 font-medium">Fontes de dados</th>
            <th className="px-3 py-2 font-medium">Perfil</th>
            <th className="px-3 py-2 font-medium">Relatório</th>
            <th className="px-4 py-2"><span className="sr-only">Abrir</span></th>
          </tr>
        </thead>
        <tbody>
          {itens.map((c) => {
            const s = SITUACAO[c.situacao.situacao];
            return (
              <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="px-4 py-3"><Link href={`/fechamentos/configurar/${c.id}`} className="font-medium hover:underline">{c.nome}</Link></td>
                <td className="px-3 py-3">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.cor}`}><s.Icone className="h-3.5 w-3.5" />{s.rotulo}</span>
                  {c.situacao.situacao === "pendente" && <span className="block text-xs text-muted-foreground">falta {c.situacao.faltando.join(" e ")}</span>}
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">
                  <span className="block"><b className="font-medium text-foreground">{c.padrao}</b> de {PADRAO.length} padrão</span>
                  <span className="block">{c.extras ? `${c.extras} personalizada${c.extras > 1 ? "s" : ""}` : "nenhuma personalizada"}</span>
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">
                  {c.perfil ? <span className="block text-foreground">{c.segmento || "Preenchido"}</span> : <span className="block">Não preenchido</span>}
                  {c.ficha.atualizadoEm && <span className="block">atualizado em {dataBR(c.ficha.atualizadoEm)}</span>}
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">{c.estrutura ? "Personalizado" : "Padrão Gestfy"}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/fechamentos/configurar/${c.id}`} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted">Configurar<ArrowRight className="h-3.5 w-3.5" /></Link>
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
 * Clientes e configurações: todos os clientes do cadastro do GestfySync, com a
 * situação das fontes, do perfil e da estrutura. Cada linha abre a configuração
 * em abas (Fontes de dados / Estrutura do relatório / Perfil do cliente).
 */
export default async function ClientesPage() {
  const db = getSupabaseAdmin();
  const [{ data: clinicas, error }, { data: configs }, pendentes] = await Promise.all([
    db.from("clinicas").select("id, nome, ativa").order("nome"),
    db.from("fechamento_config").select("*"),
    migracoesPendentes(db),
  ]);
  const cfg = new Map(((configs ?? []) as unknown as Config[]).map((c) => [c.clinica_id, c]));
  const lista: LinhaCliente[] = (clinicas ?? []).map((c) => {
    const k = cfg.get(c.id);
    const fontes = (k?.fontes ?? {}) as Record<string, { sheetId?: string } | undefined>;
    const ficha = limparFicha((k?.ficha ?? {}) as Partial<FichaClinica>);
    const extras = Array.isArray(k?.fontes_extras) ? k!.fontes_extras.length : 0;
    return {
      ...c,
      situacao: situacaoCliente(k?.fontes),
      padrao: PADRAO.filter((p) => fontes[p]?.sheetId).length,
      extras,
      ficha,
      perfil: fichaPreenchida(ficha) || !!ficha.segmentoTipo,
      segmento: SEGMENTOS.find((s) => s.id === ficha.segmentoTipo)?.rotulo ?? "",
      estrutura: !!k?.relatorio && Object.keys(k.relatorio as object).length > 0,
    };
  });
  const ativos = lista.filter((c) => c.ativa);
  const inativos = lista.filter((c) => !c.ativa);
  const contagem = (s: SituacaoCliente) => ativos.filter((c) => c.situacao.situacao === s).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Relatórios Financeiros</p>
        <h1 className="text-2xl font-semibold">Clientes e configurações</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">Fontes de dados, estrutura do relatório e perfil de cada cliente. É configurado uma vez e vale para todos os fechamentos.</p>
      </div>
      <AvisoBanco pendentes={pendentes} />
      {error && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm"><b>Não foi possível ler o banco de dados:</b> {error.message}</div>}

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <span><b className="text-foreground">{contagem("pronto")}</b> prontos</span>
        <span><b className="text-foreground">{contagem("pendente")}</b> com fontes pendentes</span>
        <span><b className="text-foreground">{contagem("nao_configurado")}</b> não configurados</span>
      </div>

      <section className="overflow-hidden rounded-lg border bg-card"><Tabela itens={ativos} /></section>
      {ativos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum cliente ativo no cadastro do GestfySync.</p>}

      {inativos.length > 0 && (
        <details className="rounded-lg border bg-card">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Clientes inativos ({inativos.length})</summary>
          <div className="border-t"><Tabela itens={inativos} /></div>
        </details>
      )}
      <p className="text-xs text-muted-foreground">Novos clientes são cadastrados em <Link href="/clinicas" className="underline">Clínicas</Link>, no cadastro do GestfySync, e aparecem aqui automaticamente.</p>
    </div>
  );
}
