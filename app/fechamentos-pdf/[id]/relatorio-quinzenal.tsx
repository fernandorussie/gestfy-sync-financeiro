import type { ReactNode } from "react";
import type { ResultadoFechamento } from "@/lib/fechamentos/servidor";
import type { Ritmo } from "@/lib/fechamentos/ritmo";
import { brl, brl0, num, pct } from "../../(app)/fechamentos/_components/formato";
import { Cabecalho, categoriasReceita, CINZA, Kpi, LINHA, Linhas, contagens, mesDe, td, Titulo, Var, VERMELHO } from "./relatorio";

/*
 * Relatório quinzenal: parcial do dia 1 ao 15, focado no ritmo do mês
 * (faturamento por dia útil, projeção, quanto falta para a meta e despesas
 * ainda a pagar). Cor laranja, para não confundir com o mensal (roxo).
 * Variações: contra o mesmo período (dia 1 ao 15) do mês anterior.
 */

export const COR_QUINZENAL = "#E04800";
const COR = COR_QUINZENAL;
const LARANJA = "#FF5001";
const CLARO = "#FFC6A8";
const FUNDO = "#FFF3EC";

function LinhasVar({ itens }: { itens: { nome: string; valor: ReactNode; antes?: ReactNode; destaque?: boolean }[] }) {
  return (
    <table className="w-full text-[11.5px]">
      <tbody>
        {itens.map((i) => (
          <tr key={i.nome} className="border-b last:border-0" style={{ borderColor: LINHA }}>
            <td className={`py-[5px] pr-2 ${i.destaque ? "font-semibold" : ""}`}>{i.nome}</td>
            <td className={`whitespace-nowrap py-[5px] text-right tabular-nums ${i.destaque ? "font-semibold" : ""}`}>{i.valor}</td>
            <td className="w-[62px] whitespace-nowrap py-[5px] text-right text-[10.5px] tabular-nums">{i.antes ?? null}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Barra: realizado (cheio) e projeção (claro) contra a meta (traço). */
function BarraMeta({ ritmo }: { ritmo: Ritmo }) {
  const meta = ritmo.meta ?? 0;
  const max = Math.max(meta, ritmo.projecaoMes, 1) * 1.08;
  const w = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="space-y-1.5">
      <div className="relative h-5 overflow-hidden rounded-full" style={{ background: "#F3EEEA" }}>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: w(ritmo.projecaoMes), background: CLARO }} />
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: w(ritmo.faturamento), background: LARANJA }} />
        {meta > 0 && <div className="absolute inset-y-[-2px] w-[2px]" style={{ left: w(meta), background: "#1d1b22" }} />}
      </div>
      <div className="flex flex-wrap gap-x-4 text-[10px]" style={{ color: CINZA }}>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full align-[-1px]" style={{ background: LARANJA }} />Realizado {brl0(ritmo.faturamento)}</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full align-[-1px]" style={{ background: CLARO }} />Projeção {brl0(ritmo.projecaoMes)}</span>
        {meta > 0 && <span><span className="mr-1 inline-block h-2.5 w-[2px] align-[-1px]" style={{ background: "#1d1b22" }} />Meta {brl0(meta)}</span>}
      </div>
    </div>
  );
}

type Props = { r: ResultadoFechamento; nivel?: string };
const vsDe = (r: ResultadoFechamento) => `vs 1–15 de ${mesDe(r.anterior.periodo.inicio).slice(0, 3)}`;
function notaVar(r: ResultadoFechamento) {
  return function nota(atual?: number | null, antes?: number | null, custo?: boolean) {
    return <><Var atual={atual} antes={antes} custo={custo} /> {vsDe(r)}</>;
  };
}
const tkOrc = (o: ResultadoFechamento["indicadores"]["orcamentos"]) => (o && o.total ? o.valorGerado / o.total : null);

export function SecResultadoQuinzenal({ r }: Props) {
  const i = r.indicadores, a = r.anterior, n = notaVar(r);
  return (
    <div className="grid grid-cols-4 gap-2.5">
      <Kpi fundo={FUNDO} rotulo="Faturamento até o dia 15" valor={brl0(i.faturamento?.total)} nota={n(i.faturamento?.total, a.faturamento?.total)} />
      <Kpi fundo={FUNDO} rotulo="Pacientes atendidos" valor={num(i.pacientes?.atendidos)} nota={n(i.pacientes?.atendidos, a.pacientes?.atendidos)} />
      <Kpi fundo={FUNDO} rotulo="Ticket médio" valor={brl(i.pacientes?.ticketMedio)} nota={n(i.pacientes?.ticketMedio, a.pacientes?.ticketMedio)} />
      <Kpi fundo={FUNDO} rotulo="Pacientes novos" valor={num(i.pacientes?.novos)} nota={n(i.pacientes?.novos, a.pacientes?.novos)} />
    </div>
  );
}

