"use client";

import { Fragment, useState, type ReactNode } from "react";
import { mesesComDados, regimesAnuais, rotuloResultado, type GrupoDespesa, type Indicadores, type ItemContagem, type ItemValor, type LinhaRegime } from "@/lib/fechamentos/indicadores";
import type { ResultadoFechamento } from "@/lib/fechamentos/servidor";
import { cap } from "@/lib/fechamentos/vocabulario";
import { brl, brl0, mesAbrev, num, pct } from "../../_components/formato";
import { defSecao } from "@/lib/fechamentos/estrutura";
import { formatarIndicador, variacaoIndicador } from "@/lib/fechamentos/formato-indicador";

function ondeAparece(secao: string, r: ResultadoFechamento): string {
  if (secao === "fonte") return "seção da própria fonte";
  if (secao.startsWith("sec:")) return r.secoes.find((x) => `sec:${x.id}` === secao)?.titulo ?? "seção removida (vai para o resultado)";
  return defSecao(secao)?.titulo ?? secao;
}

function Variacao({ atual, anterior, inverso, rotulo }: { atual?: number | null; anterior?: number | null; inverso?: boolean; rotulo: string }) {
  if (atual == null || !anterior) return <span className="text-muted-foreground">sem {rotulo}</span>;
  const v = atual / anterior - 1;
  const bom = inverso ? v < 0 : v > 0;
  const cor = Math.abs(v) < 0.005 ? "text-muted-foreground" : bom ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  return <span><b className={cor}>{v > 0 ? "+" : ""}{pct(v)}</b> vs {rotulo}</span>;
}

function Kpi({ rotulo, valor, children, destaque }: { rotulo: string; valor: string; children?: ReactNode; destaque?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 rounded-lg border p-4 ${destaque ? "border-primary/50" : ""}`}>
      <span className="text-xs font-medium text-muted-foreground">{rotulo}</span>
      <span className="font-heading text-2xl font-semibold tabular-nums leading-tight">{valor}</span>
      <span className="text-xs text-muted-foreground">{children}</span>
    </div>
  );
}

function Secao({ titulo, children, extra, id }: { titulo: string; children: ReactNode; extra?: ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-16 overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"><h2 className="text-sm font-semibold">{titulo}</h2>{extra}</div>
      <div className="p-4">{children}</div>
    </section>
  );
}

const NI = "Não informado";
/** "Não informado" sempre por último (e em cinza), para não disputar com as informações reais. */
const porUltimo = <T extends { nome: string }>(xs: T[]) => [...xs.filter((x) => x.nome !== NI), ...xs.filter((x) => x.nome === NI)];

function Barras({ itens, formato, max }: { itens: { nome: string; v: number; extra?: string }[]; formato: (v: number) => string; max?: number }) {
  const m = max ?? Math.max(1, ...itens.map((i) => i.v));
  return (
    <table className="w-full text-sm">
      <tbody>
        {porUltimo(itens).map((i) => (
          <tr key={i.nome} className={`border-b last:border-0 ${i.nome === NI ? "text-muted-foreground" : ""}`}>
            <td className="py-1.5 pr-2">{i.nome}</td>
            <td className="w-[30%] py-1.5"><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(1.5, (i.v / m) * 100)}%` }} /></div></td>
            <td className="whitespace-nowrap py-1.5 pl-2 text-right tabular-nums">{formato(i.v)}{i.extra ? <span className="text-muted-foreground"> {i.extra}</span> : null}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const valores = (xs: ItemValor[], n = 99) => porUltimo(xs).slice(0, n).map((x) => ({ nome: x.nome, v: x.valor, extra: pct(x.pct, 0) }));
const contagens = (xs: ItemContagem[], n = 99) => porUltimo(xs).slice(0, n).map((x) => ({ nome: x.nome, v: x.quantidade }));

