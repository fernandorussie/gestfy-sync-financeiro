export const revalidate = 0;

import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { migracoesPendentes } from "@/lib/fechamentos/banco";
import { situacaoCliente, type SituacaoCliente } from "@/lib/fechamentos/historico";
import { AvisoBanco } from "./_components/aviso-banco";
import { AbrirFechamento } from "./_components/abrir-fechamento";
import { StatusFechamento } from "./_components/status";
import { brl0 } from "./_components/formato";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function mesPadrao(): string {
  // Até o dia 20, o mês em fechamento é o anterior.
  const d = new Date();
  if (d.getDate() <= 20) d.setMonth(d.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function somarMes(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
const nomeMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`;
const ultimoDia = (mes: string) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10);

type Linha = { id: string; clinica_id: string; tipo: "mensal" | "quinzenal"; inicio: string; fim: string; status: "conferencia" | "analise" | "concluido" | "enviado"; versao: number; indicadores: unknown };

const SITUACAO: Record<SituacaoCliente, [string, string]> = {
  pronto: ["Pronto", "text-emerald-700 dark:text-emerald-400"],
  pendente: ["Fontes pendentes", "text-amber-700 dark:text-amber-400"],
  nao_configurado: ["Não configurado", "text-muted-foreground"],
};

function Celula({ f, clinicaId, tipo, mes, pode }: { f?: Linha; clinicaId: string; tipo: "mensal" | "quinzenal"; mes: string; pode: boolean }) {
  if (f) {
    const ind = f.indicadores as { faturamento?: { total: number }; caixa?: { resultado: number } } | null;
    const fim = f.status === "concluido" || f.status === "enviado";
    return (
      <Link href={`/fechamentos/${f.id}`} className="group flex flex-col gap-1 rounded-md p-1.5 hover:bg-muted">
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusFechamento status={f.status} />
          {f.versao > 1 && <span className="text-[11px] text-muted-foreground">v{f.versao}</span>}
          <span className="inline-flex items-center gap-0.5 text-xs font-medium text-primary group-hover:underline">{fim ? "Revisar" : "Continuar"}<ArrowRight className="h-3 w-3" /></span>
        </span>
        {ind?.faturamento && <span className="text-xs tabular-nums text-muted-foreground">{brl0(ind.faturamento.total)} · <span className={(ind.caixa?.resultado ?? 0) < 0 ? "text-red-600 dark:text-red-400" : ""}>res. {brl0(ind.caixa?.resultado)}</span></span>}
      </Link>
    );
  }
  return pode ? <AbrirFechamento clinicaId={clinicaId} tipo={tipo} mes={mes} rotulo="Iniciar" /> : <span className="text-xs text-muted-foreground">—</span>;
}

function Kpi({ rotulo, valor, nota }: { rotulo: string; valor: string; nota: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
      <p className="font-heading text-2xl font-semibold tabular-nums">{valor}</p>
      <p className="text-xs text-muted-foreground">{nota}</p>
    </div>
  );
}

/** Próximo quinzenal: o parcial de 1 a 15 sai a partir do dia 16. */
function proximoQuinzenal(hoje = new Date()): { data: Date; mes: string } {
  const d = new Date(hoje.getFullYear(), hoje.getMonth() + (hoje.getDate() > 16 ? 1 : 0), 16);
  return { data: d, mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` };
}

export default async function FechamentosPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes: mesParam } = await searchParams;
  const mes = mesParam && /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : mesPadrao();
  const db = getSupabaseAdmin();
  const [{ data: clinicas, error: e1 }, { data: configs, error: e2 }, { data: doMes, error: e3 }, pendentes] = await Promise.all([
    db.from("clinicas").select("id, nome").eq("ativa", true).order("nome"),
    db.from("fechamento_config").select("clinica_id, fontes"),
    db.from("fechamentos").select("id, clinica_id, tipo, inicio, fim, status, versao, indicadores").gte("inicio", `${mes}-01`).lte("inicio", ultimoDia(mes)).order("versao", { ascending: false }),
    migracoesPendentes(db),
  ]);
  const erroBanco = [e1, e2, e3].find(Boolean);
  const cfg = new Map((configs ?? []).map((c) => [c.clinica_id, c.fontes]));
  // Só a versão mais recente de cada cliente/tipo no mês.
  const atual = new Map<string, Linha>();
  for (const f of (doMes ?? []) as Linha[]) { const k = `${f.clinica_id}|${f.tipo}`; if (!atual.has(k)) atual.set(k, f); }
  const lista = (clinicas ?? []).map((c) => ({ ...c, situacao: situacaoCliente(cfg.get(c.id)) }));
  const mensais = [...atual.values()].filter((f) => f.tipo === "mensal");
  const resumo = {
    prontos: lista.filter((c) => c.situacao.situacao === "pronto").length,
    concluidos: mensais.filter((f) => f.status === "concluido" || f.status === "enviado").length,
    andamento: mensais.filter((f) => f.status === "conferencia" || f.status === "analise").length,
  };
  const faltam = Math.max(0, resumo.prontos - resumo.concluidos - resumo.andamento);
  const emAndamento = [...atual.values()].filter((f) => f.status === "conferencia" || f.status === "analise");
  const prox = proximoQuinzenal();
  const quinzenaisProx = prox.mes === mes ? [...atual.values()].filter((f) => f.tipo === "quinzenal").length : null;
  const naoProntos = lista.length - resumo.prontos;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Relatórios Financeiros</p>
          <h1 className="text-2xl font-semibold">Fechamentos do mês</h1>
        </div>
      </div>

      <AvisoBanco pendentes={pendentes} />
      {erroBanco && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <b>Não foi possível ler o banco de dados:</b> {erroBanco.message}
          <span className="block text-muted-foreground">Abra /api/fechamentos/diagnostico para ver a causa.</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Clientes com fechamento no período" valor={String(resumo.prontos)}
          nota={naoProntos ? `de ${lista.length} ativos · ${naoProntos} sem configuração` : `todos os ${lista.length} clientes ativos`} />
        <Kpi rotulo="Concluídos ou enviados" valor={`${resumo.concluidos} de ${resumo.prontos}`}
          nota={faltam ? `mensais de ${nomeMes(mes)} · ${faltam} por iniciar` : `mensais de ${nomeMes(mes)}`} />
        <Kpi rotulo="Em andamento" valor={String(emAndamento.length)}
          nota={emAndamento.length ? `${emAndamento.filter((f) => f.status === "conferencia").length} em conferência · ${emAndamento.filter((f) => f.status === "analise").length} em análise` : "nenhum em conferência ou análise"} />
        <Kpi rotulo="Próximo quinzenal" valor={prox.data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
          nota={`1ª quinzena de ${MESES[prox.data.getMonth()]}${quinzenaisProx !== null ? ` · ${quinzenaisProx} de ${resumo.prontos} abertos` : ""}`} />
      </div>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-1">
            <Link href={`/fechamentos?mes=${somarMes(mes, -1)}`} aria-label="Mês anterior" className="rounded-md p-1.5 hover:bg-muted"><ChevronLeft className="h-4 w-4" /></Link>
            <h2 className="min-w-40 text-center font-semibold capitalize">{nomeMes(mes)}</h2>
            <Link href={`/fechamentos?mes=${somarMes(mes, 1)}`} aria-label="Próximo mês" className="rounded-md p-1.5 hover:bg-muted"><ChevronRight className="h-4 w-4" /></Link>
          </div>
          <p className="text-sm text-muted-foreground">Clique num fechamento para continuar ou revisar.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Configuração</th>
                <th className="px-3 py-2 font-medium">Quinzenal (1–15)</th>
                <th className="px-3 py-2 font-medium">Mensal</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => {
                const [rotulo, cor] = SITUACAO[c.situacao.situacao];
                const pode = c.situacao.situacao === "pronto";
                return (
                  <tr key={c.id} className="border-b align-top last:border-0">
                    <td className="px-4 py-3"><Link href={`/fechamentos/historico?cliente=${c.id}`} className="font-medium hover:underline" title="Ver o histórico deste cliente">{c.nome}</Link></td>
                    <td className="px-3 py-3">
                      {pode ? <span className={`text-xs font-medium ${cor}`}>{rotulo}</span> : (
                        // Pendência de configuração: o status leva direto para as fontes do cliente.
                        <Link href={`/fechamentos/configurar/${c.id}?aba=fontes`} className={`text-xs font-medium underline-offset-2 hover:underline ${cor}`} title="Configurar as fontes deste cliente">
                          {rotulo}{c.situacao.situacao === "pendente" ? `: falta ${c.situacao.faltando.join(" e ")}` : ""} →
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-2"><Celula f={atual.get(`${c.id}|quinzenal`)} clinicaId={c.id} tipo="quinzenal" mes={mes} pode={pode} /></td>
                    <td className="px-3 py-2"><Celula f={atual.get(`${c.id}|mensal`)} clinicaId={c.id} tipo="mensal" mes={mes} pode={pode} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {lista.length === 0 && <p className="p-6 text-sm text-muted-foreground">Nenhum cliente ativo no cadastro do GestfySync.</p>}
      </section>
      <p className="text-xs text-muted-foreground">Os clientes vêm do cadastro do GestfySync. Fontes, estrutura do relatório e perfil ficam em <Link href="/fechamentos/clientes" className="underline">Clientes e configurações</Link>.</p>
    </div>
  );
}