export function SecRitmo({ r }: Props) {
  const ritmo = r.ritmo;
  if (!ritmo) return null;
  return (
    <div className="pdf-bloco rounded-xl border-2 p-4" style={{ borderColor: CLARO }}>
      <Titulo cor={COR} extra={`${ritmo.diasUteisDecorridos} de ${ritmo.diasUteisMes} dias úteis decorridos`}>Ritmo do mês</Titulo>
      <div className="mb-3 grid grid-cols-4 gap-3">
        {[
          ["Faturamento por dia útil", brl0(ritmo.faturamentoPorDia)],
          ["Projeção do mês", brl0(ritmo.projecaoMes)],
          ["Meta do mês", ritmo.meta ? brl0(ritmo.meta) : "—"],
          ["Projeção da meta", ritmo.atingimentoProjetado !== null ? pct(ritmo.atingimentoProjetado) : "—"],
        ].map(([t, v], k) => (
          <div key={t}>
            <p className="text-[10px] font-medium" style={{ color: CINZA }}>{t}</p>
            <p className="font-heading text-[19px] font-semibold tabular-nums leading-tight" style={{ color: k === 3 && ritmo.atingimentoProjetado !== null && ritmo.atingimentoProjetado < 0.95 ? VERMELHO : undefined }}>{v}</p>
          </div>
        ))}
      </div>
      <BarraMeta ritmo={ritmo} />
      {ritmo.meta ? (
        <p className="mt-3 text-[12px]">
          {ritmo.faltaMeta
            ? <>Para bater a meta, faltam <b>{brl(ritmo.faltaMeta)}</b>: <b style={{ color: COR }}>{brl(ritmo.necessarioPorDia)} por dia útil</b> nos {ritmo.diasUteisRestantes} dias úteis restantes (hoje a média é {brl(ritmo.faturamentoPorDia)}).</>
            : <>A meta do mês <b>já foi atingida</b>.</>}
        </p>
      ) : <p className="mt-3 text-[11px]" style={{ color: CINZA }}>Sem meta cadastrada para o mês.</p>}
    </div>
  );
}

export function SecCaixaMes({ r }: Props) {
  const ritmo = r.ritmo, i = r.indicadores, a = r.anterior, n = notaVar(r);
  if (!ritmo) return null;
  return (
    <div className="pdf-bloco">
      <Titulo cor={COR} extra="despesas a pagar estimadas pela média dos últimos meses">Caixa do mês</Titulo>
      <div className="grid grid-cols-4 gap-2.5">
        <Kpi fundo={FUNDO} rotulo="Despesas pagas até o dia 15" valor={brl0(ritmo.despesasPagas)} nota={n(i.despesas?.total, a.despesas?.total, true)} />
        <Kpi fundo={FUNDO} rotulo="Média mensal de despesas" valor={brl0(ritmo.mediaDespesas)} nota={ritmo.mesesMedia.length ? `${ritmo.mesesMedia.map((m) => mesDe(m + "-01").slice(0, 3)).join(", ")}` : "sem histórico"} />
        <Kpi fundo={FUNDO} rotulo="Provisionado a pagar" valor={brl0(ritmo.provisionado)} nota="média − já pago" />
        <Kpi fundo={FUNDO} rotulo="Saldo projetado do mês" valor={brl0(ritmo.saldoProjetado)} nota={`saldo até o dia 15: ${brl0(ritmo.saldoPeriodo)}`} />
      </div>
    </div>
  );
}

export function SecFunilLeadsQuinzenal({ r, nivel }: Props) {
  const i = r.indicadores, a = r.anterior;
  return (
    <div className="pdf-bloco space-y-4">
      <div>
        <Titulo cor={COR} extra={vsDe(r)}>Funil de leads</Titulo>
        {i.leads ? (
          <LinhasVar itens={[
            { nome: "Leads chegando", valor: num(i.leads.total), antes: <Var atual={i.leads.total} antes={a.leads?.total} /> },
            { nome: "Agendados", valor: num(i.leads.agendados), antes: <Var atual={i.leads.agendados} antes={a.leads?.agendados} /> },
            { nome: "Conversão", valor: pct(i.leads.conversao, 0), antes: <Var atual={i.leads.conversao} antes={a.leads?.conversao} />, destaque: true },
          ]} />
        ) : <p className="text-[11px]" style={{ color: CINZA }}>Planilha de leads não configurada.</p>}
      </div>
      {i.leads && nivel === "completo" && <div><Titulo cor={COR}>Origem</Titulo><Linhas itens={contagens(i.leads.porOrigem, 6)} /></div>}
    </div>
  );
}