/** Botão "ver todas" das tabelas longas (abrem com as 10 maiores). */
function VerTodas({ total, abertas, alternar, mostrando }: { total: number; abertas: boolean; alternar: () => void; mostrando: number }) {
  if (total <= mostrando && !abertas) return null;
  return (
    <button type="button" onClick={alternar} className="mt-2 text-sm font-medium text-primary hover:underline">
      {abertas ? "Mostrar só as 10 maiores" : `Ver todas (${total})`}
    </button>
  );
}

/** Índice fixo da tela de Indicadores: atalhos para cada seção. */
function Indice({ itens }: { itens: [string, string][] }) {
  return (
    <nav aria-label="Seções dos indicadores" className="sticky top-0 z-10 -mx-1 overflow-x-auto border-b bg-background/95 px-1 py-2 backdrop-blur">
      <ul className="flex gap-1 whitespace-nowrap text-sm">
        {itens.map(([id, rotulo]) => <li key={id}><a href={`#${id}`} className="rounded-md px-2.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">{rotulo}</a></li>)}
      </ul>
    </nav>
  );
}

function GraficoAno({ r }: { r: ResultadoFechamento }) {
  const linhas = mesesComDados(r.anual);
  const real = linhas.some((l) => l.recebido != null);
  const max = Math.max(1, ...linhas.map((l) => Math.max(l.entradas, l.saidasCaixa, l.recebido ?? 0)));
  const W = 640, H = 200, L = 8, B = 22, T = 18, passo = (W - 2 * L) / linhas.length;
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Faturamento e despesas pagas por mês">
      {linhas.map((l, i) => {
        const x = L + i * passo + passo * 0.2, w = passo * 0.6, ultimo = i === linhas.length - 1;
        return (
          <g key={l.mes}>
            <rect x={x} y={y(l.entradas)} width={w} height={Math.max(1, H - B - y(l.entradas))} rx={2} className={ultimo ? "fill-primary" : "fill-primary/40"}><title>{`${mesAbrev(l.mes)}: ${brl0(l.entradas)}`}</title></rect>
            {l.entradas > 0 && <text x={x + w / 2} y={y(l.entradas) - 4} textAnchor="middle" className="fill-muted-foreground text-[10px]">{Math.round(l.entradas / 1000)} mil</text>}
            <text x={x + w / 2} y={H - 6} textAnchor="middle" className={`text-[11px] ${ultimo ? "fill-foreground font-semibold" : "fill-muted-foreground"}`}>{mesAbrev(l.mes)}</text>
          </g>
        );
      })}
      <polyline fill="none" strokeWidth={2} className="stroke-accent" points={linhas.map((l, i) => `${L + i * passo + passo / 2},${y(l.saidasCaixa)}`).join(" ")} />
      {linhas.map((l, i) => <circle key={l.mes} cx={L + i * passo + passo / 2} cy={y(l.saidasCaixa)} r={3} className="fill-accent"><title>{`Despesas ${mesAbrev(l.mes)}: ${brl0(l.saidasCaixa)}`}</title></circle>)}
      {real && <polyline fill="none" strokeWidth={2} strokeDasharray="5 3" className="stroke-emerald-600 dark:stroke-emerald-400" points={linhas.map((l, i) => `${L + i * passo + passo / 2},${y(l.recebido ?? 0)}`).join(" ")} />}
      {real && linhas.map((l, i) => <circle key={`r${l.mes}`} cx={L + i * passo + passo / 2} cy={y(l.recebido ?? 0)} r={3} className="fill-emerald-600 dark:fill-emerald-400"><title>{`Entradas ${mesAbrev(l.mes)}: ${brl0(l.recebido)}`}</title></circle>)}
    </svg>
  );
}

