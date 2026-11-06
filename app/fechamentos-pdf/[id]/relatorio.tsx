import type { ReactNode } from "react";
import type { GrupoDespesa, ItemContagem, ItemValor } from "@/lib/fechamentos/indicadores";
import type { ResultadoFechamento } from "@/lib/fechamentos/servidor";
import { brl, brl0, dataBR, mesAbrev, nomePeriodo, num, pct } from "../../(app)/fechamentos/_components/formato";

/*
 * Relatório do fechamento em páginas A4, para "Salvar como PDF" no navegador.
 * Cores fixas (não seguem o tema escuro) para o PDF sair sempre igual.
 */

const ROXO = "#7B099C";
const LARANJA = "#FF5001";

export const CSS = `
@page { size: A4; margin: 12mm 12mm 14mm; }
html, body { background: #ECEAF0 !important; color: #1d1b22; }
.pdf * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.pdf-folha { width: 210mm; min-height: 297mm; padding: 12mm; margin: 0 auto 8mm; background: #fff; box-shadow: 0 1px 6px rgba(0,0,0,.12); }
.pdf-folha + .pdf-folha { break-before: page; }
.pdf tr, .pdf .pdf-bloco { break-inside: avoid; }
@media print {
  html, body { background: #fff !important; }
  .pdf-sem-impressao { display: none !important; }
  .pdf-folha { width: auto; min-height: 0; padding: 0; margin: 0; box-shadow: none; }
}
`;

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function Folha({ r, titulo, children }: { r: ResultadoFechamento; titulo: string; children: ReactNode }) {
  const f = r.fechamento;
  return (
    <section className="pdf-folha">
      <header className="mb-5 flex items-end justify-between border-b-2 pb-3" style={{ borderColor: ROXO }}>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: LARANJA }}>{r.clinicaNome} · {f.tipo === "mensal" ? "Fechamento mensal" : "Fechamento quinzenal"} · {nomePeriodo(f.tipo, f.inicio, f.fim)}</p>
          <h2 className="font-heading text-xl font-semibold" style={{ color: ROXO }}>{titulo}</h2>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/gestfy-symbol.png" alt="Gestfy" className="h-7 w-auto" />
      </header>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Kpi({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: ReactNode }) {
  return (
    <div className="pdf-bloco rounded-lg border border-[#E4E0EA] p-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-[#6B6577]">{rotulo}</p>
      <p className="font-heading text-[19px] font-semibold tabular-nums leading-tight">{valor}</p>
      {nota ? <p className="mt-0.5 text-[10px] text-[#6B6577]">{nota}</p> : null}
    </div>
  );
}

function Var({ atual, anterior, inverso }: { atual?: number | null; anterior?: number | null; inverso?: boolean }) {
  if (atual == null || !anterior) return <>sem comparativo</>;
  const v = atual / anterior - 1;
  const cor = Math.abs(v) < 0.005 ? "#6B6577" : (inverso ? v < 0 : v > 0) ? "#0F7A4A" : "#C0262D";
  return <><b style={{ color: cor }}>{v > 0 ? "+" : ""}{pct(v)}</b> vs anterior</>;
}

function Titulo({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.1em]" style={{ color: ROXO }}>{children}</h3>;
}