export function SecFunilOrcamentosQuinzenal({ r, nivel }: Props) {
  const i = r.indicadores, a = r.anterior;
  return (
    <div className="pdf-bloco space-y-4">
      <div>
        <Titulo cor={COR} extra={vsDe(r)}>Orçamentos</Titulo>
        {i.orcamentos ? (
          <LinhasVar itens={[
            { nome: "Orçamentos", valor: num(i.orcamentos.total), antes: <Var atual={i.orcamentos.total} antes={a.orcamentos?.total} /> },
            { nome: "Ticket médio por orçamento", valor: brl0(tkOrc(i.orcamentos)), antes: <Var atual={tkOrc(i.orcamentos)} antes={tkOrc(a.orcamentos)} /> },
            { nome: "Valor gerado", valor: brl0(i.orcamentos.valorGerado), antes: <Var atual={i.orcamentos.valorGerado} antes={a.orcamentos?.valorGerado} /> },
            { nome: "Valor fechado", valor: brl0(i.orcamentos.valorFechado), antes: <Var atual={i.orcamentos.valorFechado} antes={a.orcamentos?.valorFechado} /> },
            { nome: "Conversão em valor", valor: pct(i.orcamentos.conversaoValor, 0), antes: <Var atual={i.orcamentos.conversaoValor} antes={a.orcamentos?.conversaoValor} />, destaque: true },
          ]} />
        ) : <p className="text-[11px]" style={{ color: CINZA }}>Planilha de orçamentos não configurada.</p>}
      </div>
      {i.leads && nivel === "completo" && <div><Titulo cor={COR}>Principais objeções</Titulo><Linhas itens={contagens(i.leads.porObjecao, 5, true)} /></div>}
    </div>
  );
}

export function SecReceitasQuinzenal({ r, nivel }: Props) {
  const i = r.indicadores, a = r.anterior;
  const mesA = mesDe(a.periodo.inicio);
  const { linhas, antes } = categoriasReceita(r, nivel);
  return (
    <>
      <table className="w-full text-[11px]">
        <Cabecalho cor={COR} colunas={[{ t: "Categoria" }, { t: `1–15 ${mesA.slice(0, 3)}`, dir: true }, { t: `1–15 ${mesDe(i.periodo.inicio).slice(0, 3)}`, dir: true }, { t: "Variação", dir: true }, { t: "Qtd.", dir: true }, { t: "% fat.", dir: true }]} />
        <tbody>
          {linhas.map((g) => {
            const ga = antes.get(g.nome.trim().toLowerCase());
            return (
              <tr key={g.nome} className="border-b" style={{ borderColor: LINHA }}>
                <td className="py-[4px] pr-2">{g.nome}</td>
                <td className={`${td} text-right`} style={{ color: CINZA }}>{ga?.valor ? brl(ga.valor) : "—"}</td>
                <td className={`${td} pl-3 text-right`}>{g.valor ? brl(g.valor) : "—"}</td>
                <td className={`${td} pl-3 text-right`}><Var atual={g.valor} antes={ga?.valor ?? 0} /></td>
                <td className={`${td} pl-3 text-right`}>{g.quantidade || "—"}</td>
                <td className={`${td} pl-3 text-right`}>{g.valor ? pct(g.pct) : "—"}</td>
              </tr>
            );
          })}
          <tr className="border-t-2 font-semibold" style={{ borderColor: COR }}>
            <td className="py-1.5">Total</td>
            <td className={`${td} text-right`} style={{ color: CINZA }}>{brl(a.faturamento?.total)}</td>
            <td className={`${td} pl-3 text-right`}>{brl(i.faturamento?.total)}</td>
            <td className={`${td} pl-3 text-right`}><Var atual={i.faturamento?.total} antes={a.faturamento?.total} forte /></td>
            <td className={`${td} pl-3 text-right`}>{i.faturamento?.lancamentos}</td>
            <td className={`${td} pl-3 text-right`}>100%</td>
          </tr>
        </tbody>
      </table>
      <p className="text-[10px]" style={{ color: CINZA }}>Comparação com o mesmo período (dia 1 ao 15) de {mesA}.{nivel === "com_valor" ? " Só categorias com movimento." : " Aparecem todas as categorias com faturamento nos últimos 12 meses."}</p>
    </>
  );
}