export function PainelIndicadores({ r }: { r: ResultadoFechamento }) {
  const i = r.indicadores, a = r.anterior;
  const rot = r.fechamento.tipo === "mensal" ? "mês anterior" : "mesmo período do mês anterior";
  const ritmo = r.ritmo;
  const reg = regimesAnuais(r.anual);
  const real = !!i.caixa?.real;
  const rotRes = rotuloResultado(i.caixa);
  const notaRes = i.caixa?.margem != null ? `${pct(i.caixa.margem)} ${real ? "das entradas" : "do faturamento"}` : "";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi rotulo="Faturamento" valor={brl0(i.faturamento?.total)}><Variacao atual={i.faturamento?.total} anterior={a.faturamento?.total} rotulo={rot} /></Kpi>
        {real && <Kpi rotulo="Entradas (recebido)" valor={brl0(i.entradas?.total)}><Variacao atual={i.entradas?.total} anterior={a.entradas?.total} rotulo={rot} /></Kpi>}
        <Kpi rotulo="Despesas pagas (saídas)" valor={brl0(i.despesas?.total)}><Variacao atual={i.despesas?.total} anterior={a.despesas?.total} inverso rotulo={rot} /></Kpi>
        <Kpi rotulo={rotRes} valor={brl0(i.caixa?.resultado)}>{notaRes}</Kpi>
        {ritmo ? (
          <Kpi rotulo="Meta: projeção do mês" valor={ritmo.atingimentoProjetado !== null ? pct(ritmo.atingimentoProjetado) : "—"} destaque>{ritmo.meta ? `realizado ${pct(ritmo.atingimento)} de ${brl0(ritmo.meta)}` : "sem meta definida"}</Kpi>
        ) : (
          <Kpi rotulo="Atingimento da meta" valor={i.meta ? pct(i.meta.atingimento) : "—"} destaque>{i.meta ? `meta ${brl0(i.meta.valor)} · faltam ${brl0(i.meta.falta)}` : "sem meta definida"}</Kpi>
        )}
        <Kpi rotulo={`${cap(r.vocab.clientes)} atendidos`} valor={num(i.pacientes?.atendidos)}><Variacao atual={i.pacientes?.atendidos} anterior={a.pacientes?.atendidos} rotulo={rot} /></Kpi>
        <Kpi rotulo="Ticket médio" valor={brl(i.pacientes?.ticketMedio)}><Variacao atual={i.pacientes?.ticketMedio} anterior={a.pacientes?.ticketMedio} rotulo={rot} /></Kpi>
        <Kpi rotulo={`${cap(r.vocab.clientes)} novos`} valor={num(i.pacientes?.novos)}>{i.pacientes?.atendidos ? `${pct(i.pacientes.novos / i.pacientes.atendidos, 0)} dos atendidos` : ""}{real && i.pacientes ? ` · ticket ${brl0(i.pacientes.ticketNovos)}` : ""}</Kpi>
        {!real && <Kpi rotulo="Ticket médio dos novos" valor={brl(i.pacientes?.ticketNovos)}>{brl0(i.pacientes?.faturamentoNovos)} com novos</Kpi>}
      </div>

      <Indice itens={[
        ...(ritmo ? [["ind-ritmo", "Ritmo"] as [string, string]] : []),
        ["ind-grafico", "Gráfico"], ["ind-funis", "Funis"], ["ind-experiencia", "Experiência"],
        ...(r.personalizadas.length ? [["ind-personalizadas", "Personalizados"] as [string, string]] : []),
        ["ind-receitas", "Receitas"], ["ind-distribuicao", "Por profissional"], ["ind-despesas", "Despesas"],
        ...(i.entradas ? [["ind-entradas", "Entradas"] as [string, string]] : []),
        ["ind-regimes", "Caixa x competência"],
      ]} />

      {ritmo && (
        <Secao id="ind-ritmo" titulo="Ritmo do mês" extra={<span className="text-xs text-muted-foreground">{ritmo.diasUteisDecorridos} de {ritmo.diasUteisMes} dias úteis · feriados do GestfySync</span>}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi rotulo="Faturamento por dia útil" valor={brl0(ritmo.faturamentoPorDia)}>até o dia 15</Kpi>
            <Kpi rotulo="Projeção do mês" valor={brl0(ritmo.projecaoMes)}>{ritmo.meta ? `meta ${brl0(ritmo.meta)}` : "sem meta"}</Kpi>
            <Kpi rotulo="Necessário por dia útil" valor={ritmo.necessarioPorDia !== null ? brl0(ritmo.necessarioPorDia) : "—"}>{ritmo.faltaMeta ? `faltam ${brl0(ritmo.faltaMeta)} em ${ritmo.diasUteisRestantes} dias úteis` : ritmo.meta ? "meta atingida" : ""}</Kpi>
            <Kpi rotulo="Saldo projetado do mês" valor={brl0(ritmo.saldoProjetado)}>projeção − despesas esperadas</Kpi>
            <Kpi rotulo="Despesas pagas" valor={brl0(ritmo.despesasPagas)}>até o dia 15</Kpi>
            <Kpi rotulo="Média de despesas" valor={brl0(ritmo.mediaDespesas)}>{ritmo.mesesMedia.length ? `últimos ${ritmo.mesesMedia.length} meses` : "sem histórico"}</Kpi>
            <Kpi rotulo="Provisionado a pagar" valor={brl0(ritmo.provisionado)}>média − já pago</Kpi>
            <Kpi rotulo="Saldo do período" valor={brl0(ritmo.saldoPeriodo)}>faturamento − pagas</Kpi>
          </div>
        </Secao>
      )}

      <Secao id="ind-grafico" titulo={`${r.anual.some((l) => l.recebido != null) ? "Faturamento, entradas e despesas" : "Faturamento e despesas"} em ${r.periodo.fim.slice(0, 4)}`} extra={<span className="text-xs text-muted-foreground"><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-primary align-[-1px]" />Faturamento <span className="ml-3 mr-1 inline-block h-2.5 w-2.5 rounded-full bg-accent align-[-1px]" />Despesas pagas{r.anual.some((l) => l.recebido != null) && <><span className="ml-3 mr-1 inline-block h-2.5 w-2.5 rounded-full bg-emerald-600 align-[-1px]" />Entradas</>}</span>}>
        <GraficoAno r={r} />
      </Secao>

      <div className="grid gap-5 lg:grid-cols-2">
        <Secao id="ind-funis" titulo="Funil comercial · leads">
          {i.leads ? (
            <div className="space-y-4">
              <Barras itens={[{ nome: "Leads chegando", v: i.leads.total }, { nome: "Agendados", v: i.leads.agendados, extra: pct(i.leads.conversao, 0) }]} formato={(v) => num(v)} />
              <div><p className="mb-1 text-xs font-semibold text-muted-foreground">Origem</p><Barras itens={contagens(i.leads.porOrigem, 5)} formato={(v) => num(v)} /></div>
              <SubLista titulo="Canal de entrada" itens={i.leads.porCanal} n={4} />
              <SubLista titulo="Motivos de não agendamento" itens={i.leads.porObjecao} n={4} />
              <SubLista titulo="Serviço mais buscado" itens={i.leads.porInteresse} n={3} />
            </div>
          ) : <p className="text-sm text-muted-foreground">Planilha de leads não configurada.</p>}
        </Secao>
        <Secao titulo="Funil comercial · orçamentos">
          {i.orcamentos ? (
            <div className="space-y-4">
              <Barras itens={[{ nome: "Gerados", v: i.orcamentos.total }, { nome: "Fechados", v: i.orcamentos.fechados, extra: pct(i.orcamentos.conversaoQuantidade, 0) }, { nome: "Em aberto", v: i.orcamentos.emAberto }, { nome: "Não fecharam", v: i.orcamentos.naoFechou }, ...(i.orcamentos.cancelados ? [{ nome: "Cancelados (fora da conversão)", v: i.orcamentos.cancelados }] : [])]} formato={(v) => num(v)} />
              <Barras itens={[{ nome: "Valor gerado", v: i.orcamentos.valorGerado }, { nome: "Valor fechado", v: i.orcamentos.valorFechado, extra: pct(i.orcamentos.conversaoValor, 0) }, { nome: "Valor em aberto", v: i.orcamentos.valorEmAberto }]} formato={brl0} />
              <div><p className="mb-1 text-xs font-semibold text-muted-foreground">Por status</p><Barras itens={contagens(i.orcamentos.porStatus)} formato={(v) => num(v)} /></div>
              <SubLista titulo="Motivos de não fechamento" itens={i.orcamentos.porObjecao} n={4} />
            </div>
          ) : <p className="text-sm text-muted-foreground">Planilha de orçamentos não configurada.</p>}
        </Secao>
      </div>

      <Secao id="ind-experiencia" titulo={`Experiência do ${r.vocab.cliente}`}>
        {/* Os mesmos cards do PDF: um por informação que a fonte tiver. */}
        {i.nps || i.google ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {i.nps && <Kpi rotulo="NPS" valor={num(i.nps.nps)}>{i.nps.respostas} respostas · {i.nps.promotores}/{i.nps.neutros}/{i.nps.detratores}</Kpi>}
            {i.nps?.notas.profissional != null && <Kpi rotulo={cap(r.vocab.profissional)} valor={num(i.nps.notas.profissional, 2)}>de 5</Kpi>}
            {i.nps?.notas.recepcao != null && <Kpi rotulo="Recepção" valor={num(i.nps.notas.recepcao, 2)}>de 5</Kpi>}
            {i.nps?.notas.infraestrutura != null && <Kpi rotulo="Infraestrutura" valor={num(i.nps.notas.infraestrutura, 2)}>de 5</Kpi>}
            {i.nps?.notas.enfermagem != null && <Kpi rotulo="Enfermagem" valor={num(i.nps.notas.enfermagem, 2)}>de 5</Kpi>}
            {i.google && <Kpi rotulo="Google" valor={num(i.google.nota, 1)}>{i.google.avaliacoes} avaliações</Kpi>}
          </div>
        ) : <p className="text-sm text-muted-foreground">Planilha de NPS não configurada.</p>}
      </Secao>

      {r.personalizadas.map((fp, k) => (
        <Secao key={fp.id} id={k === 0 ? "ind-personalizadas" : undefined} titulo={fp.nome} extra={<span className="text-xs text-muted-foreground">fonte personalizada · {fp.linhasLidas} linhas{fp.ignoradas ? ` · ${fp.ignoradas} ignoradas` : ""}</span>}>
          {fp.erro ? <p className="text-sm text-destructive">{fp.erro}</p> : !fp.indicadores.length ? <p className="text-sm text-muted-foreground">Nenhum indicador configurado.</p> : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {fp.indicadores.filter((d) => !d.grupos).map((d) => {
                  const v = variacaoIndicador(d.atual, d.anterior, d.formato, d.melhor);
                  return (
                    <Kpi key={d.id} rotulo={d.nome} valor={formatarIndicador(d.atual, d.formato)}>
                      anterior {formatarIndicador(d.anterior, d.formato)}
                      {v && <> · <b className={v.tom === "bom" ? "text-emerald-600 dark:text-emerald-400" : v.tom === "ruim" ? "text-red-600 dark:text-red-400" : ""}>{v.texto}</b></>}
                      <span className="mt-1 block truncate" title={d.descricao}>{d.descricao}</span>
                      <span className="block">no relatório: {ondeAparece(d.secao, r)}</span>
                    </Kpi>
                  );
                })}
              </div>
              {fp.indicadores.some((d) => d.grupos?.length) && (
                <div className="grid gap-6 md:grid-cols-2">
                  {fp.indicadores.filter((d) => d.grupos?.length).map((d) => (
                    <div key={d.id}>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">{d.nome} · no relatório: {ondeAparece(d.secao, r)}</p>
                      <Barras itens={d.grupos!.slice(0, 10).map((g) => ({ nome: g.nome, v: g.valor ?? 0, extra: d.formato === "moeda" ? `${g.linhas}` : undefined }))} formato={(v) => formatarIndicador(v, d.formato)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Secao>
      ))}

      <Secao id="ind-receitas" titulo="Receitas detalhadas" extra={<span className="text-xs text-muted-foreground">{i.faturamento?.lancamentos} lançamentos · {i.faturamento?.semValor} sem valor</span>}>
        <TabelaReceitas f={i.faturamento} />
      </Secao>

      <div id="ind-distribuicao" className="grid scroll-mt-16 gap-5 lg:grid-cols-3">
        <Secao titulo={`Por ${r.vocab.profissional}`}><Barras itens={valores(i.faturamento?.porProfissional ?? [])} formato={brl0} /></Secao>
        <Secao titulo="Por unidade"><Barras itens={valores(i.faturamento?.porUnidade ?? [])} formato={brl0} /></Secao>
        <Secao titulo="Meio de pagamento"><Barras itens={valores(i.faturamento?.porPagamento ?? [])} formato={brl0} /></Secao>
      </div>

      <Secao id="ind-despesas" titulo="Despesas detalhadas por grupo e categoria">
        <TabelaDespesas d={i.despesas} />
      </Secao>

      {i.entradas && <SecaoEntradas e={i.entradas} />}

      <Secao id="ind-regimes" titulo={`Caixa x competência ${r.periodo.fim.slice(0, 4)}`}>
        <TabelaRegimes reg={reg} />
      </Secao>
    </div>
  );
}

/** Receitas: abre com as 10 maiores categorias; "ver todas" mostra o resto. O total é sempre o do período. */
function TabelaReceitas({ f }: { f: Indicadores["faturamento"] }) {
  const [todas, setTodas] = useState(false);
  const grupos = [...(f?.porGrupo ?? [])].sort((a, b) => b.valor - a.valor);
  const visiveis = todas ? grupos : grupos.slice(0, 10);
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 font-medium">Grupo</th><th className="py-2 text-right font-medium">Valor</th><th className="py-2 text-right font-medium">Quantidade</th><th className="py-2 text-right font-medium">Ticket médio</th><th className="py-2 text-right font-medium">%</th></tr></thead>
          <tbody>
            {visiveis.map((g) => (
              <tr key={g.nome} className="border-t"><td className="py-1.5">{g.nome}</td><td className="py-1.5 text-right tabular-nums">{brl(g.valor)}</td><td className="py-1.5 text-right tabular-nums">{g.quantidade}</td><td className="py-1.5 text-right tabular-nums">{g.valor ? brl(g.ticket) : "—"}</td><td className="py-1.5 text-right tabular-nums">{pct(g.pct)}</td></tr>
            ))}
            {!todas && grupos.length > 10 && (
              <tr className="border-t text-muted-foreground"><td className="py-1.5">Outras {grupos.length - 10} categorias</td><td className="py-1.5 text-right tabular-nums">{brl(grupos.slice(10).reduce((s, g) => s + g.valor, 0))}</td><td className="py-1.5 text-right tabular-nums">{grupos.slice(10).reduce((s, g) => s + g.quantidade, 0)}</td><td /><td className="py-1.5 text-right tabular-nums">{pct(grupos.slice(10).reduce((s, g) => s + g.pct, 0))}</td></tr>
            )}
            <tr className="border-t bg-muted/60 font-semibold"><td className="py-2">Total</td><td className="py-2 text-right tabular-nums">{brl(f?.total)}</td><td className="py-2 text-right tabular-nums">{f?.lancamentos}</td><td /><td className="py-2 text-right">100%</td></tr>
          </tbody>
        </table>
      </div>
      <VerTodas total={grupos.length} abertas={todas} alternar={() => setTodas(!todas)} mostrando={10} />
    </>
  );
}

/** Despesas: todos os grupos com o total; dentro deles, só as 10 maiores categorias até "ver todas". */
function TabelaDespesas({ d }: { d: Indicadores["despesas"] }) {
  const [todas, setTodas] = useState(false);
  const cats = (d?.porGrupo ?? []).flatMap((g) => g.categorias.filter((c) => !(g.categorias.length === 1 && c.nome === g.nome)).map((c) => `${g.nome}|${c.nome}|${c.valor}`));
  const maiores = new Set(cats.map((k) => ({ k, v: Number(k.split("|").at(-1)) })).sort((a, b) => b.v - a.v).slice(0, 10).map((x) => x.k));
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 font-medium">Grupo / categoria</th><th className="py-2 text-right font-medium">Valor</th><th className="py-2 text-right font-medium">%</th></tr></thead>
          <tbody>
            {d?.porGrupo.map((g) => <GrupoDespesaLinhas key={g.nome} g={g} mostrar={todas ? undefined : (c) => maiores.has(`${g.nome}|${c.nome}|${c.valor}`)} />)}
            <tr className="border-t bg-muted/60 font-semibold"><td className="py-2">Total de despesas pagas</td><td className="py-2 text-right tabular-nums">{brl(d?.total)}</td><td className="py-2 text-right">100%</td></tr>
          </tbody>
        </table>
      </div>
      {cats.length > 10 && (
        <button type="button" onClick={() => setTodas(!todas)} className="mt-2 text-sm font-medium text-primary hover:underline">
          {todas ? "Mostrar só as 10 maiores categorias" : `Ver todas as categorias (${cats.length})`}
        </button>
      )}
    </>
  );
}

function GrupoDespesaLinhas({ g, mostrar }: { g: GrupoDespesa; mostrar?: (c: GrupoDespesa["categorias"][number]) => boolean }) {
  const soCategoriaIgual = g.categorias.length === 1 && g.categorias[0].nome === g.nome;
  const visiveis = mostrar ? g.categorias.filter(mostrar) : g.categorias;
  const escondidas = g.categorias.length - visiveis.length;
  return (
    <>
      <tr className="border-t bg-muted/40 font-semibold"><td className="py-1.5">{g.nome}</td><td className="py-1.5 text-right tabular-nums">{brl(g.valor)}</td><td className="py-1.5 text-right tabular-nums">{pct(g.pct)}</td></tr>
      {!soCategoriaIgual && escondidas > 0 && <tr className="border-t text-xs text-muted-foreground"><td className="py-1 pl-6" colSpan={3}>+ {escondidas} {escondidas > 1 ? "categorias menores" : "categoria menor"}</td></tr>}
      {!soCategoriaIgual && visiveis.map((c) => (
        <tr key={c.nome} className="border-t"><td className="py-1.5 pl-6">{c.nome}</td><td className="py-1.5 text-right tabular-nums">{brl(c.valor)}</td><td className="py-1.5 text-right tabular-nums text-muted-foreground">{pct(c.pct)}</td></tr>
      ))}
    </>
  );
}

const ROT_GRUPO: Record<string, string> = { operacional: "Operacionais", nao_operacional: "Não operacionais", fora: "Fora do resultado" };

function SecaoEntradas({ e }: { e: NonNullable<Indicadores["entradas"]> }) {
  const grupos = (["operacional", "nao_operacional", "fora"] as const).map((g) => ({ g, itens: e.porCategoria.filter((c) => c.grupo === g) })).filter((x) => x.itens.length);
  const totalDe = { operacional: e.operacionais, nao_operacional: e.naoOperacionais, fora: e.foraDoResultado };
  return (
    <Secao id="ind-entradas" titulo="Entradas de caixa por categoria" extra={<span className="text-xs text-muted-foreground">{e.lancamentos} recebimentos</span>}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 font-medium">Grupo / categoria</th><th className="py-2 text-right font-medium">Valor</th><th className="py-2 text-right font-medium">%</th></tr></thead>
          <tbody>
            {grupos.map(({ g, itens }) => (
              <Fragment key={g}>
                <tr className={`border-t font-semibold ${g === "fora" ? "text-muted-foreground" : ""}`}><td className="py-1.5">{ROT_GRUPO[g]}</td><td className="py-1.5 text-right tabular-nums">{brl(totalDe[g])}</td><td className="py-1.5 text-right">{g === "fora" ? "" : pct(e.total ? totalDe[g] / e.total : 0, 0)}</td></tr>
                {itens.map((c) => <tr key={c.nome} className="text-muted-foreground"><td className="py-1 pl-4">{c.nome}</td><td className="py-1 text-right tabular-nums">{brl(c.valor)}</td><td className="py-1 text-right">{g === "fora" ? "" : pct(c.pct, 0)}</td></tr>)}
              </Fragment>
            ))}
            <tr className="border-t bg-muted/60 font-semibold"><td className="py-2">Total de entradas (no resultado)</td><td className="py-2 text-right tabular-nums">{brl(e.total)}</td><td className="py-2 text-right">100%</td></tr>
          </tbody>
        </table>
      </div>
      {e.foraDoResultado > 0 && <p className="mt-2 text-xs text-muted-foreground">Transferências, empréstimos e aportes ({brl0(e.foraDoResultado)}) aparecem só como informação: não são receita.</p>}
    </Secao>
  );
}

/** Caixa x competência. Sem fonte de Entradas, a coluna de caixa é "Faturamento x Despesas". */
export function TabelaRegimes({ reg }: { reg: ReturnType<typeof regimesAnuais> }) {
  const td = "py-1.5 text-right tabular-nums";
  const neg = (v: number) => (v < 0 ? " text-red-600 dark:text-red-400" : "");
  const linha = (l: Omit<LinhaRegime, "mes">) => (
    <>
      <td className={td}>{brl0(l.faturamento)}</td>
      {reg.real && <td className={td}>{brl0(l.entradas)}</td>}
      <td className={td}>{brl0(l.saidasCaixa)}</td>
      <td className={td + neg(l.resultadoCaixa)}>{brl0(l.resultadoCaixa)}</td>
      <td className={td}>{brl0(l.despesasCompetencia)}</td>
      <td className={td + neg(l.resultadoCompetencia)}>{brl0(l.resultadoCompetencia)}</td>
    </>
  );
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-2 font-medium">Mês</th><th className="py-2 text-right font-medium">Faturamento</th>
              {reg.real && <th className="py-2 text-right font-medium">Entradas</th>}
              <th className="py-2 text-right font-medium">Despesas pagas</th>
              <th className="py-2 text-right font-medium">{reg.real ? "Resultado de caixa" : "Faturamento x Despesas"}</th>
              <th className="py-2 text-right font-medium">Despesas (competência)</th>
              <th className="py-2 text-right font-medium">Resultado por competência</th>
            </tr>
          </thead>
          <tbody>
            {reg.linhas.map((l) => (
              <tr key={l.mes} className="border-t"><td className="py-1.5">{mesAbrev(l.mes)}/{l.mes.slice(2, 4)}</td>
                {l.vazio ? <td colSpan={reg.real ? 6 : 5} className="py-1.5 text-center text-xs text-muted-foreground">sem lançamentos neste mês</td> : linha(l)}
              </tr>
            ))}
            <tr className="border-t bg-muted/60 font-semibold"><td className="py-2">Total</td>{linha(reg.total)}</tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {reg.real ? "Resultado de caixa = entradas recebidas − despesas pagas no mês. " : "Sem a fonte de Entradas, o caixa é aproximado pelo faturamento: Faturamento x Despesas = faturamento − despesas pagas. "}
        Resultado por competência = faturamento do mês − despesas do mês de competência (sem competência na planilha, vale o mês do pagamento). Só despesas pagas entram.
      </p>
    </>
  );
}

/** Contagens com título; some quando só há "Não informado". */
function SubLista({ titulo, itens, n }: { titulo: string; itens?: ItemContagem[]; n: number }) {
  const xs = (itens ?? []).filter((o) => o.nome !== "Não informado");
  if (!xs.length) return null;
  return <div><p className="mb-1 text-xs font-semibold text-muted-foreground">{titulo}</p><Barras itens={contagens(xs, n)} formato={(v) => num(v)} /></div>;
}