function Barras({ itens, formato }: { itens: { nome: string; v: number; extra?: string }[]; formato: (v: number) => string }) {
  const m = Math.max(1, ...itens.map((i) => i.v));
  if (!itens.length) return <p className="text-[11px] text-[#6B6577]">Sem dados.</p>;
  return (
    <table className="w-full text-[11px]">
      <tbody>
        {itens.map((i) => (
          <tr key={i.nome} className="border-b border-[#EEEBF2] last:border-0">
            <td className="py-1 pr-2">{i.nome}</td>
            <td className="w-[32%] py-1"><div className="h-1.5 overflow-hidden rounded-full bg-[#EEEBF2]"><div className="h-full rounded-full" style={{ width: `${Math.max(2, (i.v / m) * 100)}%`, background: ROXO }} /></div></td>
            <td className="whitespace-nowrap py-1 pl-2 text-right tabular-nums">{formato(i.v)}{i.extra ? <span className="text-[#6B6577]"> {i.extra}</span> : null}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
const contagens = (xs: ItemContagem[], n = 99) => xs.filter((x) => x.nome !== "Não informado").slice(0, n).map((x) => ({ nome: x.nome, v: x.quantidade }));
const valores = (xs: ItemValor[], n = 99) => xs.slice(0, n).map((x) => ({ nome: x.nome, v: x.valor, extra: pct(x.pct, 0) }));

function Grafico({ r }: { r: ResultadoFechamento }) {
  const linhas = r.anual;
  const max = Math.max(1, ...linhas.map((l) => Math.max(l.entradas, l.saidasCaixa)));
  const W = 640, H = 190, L = 6, B = 20, T = 16, passo = (W - 2 * L) / Math.max(1, linhas.length);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Faturamento e despesas pagas por mês">
      {linhas.map((l, i) => {
        const x = L + i * passo + passo * 0.2, w = passo * 0.6, ultimo = i === linhas.length - 1;
        return (
          <g key={l.mes}>
            <rect x={x} y={y(l.entradas)} width={w} height={Math.max(1, H - B - y(l.entradas))} rx={2} fill={ROXO} fillOpacity={ultimo ? 1 : 0.4} />
            {l.entradas > 0 && <text x={x + w / 2} y={y(l.entradas) - 4} textAnchor="middle" fontSize={10} fill="#6B6577">{Math.round(l.entradas / 1000)} mil</text>}
            <text x={x + w / 2} y={H - 5} textAnchor="middle" fontSize={11} fill={ultimo ? "#1d1b22" : "#6B6577"} fontWeight={ultimo ? 600 : 400}>{mesAbrev(l.mes)}</text>
          </g>
        );
      })}
      <polyline fill="none" strokeWidth={2} stroke={LARANJA} points={linhas.map((l, i) => `${L + i * passo + passo / 2},${y(l.saidasCaixa)}`).join(" ")} />
      {linhas.map((l, i) => <circle key={l.mes} cx={L + i * passo + passo / 2} cy={y(l.saidasCaixa)} r={3} fill={LARANJA} />)}
    </svg>
  );
}

const th = "py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#6B6577]";
const td = "py-1 tabular-nums";

function GrupoLinhas({ g }: { g: GrupoDespesa }) {
  const igual = g.categorias.length === 1 && g.categorias[0].nome === g.nome;
  return (
    <>
      <tr className="border-t border-[#E4E0EA] bg-[#F6F3F9] font-semibold"><td className="py-1 pl-1">{g.nome}</td><td className={`${td} text-right`}>{brl(g.valor)}</td><td className={`${td} pr-1 text-right`}>{pct(g.pct)}</td></tr>
      {!igual && g.categorias.map((c) => (
        <tr key={c.nome} className="border-t border-[#EEEBF2]"><td className="py-1 pl-5">{c.nome}</td><td className={`${td} text-right`}>{brl(c.valor)}</td><td className={`${td} pr-1 text-right text-[#6B6577]`}>{pct(c.pct)}</td></tr>
      ))}
    </>
  );
}

function Paragrafos({ texto }: { texto: string }) {
  return <div className="whitespace-pre-wrap text-[12px] leading-relaxed">{texto.trim()}</div>;
}

export function Relatorio({ r }: { r: ResultadoFechamento }) {
  const i = r.indicadores, a = r.anterior, f = r.fechamento;
  const ano = r.periodo.fim.slice(0, 4);
  const soma = (k: "entradas" | "saidasCaixa" | "saidasCompetencia") => r.anual.reduce((s, l) => s + l[k], 0);
  const temTexto = [r.texto.observacao, r.texto.destaques, r.texto.comercial, r.texto.atencao].some((t) => t.trim()) || r.acoes.length > 0;
  const mesAnterior = MESES[(Number(f.inicio.slice(5, 7)) + 10) % 12];

  return (
    <>
      <Folha r={r} titulo="Resultado do período">
        <div className="grid grid-cols-4 gap-2.5">
          <Kpi rotulo="Faturamento (entradas)" valor={brl0(i.faturamento?.total)} nota={<Var atual={i.faturamento?.total} anterior={a.faturamento?.total} />} />
          <Kpi rotulo="Despesas (saídas)" valor={brl0(i.despesas?.total)} nota={<Var atual={i.despesas?.total} anterior={a.despesas?.total} inverso />} />
          <Kpi rotulo="Resultado de caixa" valor={brl0(i.caixa?.resultado)} nota={i.caixa?.margem != null ? `${pct(i.caixa.margem)} da receita` : undefined} />
          <Kpi rotulo="Atingimento da meta" valor={i.meta ? pct(i.meta.atingimento) : "—"} nota={i.meta ? `meta ${brl0(i.meta.valor)}` : "sem meta"} />
          <Kpi rotulo="Pacientes atendidos" valor={num(i.pacientes?.atendidos)} nota={<Var atual={i.pacientes?.atendidos} anterior={a.pacientes?.atendidos} />} />
          <Kpi rotulo="Ticket médio" valor={brl(i.pacientes?.ticketMedio)} nota={<Var atual={i.pacientes?.ticketMedio} anterior={a.pacientes?.ticketMedio} />} />
          <Kpi rotulo="Pacientes novos" valor={num(i.pacientes?.novos)} nota={i.pacientes?.atendidos ? `${pct(i.pacientes.novos / i.pacientes.atendidos, 0)} dos atendidos` : undefined} />
          <Kpi rotulo="Ticket médio dos novos" valor={brl(i.pacientes?.ticketNovos)} nota={`${brl0(i.pacientes?.faturamentoNovos)} com novos`} />
        </div>

        <div className="pdf-bloco">
          <div className="flex items-baseline justify-between">
            <Titulo>Faturamento em {ano}</Titulo>
            <p className="text-[10px] text-[#6B6577]"><span className="mr-1 inline-block h-2 w-2 rounded-sm align-[-1px]" style={{ background: ROXO }} />Faturamento <span className="ml-3 mr-1 inline-block h-2 w-2 rounded-full align-[-1px]" style={{ background: LARANJA }} />Despesas pagas</p>
          </div>
          <Grafico r={r} />
        </div>

        <div className="pdf-bloco">
          <Titulo>Comparativo com o período anterior</Titulo>
          <table className="w-full text-[11px]">
            <thead><tr className="text-left"><th className={th}>Indicador</th><th className={`${th} text-right`}>{f.tipo === "mensal" ? mesAnterior : "Quinzena anterior"}</th><th className={`${th} text-right`}>Atual</th><th className={`${th} text-right`}>Variação</th></tr></thead>
            <tbody>
              {([
                ["Faturamento", a.faturamento?.total, i.faturamento?.total, brl, false],
                ["Despesas pagas", a.despesas?.total, i.despesas?.total, brl, true],
                ["Resultado de caixa", a.caixa?.resultado, i.caixa?.resultado, brl, false],
                ["Pacientes atendidos", a.pacientes?.atendidos, i.pacientes?.atendidos, (v: number) => num(v), false],
                ["Ticket médio", a.pacientes?.ticketMedio, i.pacientes?.ticketMedio, brl, false],
                ["Pacientes novos", a.pacientes?.novos, i.pacientes?.novos, (v: number) => num(v), false],
              ] as [string, number | null | undefined, number | null | undefined, (v: number) => string, boolean][]).map(([nome, ant, atu, fmt, inv]) => (
                <tr key={nome} className="border-t border-[#EEEBF2]">
                  <td className="py-1">{nome}</td>
                  <td className={`${td} text-right`}>{ant == null ? "—" : fmt(ant)}</td>
                  <td className={`${td} text-right font-semibold`}>{atu == null ? "—" : fmt(atu)}</td>
                  <td className={`${td} text-right`}>{nome === "Resultado de caixa" ? "" : <Var atual={atu} anterior={ant} inverso={inv} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Folha>

      <Folha r={r} titulo="Funil comercial e experiência do paciente">
        <div className="grid grid-cols-2 gap-5">
          <div className="pdf-bloco space-y-3">
            <Titulo>Leads</Titulo>
            {i.leads ? (
              <>
                <Barras itens={[{ nome: "Leads chegando", v: i.leads.total }, { nome: "Agendados", v: i.leads.agendados, extra: pct(i.leads.conversao, 0) }]} formato={(v) => num(v)} />
                <div><p className="mb-1 text-[10px] font-semibold text-[#6B6577]">Origem</p><Barras itens={contagens(i.leads.porOrigem, 6)} formato={(v) => num(v)} /></div>
                <div><p className="mb-1 text-[10px] font-semibold text-[#6B6577]">Principais objeções</p><Barras itens={contagens(i.leads.porObjecao, 5)} formato={(v) => num(v)} /></div>
                <div><p className="mb-1 text-[10px] font-semibold text-[#6B6577]">Serviço mais buscado</p><Barras itens={contagens(i.leads.porInteresse, 4)} formato={(v) => num(v)} /></div>
              </>
            ) : <p className="text-[11px] text-[#6B6577]">Planilha de leads não configurada.</p>}
          </div>
          <div className="pdf-bloco space-y-3">
            <Titulo>Orçamentos</Titulo>
            {i.orcamentos ? (
              <>
                <Barras itens={[{ nome: "Gerados", v: i.orcamentos.total }, { nome: "Fechados", v: i.orcamentos.fechados, extra: pct(i.orcamentos.conversaoQuantidade, 0) }, { nome: "Em aberto", v: i.orcamentos.emAberto }, { nome: "Não fecharam", v: i.orcamentos.naoFechou }]} formato={(v) => num(v)} />
                <div><p className="mb-1 text-[10px] font-semibold text-[#6B6577]">Valores</p>
                  <Barras itens={[{ nome: "Prescrito", v: i.orcamentos.valorGerado }, { nome: "Fechado", v: i.orcamentos.valorFechado, extra: pct(i.orcamentos.conversaoValor, 0) }, { nome: "Em aberto", v: i.orcamentos.valorEmAberto }]} formato={brl0} />
                </div>
              </>
            ) : <p className="text-[11px] text-[#6B6577]">Planilha de orçamentos não configurada.</p>}
          </div>
        </div>

        <div className="pdf-bloco">
          <Titulo>Experiência do paciente</Titulo>
          {i.nps ? (
            <div className="grid grid-cols-5 gap-2.5">
              <Kpi rotulo="NPS" valor={num(i.nps.nps)} nota={`${i.nps.respostas} respostas`} />
              <Kpi rotulo="Profissional" valor={num(i.nps.notas.profissional, 2)} nota="de 5" />
              <Kpi rotulo="Recepção" valor={num(i.nps.notas.recepcao, 2)} nota="de 5" />
              <Kpi rotulo="Infraestrutura" valor={num(i.nps.notas.infraestrutura, 2)} nota="de 5" />
              <Kpi rotulo="Enfermagem" valor={num(i.nps.notas.enfermagem, 2)} nota="de 5" />
            </div>
          ) : <p className="text-[11px] text-[#6B6577]">Planilha de NPS não configurada.</p>}
          {i.nps && <p className="mt-2 text-[10px] text-[#6B6577]">Promotores {i.nps.promotores} · neutros {i.nps.neutros} · detratores {i.nps.detratores}</p>}
          {i.google && <p className="mt-1 text-[11px]">Avaliações no Google: <b>{i.google.avaliacoes}</b> novas, nota média <b>{num(i.google.nota, 1)}</b></p>}
        </div>
      </Folha>

      <Folha r={r} titulo="Receitas detalhadas">
        <div className="pdf-bloco">
          <table className="w-full text-[11px]">
            <thead><tr className="text-left"><th className={th}>Grupo</th><th className={`${th} text-right`}>Valor</th><th className={`${th} text-right`}>Qtd.</th><th className={`${th} text-right`}>Ticket médio</th><th className={`${th} text-right`}>%</th></tr></thead>
            <tbody>
              {i.faturamento?.porGrupo.map((g) => (
                <tr key={g.nome} className="border-t border-[#EEEBF2]"><td className="py-1">{g.nome}</td><td className={`${td} text-right`}>{brl(g.valor)}</td><td className={`${td} text-right`}>{g.quantidade}</td><td className={`${td} text-right`}>{g.valor ? brl(g.ticket) : "—"}</td><td className={`${td} text-right`}>{pct(g.pct)}</td></tr>
              ))}
              <tr className="border-t-2 font-semibold" style={{ borderColor: ROXO }}><td className="py-1.5">Total</td><td className={`${td} text-right`}>{brl(i.faturamento?.total)}</td><td className={`${td} text-right`}>{i.faturamento?.lancamentos}</td><td /><td className={`${td} text-right`}>100%</td></tr>
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-3 gap-5">
          <div className="pdf-bloco"><Titulo>Por profissional</Titulo><Barras itens={valores(i.faturamento?.porProfissional ?? [], 8)} formato={brl0} /></div>
          <div className="pdf-bloco"><Titulo>Por unidade</Titulo><Barras itens={valores(i.faturamento?.porUnidade ?? [], 8)} formato={brl0} /></div>
          <div className="pdf-bloco"><Titulo>Meio de pagamento</Titulo><Barras itens={valores(i.faturamento?.porPagamento ?? [], 8)} formato={brl0} /></div>
        </div>
      </Folha>

      <Folha r={r} titulo="Despesas detalhadas por grupo e categoria">
        <table className="w-full text-[11px]">
          <thead><tr className="text-left"><th className={`${th} pl-1`}>Grupo / categoria</th><th className={`${th} text-right`}>Valor</th><th className={`${th} pr-1 text-right`}>%</th></tr></thead>
          <tbody>
            {i.despesas?.porGrupo.map((g) => <GrupoLinhas key={g.nome} g={g} />)}
            <tr className="border-t-2 font-semibold" style={{ borderColor: ROXO }}><td className="py-1.5 pl-1">Total de despesas pagas</td><td className={`${td} text-right`}>{brl(i.despesas?.total)}</td><td className={`${td} pr-1 text-right`}>100%</td></tr>
          </tbody>
        </table>
      </Folha>

      <Folha r={r} titulo={`Resultado anual ${ano}: regime de caixa e de competência`}>
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left"><th className={th}>Mês</th><th className={`${th} text-right`}>Entradas</th><th className={`${th} text-right`}>Saídas (caixa)</th><th className={`${th} text-right`}>Saldo (caixa)</th><th className={`${th} text-right`}>Gastos (competência)</th><th className={`${th} text-right`}>Saldo (competência)</th></tr>
          </thead>
          <tbody>
            {r.anual.map((l) => (
              <tr key={l.mes} className="border-t border-[#EEEBF2]"><td className="py-1 capitalize">{MESES[Number(l.mes.slice(5, 7)) - 1]}</td><td className={`${td} text-right`}>{brl0(l.entradas)}</td><td className={`${td} text-right`}>{brl0(l.saidasCaixa)}</td><td className={`${td} text-right`}>{brl0(l.entradas - l.saidasCaixa)}</td><td className={`${td} text-right`}>{brl0(l.saidasCompetencia)}</td><td className={`${td} text-right`}>{brl0(l.entradas - l.saidasCompetencia)}</td></tr>
            ))}
            <tr className="border-t-2 font-semibold" style={{ borderColor: ROXO }}><td className="py-1.5">Total</td><td className={`${td} text-right`}>{brl0(soma("entradas"))}</td><td className={`${td} text-right`}>{brl0(soma("saidasCaixa"))}</td><td className={`${td} text-right`}>{brl0(soma("entradas") - soma("saidasCaixa"))}</td><td className={`${td} text-right`}>{brl0(soma("saidasCompetencia"))}</td><td className={`${td} text-right`}>{brl0(soma("entradas") - soma("saidasCompetencia"))}</td></tr>
          </tbody>
        </table>
        <p className="text-[10px] text-[#6B6577]">Regime de caixa: despesas no mês em que foram pagas. Regime de competência: despesas no mês a que se referem. A receita segue a data de atendimento nos dois regimes.</p>
      </Folha>

      {temTexto && (
        <Folha r={r} titulo="Análise e plano de ação">
          {r.texto.observacao.trim() && <div className="pdf-bloco"><Titulo>Observação</Titulo><Paragrafos texto={r.texto.observacao} /></div>}
          {r.texto.destaques.trim() && <div><Titulo>Principais destaques</Titulo><Paragrafos texto={r.texto.destaques} /></div>}
          {r.texto.comercial.trim() && <div><Titulo>Indicadores comerciais</Titulo><Paragrafos texto={r.texto.comercial} /></div>}
          {r.texto.atencao.trim() && <div><Titulo>Pontos de atenção</Titulo><Paragrafos texto={r.texto.atencao} /></div>}
          {r.acoes.length > 0 && (
            <div>
              <Titulo>Plano de ação</Titulo>
              <ol className="space-y-2.5">
                {r.acoes.map((x, n) => (
                  <li key={x.id} className="pdf-bloco grid grid-cols-[22px_1fr] gap-2 rounded-lg border border-[#E4E0EA] p-3">
                    <span className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: ROXO }}>{n + 1}</span>
                    <div className="space-y-0.5 text-[11px]">
                      <p className="text-[12px] font-semibold">{x.titulo || "Ação sem título"}</p>
                      {x.descricao && <p>{x.descricao}</p>}
                      <p className="text-[#6B6577]">
                        {x.responsaveis.length ? <>Responsável: <b className="text-[#1d1b22]">{x.responsaveis.join(" + ")}</b></> : "Sem responsável"}
                        {x.prazo && <> · até {dataBR(x.prazo)}</>}
                        {x.indicador && <> · Como medir: {x.indicador}</>}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Folha>
      )}
    </>
  );
}

