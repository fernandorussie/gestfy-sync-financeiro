"use client";

import type { ReactNode } from "react";
import type { GrupoDespesa, ItemContagem, ItemValor } from "@/lib/fechamentos/indicadores";
import type { ResultadoFechamento } from "@/lib/fechamentos/servidor";
import { brl, brl0, mesAbrev, num, pct } from "../../_components/formato";

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

function Secao({ titulo, children, extra }: { titulo: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"><h2 className="text-sm font-semibold">{titulo}</h2>{extra}</div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Barras({ itens, formato, max }: { itens: { nome: string; v: number; extra?: string }[]; formato: (v: number) => string; max?: number }) {
  const m = max ?? Math.max(1, ...itens.map((i) => i.v));
  return (
    <table className="w-full text-sm">
      <tbody>
        {itens.map((i) => (
          <tr key={i.nome} className="border-b last:border-0">
            <td className="py-1.5 pr-2">{i.nome}</td>
            <td className="w-[30%] py-1.5"><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(1.5, (i.v / m) * 100)}%` }} /></div></td>
            <td className="whitespace-nowrap py-1.5 pl-2 text-right tabular-nums">{formato(i.v)}{i.extra ? <span className="text-muted-foreground"> {i.extra}</span> : null}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const valores = (xs: ItemValor[], n = 99) => xs.slice(0, n).map((x) => ({ nome: x.nome, v: x.valor, extra: pct(x.pct, 0) }));
const contagens = (xs: ItemContagem[], n = 99) => xs.slice(0, n).map((x) => ({ nome: x.nome, v: x.quantidade }));

function GraficoAno({ r }: { r: ResultadoFechamento }) {
  const linhas = r.anual;
  const max = Math.max(1, ...linhas.map((l) => Math.max(l.entradas, l.saidasCaixa)));
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
    </svg>
  );
}

export function PainelIndicadores({ r }: { r: ResultadoFechamento }) {
  const i = r.indicadores, a = r.anterior;
  const rot = r.fechamento.tipo === "mensal" ? "mês anterior" : "quinzena anterior";
  const somaAno = (k: "entradas" | "saidasCaixa" | "saidasCompetencia") => r.anual.reduce((s, l) => s + l[k], 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi rotulo="Faturamento (entradas)" valor={brl0(i.faturamento?.total)}><Variacao atual={i.faturamento?.total} anterior={a.faturamento?.total} rotulo={rot} /></Kpi>
        <Kpi rotulo="Despesas (saídas)" valor={brl0(i.despesas?.total)}><Variacao atual={i.despesas?.total} anterior={a.despesas?.total} inverso rotulo={rot} /></Kpi>
        <Kpi rotulo="Resultado de caixa" valor={brl0(i.caixa?.resultado)}>{i.caixa?.margem != null ? `${pct(i.caixa.margem)} da receita` : ""}</Kpi>
        <Kpi rotulo="Atingimento da meta" valor={i.meta ? pct(i.meta.atingimento) : "—"} destaque>{i.meta ? `meta ${brl0(i.meta.valor)} · faltam ${brl0(i.meta.falta)}` : "sem meta definida"}</Kpi>
        <Kpi rotulo="Pacientes atendidos" valor={num(i.pacientes?.atendidos)}><Variacao atual={i.pacientes?.atendidos} anterior={a.pacientes?.atendidos} rotulo={rot} /></Kpi>
        <Kpi rotulo="Ticket médio" valor={brl(i.pacientes?.ticketMedio)}><Variacao atual={i.pacientes?.ticketMedio} anterior={a.pacientes?.ticketMedio} rotulo={rot} /></Kpi>
        <Kpi rotulo="Pacientes novos" valor={num(i.pacientes?.novos)}>{i.pacientes?.atendidos ? `${pct(i.pacientes.novos / i.pacientes.atendidos, 0)} dos atendidos` : ""}</Kpi>
        <Kpi rotulo="Ticket médio dos novos" valor={brl(i.pacientes?.ticketNovos)}>{brl0(i.pacientes?.faturamentoNovos)} com novos</Kpi>
      </div>

      <Secao titulo={`Faturamento em ${r.periodo.fim.slice(0, 4)}`} extra={<span className="text-xs text-muted-foreground"><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-primary align-[-1px]" />Faturamento <span className="ml-3 mr-1 inline-block h-2.5 w-2.5 rounded-full bg-accent align-[-1px]" />Despesas pagas</span>}>
        <GraficoAno r={r} />
      </Secao>

      <div className="grid gap-5 lg:grid-cols-2">
        <Secao titulo="Funil comercial · leads">
          {i.leads ? (
            <div className="space-y-4">
              <Barras itens={[{ nome: "Leads chegando", v: i.leads.total }, { nome: "Agendados", v: i.leads.agendados, extra: pct(i.leads.conversao, 0) }]} formato={(v) => num(v)} />
              <div><p className="mb-1 text-xs font-semibold text-muted-foreground">Origem</p><Barras itens={contagens(i.leads.porOrigem, 5)} formato={(v) => num(v)} /></div>
              <div><p className="mb-1 text-xs font-semibold text-muted-foreground">Principais objeções</p><Barras itens={contagens(i.leads.porObjecao.filter((o) => o.nome !== "Não informado"), 4)} formato={(v) => num(v)} /></div>
              <div><p className="mb-1 text-xs font-semibold text-muted-foreground">Serviço mais buscado</p><Barras itens={contagens(i.leads.porInteresse.filter((o) => o.nome !== "Não informado"), 3)} formato={(v) => num(v)} /></div>
            </div>
          ) : <p className="text-sm text-muted-foreground">Planilha de leads não configurada.</p>}
        </Secao>
        <Secao titulo="Funil comercial · orçamentos">
          {i.orcamentos ? (
            <div className="space-y-4">
              <Barras itens={[{ nome: "Gerados", v: i.orcamentos.total }, { nome: "Fechados", v: i.orcamentos.fechados, extra: pct(i.orcamentos.conversaoQuantidade, 0) }, { nome: "Em aberto", v: i.orcamentos.emAberto }, { nome: "Não fecharam", v: i.orcamentos.naoFechou }]} formato={(v) => num(v)} />
              <Barras itens={[{ nome: "Valor gerado", v: i.orcamentos.valorGerado }, { nome: "Valor fechado", v: i.orcamentos.valorFechado, extra: pct(i.orcamentos.conversaoValor, 0) }, { nome: "Valor em aberto", v: i.orcamentos.valorEmAberto }]} formato={brl0} />
              <div><p className="mb-1 text-xs font-semibold text-muted-foreground">Por status</p><Barras itens={contagens(i.orcamentos.porStatus)} formato={(v) => num(v)} /></div>
            </div>
          ) : <p className="text-sm text-muted-foreground">Planilha de orçamentos não configurada.</p>}
        </Secao>
      </div>

      <Secao titulo="Experiência do paciente">
        {i.nps ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi rotulo="NPS" valor={num(i.nps.nps)}>{i.nps.respostas} respostas · {i.nps.promotores}/{i.nps.neutros}/{i.nps.detratores}</Kpi>
            <Kpi rotulo="Profissional de saúde" valor={num(i.nps.notas.profissional, 2)}>de 5</Kpi>
            <Kpi rotulo="Recepção" valor={num(i.nps.notas.recepcao, 2)}>de 5</Kpi>
            <Kpi rotulo="Infraestrutura · enfermagem" valor={`${num(i.nps.notas.infraestrutura, 2)} · ${num(i.nps.notas.enfermagem, 2)}`}>de 5</Kpi>
          </div>
        ) : <p className="text-sm text-muted-foreground">Planilha de NPS não configurada.</p>}
        {i.google && <p className="mt-3 text-sm">Avaliações Google: {i.google.avaliacoes}, nota {num(i.google.nota, 1)}</p>}
      </Secao>

      <Secao titulo="Receitas detalhadas" extra={<span className="text-xs text-muted-foreground">{i.faturamento?.lancamentos} lançamentos · {i.faturamento?.semValor} sem valor</span>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 font-medium">Grupo</th><th className="py-2 text-right font-medium">Valor</th><th className="py-2 text-right font-medium">Quantidade</th><th className="py-2 text-right font-medium">Ticket médio</th><th className="py-2 text-right font-medium">%</th></tr></thead>
            <tbody>
              {i.faturamento?.porGrupo.map((g) => (
                <tr key={g.nome} className="border-t"><td className="py-1.5">{g.nome}</td><td className="py-1.5 text-right tabular-nums">{brl(g.valor)}</td><td className="py-1.5 text-right tabular-nums">{g.quantidade}</td><td className="py-1.5 text-right tabular-nums">{g.valor ? brl(g.ticket) : "—"}</td><td className="py-1.5 text-right tabular-nums">{pct(g.pct)}</td></tr>
              ))}
              <tr className="border-t bg-muted/60 font-semibold"><td className="py-2">Total</td><td className="py-2 text-right tabular-nums">{brl(i.faturamento?.total)}</td><td className="py-2 text-right tabular-nums">{i.faturamento?.lancamentos}</td><td /><td className="py-2 text-right">100%</td></tr>
            </tbody>
          </table>
        </div>
      </Secao>

      <div className="grid gap-5 lg:grid-cols-3">
        <Secao titulo="Por profissional"><Barras itens={valores(i.faturamento?.porProfissional ?? [])} formato={brl0} /></Secao>
        <Secao titulo="Por unidade"><Barras itens={valores(i.faturamento?.porUnidade ?? [])} formato={brl0} /></Secao>
        <Secao titulo="Meio de pagamento"><Barras itens={valores(i.faturamento?.porPagamento ?? [])} formato={brl0} /></Secao>
      </div>

      <Secao titulo="Despesas detalhadas por grupo e categoria">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 font-medium">Grupo / categoria</th><th className="py-2 text-right font-medium">Valor</th><th className="py-2 text-right font-medium">%</th></tr></thead>
            <tbody>
              {i.despesas?.porGrupo.map((g) => (
                <GrupoDespesaLinhas key={g.nome} g={g} />
              ))}
              <tr className="border-t bg-muted/60 font-semibold"><td className="py-2">Total de despesas pagas</td><td className="py-2 text-right tabular-nums">{brl(i.despesas?.total)}</td><td className="py-2 text-right">100%</td></tr>
            </tbody>
          </table>
        </div>
      </Secao>

      <Secao titulo={`Resultado anual ${r.periodo.fim.slice(0, 4)}: caixa e competência`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="py-2 font-medium">Mês</th><th className="py-2 text-right font-medium">Entradas</th><th className="py-2 text-right font-medium">Saídas (caixa)</th><th className="py-2 text-right font-medium">Saldo (caixa)</th><th className="py-2 text-right font-medium">Gastos (competência)</th><th className="py-2 text-right font-medium">Saldo (competência)</th></tr>
            </thead>
            <tbody>
              {r.anual.map((l) => (
                <tr key={l.mes} className="border-t"><td className="py-1.5">{mesAbrev(l.mes)}/{l.mes.slice(2, 4)}</td><td className="py-1.5 text-right tabular-nums">{brl0(l.entradas)}</td><td className="py-1.5 text-right tabular-nums">{brl0(l.saidasCaixa)}</td><td className="py-1.5 text-right tabular-nums">{brl0(l.entradas - l.saidasCaixa)}</td><td className="py-1.5 text-right tabular-nums">{brl0(l.saidasCompetencia)}</td><td className="py-1.5 text-right tabular-nums">{brl0(l.entradas - l.saidasCompetencia)}</td></tr>
              ))}
              <tr className="border-t bg-muted/60 font-semibold"><td className="py-2">Total</td><td className="py-2 text-right tabular-nums">{brl0(somaAno("entradas"))}</td><td className="py-2 text-right tabular-nums">{brl0(somaAno("saidasCaixa"))}</td><td className="py-2 text-right tabular-nums">{brl0(somaAno("entradas") - somaAno("saidasCaixa"))}</td><td className="py-2 text-right tabular-nums">{brl0(somaAno("saidasCompetencia"))}</td><td className="py-2 text-right tabular-nums">{brl0(somaAno("entradas") - somaAno("saidasCompetencia"))}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Na competência, cada despesa entra no mês de competência informado na planilha. A receita segue a data de atendimento nos dois regimes.</p>
      </Secao>
    </div>
  );
}

function GrupoDespesaLinhas({ g }: { g: GrupoDespesa }) {
  const soCategoriaIgual = g.categorias.length === 1 && g.categorias[0].nome === g.nome;
  return (
    <>
      <tr className="border-t bg-muted/40 font-semibold"><td className="py-1.5">{g.nome}</td><td className="py-1.5 text-right tabular-nums">{brl(g.valor)}</td><td className="py-1.5 text-right tabular-nums">{pct(g.pct)}</td></tr>
      {!soCategoriaIgual && g.categorias.map((c) => (
        <tr key={c.nome} className="border-t"><td className="py-1.5 pl-6">{c.nome}</td><td className="py-1.5 text-right tabular-nums">{brl(c.valor)}</td><td className="py-1.5 text-right tabular-nums text-muted-foreground">{pct(c.pct)}</td></tr>
      ))}
    </>
  );
}
