import Link from "next/link";
import { FileDown, Settings2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { agruparPeriodos, concluido, evolucaoMensal, indicadoresDe, type LinhaFechamento, type PontoEvolucao } from "@/lib/fechamentos/historico";
import type { Acao } from "@/lib/fechamentos/texto-fechamento";
import { NovoFechamento } from "../../_components/novo-fechamento";
import { StatusFechamento } from "../../_components/status";
import { brl0, dataBR, mesAbrev, nomePeriodo, num, pct } from "../../_components/formato";

function Variacao({ atual, antes, custo }: { atual: number | null; antes: number | null | undefined; custo?: boolean }) {
  if (atual == null || !antes) return null;
  const v = atual / antes - 1;
  if (Math.abs(v) < 0.005) return <span className="block text-[11px] text-muted-foreground">0%</span>;
  const ruim = custo ? v > 0 : v < 0;
  return <span className={`block text-[11px] ${ruim ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>{v > 0 ? "+" : "−"}{pct(Math.abs(v))}</span>;
}

function Grafico({ pontos }: { pontos: PontoEvolucao[] }) {
  const ultimos = pontos.slice(-12);
  const max = Math.max(1, ...ultimos.map((p) => Math.max(p.faturamento ?? 0, p.meta ?? 0)));
  const W = 760, H = 170, B = 22, T = 20, passo = W / Math.max(1, ultimos.length);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Faturamento por mês, com a meta">
      {ultimos.map((p, n) => {
        const x = n * passo + passo * 0.18, w = passo * 0.64, v = p.faturamento ?? 0;
        return (
          <g key={p.mes}>
            {v > 0 && <rect x={x} y={y(v)} width={w} height={H - B - y(v)} rx={3} className={p.definitivo ? "fill-primary" : "fill-primary/35"}><title>{`${mesAbrev(p.mes)}/${p.mes.slice(2, 4)}: ${brl0(v)}${p.definitivo ? "" : " (em andamento)"}`}</title></rect>}
            {v > 0 && <text x={x + w / 2} y={Math.min(y(v), p.meta ? y(p.meta) : Infinity) - 6} textAnchor="middle" className="fill-muted-foreground text-[11px]">{Math.round(v / 1000)} mil</text>}
            {p.meta ? <line x1={x - 3} x2={x + w + 3} y1={y(p.meta)} y2={y(p.meta)} strokeWidth={2} strokeDasharray="4 3" className="stroke-accent"><title>{`Meta: ${brl0(p.meta)}`}</title></line> : null}
            <text x={x + w / 2} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[11px]">{mesAbrev(p.mes)}/{p.mes.slice(2, 4)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function HistoricoView({ clinica, linhas, configurada, erro }: { clinica: { id: string; nome: string }; linhas: LinhaFechamento[]; configurada: boolean; erro?: string }) {
  const periodos = agruparPeriodos(linhas);
  const evolucao = evolucaoMensal(periodos);
  const ultimoConcluido = periodos.find((p) => concluido(p.atual));
  const plano = ((ultimoConcluido?.atual.acoes ?? []) as Acao[]).filter((a) => a.titulo?.trim());

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground"><Link href="/fechamentos" className="hover:underline">Fechamentos</Link> / Histórico</p>
          <h1 className="text-2xl font-semibold">{clinica.nome}</h1>
        </div>
        <Link href={`/fechamentos/configurar/${clinica.id}`} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"><Settings2 className="h-4 w-4" />Planilhas</Link>
      </div>

      {erro && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm"><b>Não foi possível ler o banco de dados:</b> {erro}</div>}

      {configurada && <NovoFechamento clinicas={[{ id: clinica.id, nome: clinica.nome }]} />}

      {evolucao.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base">Evolução mês a mês</CardTitle>
            <span className="text-xs text-muted-foreground">
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-primary align-[-1px]" />Concluído
              <span className="ml-3 mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-primary/35 align-[-1px]" />Em andamento
              <span className="ml-3 mr-1 inline-block h-0 w-3 border-t-2 border-dashed border-accent align-middle" />Meta
            </span>
          </CardHeader>
          <CardContent className="space-y-4">
            <Grafico pontos={evolucao} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 font-medium">Mês</th>
                    <th className="py-2 text-right font-medium">Faturamento</th>
                    <th className="py-2 text-right font-medium">Despesas</th>
                    <th className="py-2 text-right font-medium">Resultado</th>
                    <th className="py-2 text-right font-medium">Meta</th>
                    <th className="py-2 text-right font-medium">Pacientes</th>
                    <th className="py-2 text-right font-medium">Ticket</th>
                    <th className="py-2 text-right font-medium">Novos</th>
                    <th className="py-2 text-right font-medium">Conv. leads</th>
                    <th className="py-2 text-right font-medium">Conv. orç.</th>
                    <th className="py-2 text-right font-medium">NPS</th>
                  </tr>
                </thead>
                <tbody>
                  {[...evolucao].reverse().map((p, n, lista) => {
                    const a = lista[n + 1];
                    return (
                      <tr key={p.mes} className={`border-b align-top last:border-0 ${p.definitivo ? "" : "text-muted-foreground"}`}>
                        <td className="py-2 pr-2">
                          <Link href={`/fechamentos/${p.id}`} className="font-medium capitalize text-foreground hover:underline">{mesAbrev(p.mes)}/{p.mes.slice(0, 4)}</Link>
                          {!p.definitivo && <span className="block text-[11px]">em andamento</span>}
                        </td>
                        <td className="py-2 text-right tabular-nums">{brl0(p.faturamento)}<Variacao atual={p.faturamento} antes={a?.faturamento} /></td>
                        <td className="py-2 text-right tabular-nums">{brl0(p.despesas)}<Variacao atual={p.despesas} antes={a?.despesas} custo /></td>
                        <td className={`py-2 text-right tabular-nums ${(p.resultado ?? 0) < 0 ? "text-red-600 dark:text-red-400" : ""}`}>{brl0(p.resultado)}</td>
                        <td className="py-2 text-right tabular-nums">{pct(p.atingimento, 0)}</td>
                        <td className="py-2 text-right tabular-nums">{num(p.pacientes)}<Variacao atual={p.pacientes} antes={a?.pacientes} /></td>
                        <td className="py-2 text-right tabular-nums">{brl0(p.ticket)}<Variacao atual={p.ticket} antes={a?.ticket} /></td>
                        <td className="py-2 text-right tabular-nums">{num(p.novos)}</td>
                        <td className="py-2 text-right tabular-nums">{pct(p.conversaoLeads, 0)}</td>
                        <td className="py-2 text-right tabular-nums">{pct(p.conversaoOrcamentos, 0)}</td>
                        <td className="py-2 text-right tabular-nums">{num(p.nps)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">Fechamentos mensais, versão mais recente de cada mês. Variação em relação ao mês anterior da lista. Meses em andamento podem mudar até a conclusão.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Todos os fechamentos</CardTitle></CardHeader>
          <CardContent className="p-0">
            {periodos.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">Nenhum fechamento desta clínica ainda.</p>
            ) : (
              <ul className="divide-y">
                {periodos.map((p) => {
                  const i = indicadoresDe(p.atual);
                  const quando = p.atual.status === "enviado" ? p.atual.enviado_em : p.atual.concluido_em;
                  return (
                    <li key={p.chave} className="space-y-2 px-6 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={`/fechamentos/${p.atual.id}`} className="font-medium hover:underline">
                              {p.tipo === "mensal" ? "Mensal" : "Quinzenal"} · {nomePeriodo(p.tipo, p.inicio, p.fim)}
                            </Link>
                            <StatusFechamento status={p.atual.status} />
                            {p.atual.versao > 1 && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">v{p.atual.versao}</span>}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Faturamento {brl0(i?.faturamento?.total)} · resultado de caixa {brl0(i?.caixa?.resultado)}
                            {quando ? ` · ${p.atual.status === "enviado" ? "enviado" : "concluído"} em ${dataBR(quando)}` : ""}
                          </p>
                        </div>
                        <a href={`/fechamentos-pdf/${p.atual.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted">
                          <FileDown className="h-3.5 w-3.5" />PDF
                        </a>
                      </div>
                      {p.anteriores.length > 0 && (
                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer select-none">{p.anteriores.length === 1 ? "1 versão anterior" : `${p.anteriores.length} versões anteriores`}</summary>
                          <ul className="mt-1.5 space-y-1 pl-4">
                            {p.anteriores.map((v) => {
                              const iv = indicadoresDe(v);
                              return (
                                <li key={v.id} className="flex flex-wrap items-center gap-2">
                                  <Link href={`/fechamentos/${v.id}`} className="font-medium text-foreground hover:underline">v{v.versao}</Link>
                                  <span>{v.concluido_em ? `concluída em ${dataBR(v.concluido_em)}` : "não concluída"} · faturamento {brl0(iv?.faturamento?.total)}</span>
                                  <a href={`/fechamentos-pdf/${v.id}`} target="_blank" rel="noopener noreferrer" className="underline">PDF</a>
                                </li>
                              );
                            })}
                          </ul>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Último plano de ação</CardTitle>
            {ultimoConcluido && <p className="text-xs text-muted-foreground">{ultimoConcluido.tipo === "mensal" ? "Mensal" : "Quinzenal"} · {nomePeriodo(ultimoConcluido.tipo, ultimoConcluido.inicio, ultimoConcluido.fim)}</p>}
          </CardHeader>
          <CardContent>
            {plano.length === 0 ? (
              <p className="text-sm text-muted-foreground">{ultimoConcluido ? "O último fechamento concluído não tem ações." : "Nenhum fechamento concluído ainda."}</p>
            ) : (
              <ol className="space-y-3">
                {plano.map((a, n) => (
                  <li key={a.id} className="grid grid-cols-[22px_1fr] gap-2 text-sm">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-secondary text-[11px] font-bold text-secondary-foreground">{n + 1}</span>
                    <div className="min-w-0">
                      <p className="font-medium leading-snug">{a.titulo}</p>
                      <p className="text-xs text-muted-foreground">{a.responsaveis?.join(" + ") || "sem responsável"}{a.prazo ? ` · até ${dataBR(a.prazo)}` : ""}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-4 text-xs text-muted-foreground">O andamento dessas ações é registrado no próximo fechamento, na aba Análise.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
