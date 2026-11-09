import type { ReactNode } from "react";
import { ordemAlfabetica, rotuloResultado, type GrupoDespesa, type ItemContagem } from "@/lib/fechamentos/indicadores";
import type { ResultadoFechamento } from "@/lib/fechamentos/servidor";
import { cap } from "@/lib/fechamentos/vocabulario";
import { brl, brl0, dataBR, mesAbrev, nomePeriodo, num, pct } from "../../(app)/fechamentos/_components/formato";

/*
 * Relatório mensal em páginas A4, para "Salvar como PDF" no navegador.
 * Ordem aprovada: resultado do mês + funil comercial + experiência do paciente ·
 * receitas detalhadas · despesas detalhadas · faturamento no ano + caixa e competência ·
 * (opcional) análise e plano de ação.
 * Cores fixas (não seguem o tema escuro) para o PDF sair sempre igual.
 */

export const ROXO = "#7B099C";
export const LARANJA = "#FF5001";
const FUNDO = "#F4EFF9";
export const CINZA = "#6B6577";
export const LINHA = "#E9E4EF";
export const VERMELHO = "#C0262D";
export const VERDE = "#0F7A4A";

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

export const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const mesDe = (iso: string) => MESES[Number(iso.slice(5, 7)) - 1];
export const chave = (s: string) => s.trim().toLowerCase();

/* ---------- peças ---------- */

export function Folha({ r, titulo, children, compacta, cor = ROXO, selo }: { r: ResultadoFechamento; titulo: string; children: ReactNode; compacta?: boolean; cor?: string; selo?: string }) {
  const f = r.fechamento;
  return (
    <section className="pdf-folha">
      <header className="mb-5 flex items-end justify-between border-b-2 pb-3" style={{ borderColor: cor }}>
        <div>
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: CINZA }}>
            <span className="rounded px-1.5 py-0.5 text-[9px] text-white" style={{ background: cor }}>{selo ?? (f.tipo === "mensal" ? "Mensal" : "Quinzenal")}</span>
            {r.clinicaNome} · {f.tipo === "mensal" ? "Relatório mensal" : "Relatório quinzenal"} · {nomePeriodo(f.tipo, f.inicio, f.fim)}
          </p>
          <h2 className="font-heading text-xl font-semibold" style={{ color: cor }}>{titulo}</h2>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/gestfy-symbol.png" alt="Gestfy" className="h-7 w-auto" />
      </header>
      <div className={compacta ? "space-y-3" : "space-y-6"}>{children}</div>
    </section>
  );
}

export function Titulo({ children, extra, cor = ROXO }: { children: ReactNode; extra?: ReactNode; cor?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h3 className="font-heading text-[15px] font-semibold" style={{ color: cor }}>{children}</h3>
      {extra ? <span className="text-[10px]" style={{ color: CINZA }}>{extra}</span> : null}
    </div>
  );
}

/**
 * Variação entre dois valores. `custo`: subir é ruim (vermelho).
 * Receita: cair é ruim. Sem base de comparação: "novo" ou "—".
 */
function variacaoDe(atual: number | null | undefined, antes: number | null | undefined) {
  if (atual == null || antes == null) return null;
  if (!antes) return atual ? Infinity : null;
  return atual / antes - 1;
}
export function Var({ atual, antes, custo, forte }: { atual?: number | null; antes?: number | null; custo?: boolean; forte?: boolean }) {
  const v = variacaoDe(atual, antes);
  if (v === null) return <span style={{ color: CINZA }}>—</span>;
  if (v === Infinity) return <span className="font-semibold" style={{ color: custo ? VERMELHO : VERDE }}>novo</span>;
  if (Math.abs(v) < 0.005) return <span style={{ color: CINZA }}>0%</span>;
  const ruim = custo ? v > 0 : v < 0;
  const cor = ruim ? VERMELHO : custo ? CINZA : VERDE;
  return <span className={forte || ruim ? "font-semibold" : ""} style={{ color: cor }}>{v > 0 ? "+" : "−"}{pct(Math.abs(v))}</span>;
}

export function Kpi({ rotulo, valor, nota, fundo = FUNDO }: { rotulo: string; valor: string; nota?: ReactNode; fundo?: string }) {
  return (
    <div className="pdf-bloco rounded-lg p-3" style={{ background: fundo }}>
      <p className="text-[10px] font-medium" style={{ color: CINZA }}>{rotulo}</p>
      <p className="font-heading text-[19px] font-semibold tabular-nums leading-tight">{valor}</p>
      {nota ? <p className="mt-0.5 text-[10px]" style={{ color: CINZA }}>{nota}</p> : null}
    </div>
  );
}

/** Linhas "rótulo ........ valor", como no relatório atual. */
export function Linhas({ itens }: { itens: { nome: string; valor: ReactNode; destaque?: boolean }[] }) {
  if (!itens.length) return <p className="text-[11px]" style={{ color: CINZA }}>Sem dados.</p>;
  return (
    <table className="w-full text-[11.5px]">
      <tbody>
        {itens.map((i) => (
          <tr key={i.nome} className="border-b last:border-0" style={{ borderColor: LINHA }}>
            <td className={`py-[5px] pr-2 ${i.destaque ? "font-semibold" : ""}`}>{i.nome}</td>
            <td className={`whitespace-nowrap py-[5px] text-right tabular-nums ${i.destaque ? "font-semibold" : ""}`}>{i.valor}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
export const contagens = (xs: ItemContagem[], n: number, semNaoInformado = false) =>
  xs.filter((x) => !semNaoInformado || x.nome !== "Não informado").slice(0, n).map((x) => ({ nome: x.nome, valor: num(x.quantidade) }));

export const th = "py-1.5 text-[9.5px] font-semibold uppercase tracking-wide";
export const td = "py-[4px] tabular-nums";

export function Cabecalho({ colunas, cor = ROXO }: { colunas: { t: string; dir?: boolean; cls?: string }[]; cor?: string }) {
  return (
    <thead>
      <tr className="border-b-2" style={{ borderColor: cor }}>
        {colunas.map((c, n) => <th key={c.t + n} className={`${th} ${c.dir ? "text-right" : "text-left"} ${c.cls ?? ""}`} style={{ color: cor }}>{c.t}</th>)}
      </tr>
    </thead>
  );
}

/* ---------- 1. resultado + funil + experiência ---------- */

/** Linhas compactas: faturamento e despesas pagas, mês a mês no ano. */
function GraficoLinhas({ r }: { r: ResultadoFechamento }) {
  const meses = r.anual;
  const real = meses.some((l) => l.recebido != null);
  const max = Math.max(1, ...meses.map((l) => Math.max(l.entradas, l.saidasCaixa, l.recebido ?? 0)));
  const W = 640, H = 150, L = 22, R = 22, T = 18, B = 20, passo = (W - L - R) / Math.max(1, meses.length - 1);
  const x = (n: number) => L + n * passo;
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const mil = (v: number) => `${Math.round(v / 1000)} mil`;
  const pontos = (k: "entradas" | "saidasCaixa") => meses.map((l, n) => `${x(n)},${y(l[k])}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Faturamento e despesas pagas por mês">
      {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke={LINHA} strokeWidth={1} />)}
      <polyline fill="none" stroke={LARANJA} strokeWidth={2} strokeLinejoin="round" points={pontos("saidasCaixa")} />
      <polyline fill="none" stroke={ROXO} strokeWidth={2.5} strokeLinejoin="round" points={pontos("entradas")} />
      {real && <polyline fill="none" stroke={VERDE} strokeWidth={2} strokeDasharray="5 3" strokeLinejoin="round" points={meses.map((l, n) => `${x(n)},${y(l.recebido ?? 0)}`).join(" ")} />}
      {real && meses.map((l, n) => <circle key={`r${l.mes}`} cx={x(n)} cy={y(l.recebido ?? 0)} r={2.5} fill={VERDE} />)}
      {meses.map((l, n) => {
        const ultimo = n === meses.length - 1;
        // Rótulo de cada série do lado em que ela fica (a de cima por cima, a de baixo por baixo).
        const fatEmCima = l.entradas >= l.saidasCaixa;
        return (
          <g key={l.mes}>
            <circle cx={x(n)} cy={y(l.saidasCaixa)} r={2.5} fill={LARANJA} />
            <circle cx={x(n)} cy={y(l.entradas)} r={ultimo ? 4 : 3} fill={ROXO} />
            {l.entradas > 0 && <text x={x(n)} y={y(l.entradas) + (fatEmCima ? -7 : 13)} textAnchor="middle" fontSize={9.5} fontWeight={ultimo ? 700 : 500} fill={ROXO}>{mil(l.entradas)}</text>}
            {l.saidasCaixa > 0 && <text x={x(n)} y={y(l.saidasCaixa) + (fatEmCima ? 13 : -7)} textAnchor="middle" fontSize={9} fill={LARANJA}>{mil(l.saidasCaixa)}</text>}
            <text x={x(n)} y={H - 4} textAnchor="middle" fontSize={10.5} fill={ultimo ? "#1d1b22" : CINZA} fontWeight={ultimo ? 700 : 400}>{mesAbrev(l.mes)}</text>
          </g>
        );
      })}
    </svg>
  );
}



type Nivel = { nivel?: string };

export function SecResultadoMensal({ r }: { r: ResultadoFechamento }) {
  const i = r.indicadores, a = r.anterior;
  const vs = `vs ${mesDe(a.periodo.inicio)}`;
  const n = (atual?: number | null, antes?: number | null, custo?: boolean) => <><Var atual={atual} antes={antes} custo={custo} /> {vs}</>;
  const real = !!i.caixa?.real;
  return (
    <div className="grid grid-cols-4 gap-2.5">
      <Kpi rotulo="Faturamento" valor={brl0(i.faturamento?.total)} nota={n(i.faturamento?.total, a.faturamento?.total)} />
      {real && <Kpi rotulo="Entradas (recebido)" valor={brl0(i.entradas?.total)} nota={n(i.entradas?.total, a.entradas?.total)} />}
      <Kpi rotulo="Despesas pagas" valor={brl0(i.despesas?.total)} nota={n(i.despesas?.total, a.despesas?.total, true)} />
      <Kpi rotulo={rotuloResultado(i.caixa)} valor={brl0(i.caixa?.resultado)} nota={i.caixa?.margem != null ? `${pct(i.caixa.margem)} ${real ? "das entradas" : "do faturamento"}` : undefined} />
      <Kpi rotulo="Atingimento da meta" valor={i.meta ? pct(i.meta.atingimento) : "—"} nota={i.meta ? `meta ${brl0(i.meta.valor)}` : "sem meta"} />
      <Kpi rotulo={`${cap(r.vocab.clientes)} atendidos`} valor={num(i.pacientes?.atendidos)} nota={n(i.pacientes?.atendidos, a.pacientes?.atendidos)} />
      <Kpi rotulo="Ticket médio" valor={brl(i.pacientes?.ticketMedio)} nota={n(i.pacientes?.ticketMedio, a.pacientes?.ticketMedio)} />
      <Kpi rotulo={`${cap(r.vocab.clientes)} novos`} valor={num(i.pacientes?.novos)} nota={n(i.pacientes?.novos, a.pacientes?.novos)} />
      {!real && <Kpi rotulo="Ticket médio dos novos" valor={brl(i.pacientes?.ticketNovos)} nota={n(i.pacientes?.ticketNovos, a.pacientes?.ticketNovos)} />}
    </div>
  );
}

export function SecGrafico({ r }: { r: ResultadoFechamento }) {
  return (
    <div className="pdf-bloco">
      <Titulo extra={<><span className="mr-1 inline-block h-[3px] w-3 align-middle" style={{ background: ROXO }} />Faturamento<span className="ml-3 mr-1 inline-block h-[2px] w-3 align-middle" style={{ background: LARANJA }} />Despesas pagas{r.anual.some((l) => l.recebido != null) && <><span className="ml-3 mr-1 inline-block h-[2px] w-3 align-middle" style={{ background: VERDE }} />Entradas</>}</>}>{r.anual.some((l) => l.recebido != null) ? "Faturamento, entradas e despesas" : "Faturamento e despesas"} em {r.periodo.fim.slice(0, 4)}</Titulo>
      <GraficoLinhas r={r} />
    </div>
  );
}

export function SecFunilLeadsMensal({ r, nivel }: { r: ResultadoFechamento } & Nivel) {
  const i = r.indicadores;
  return (
    <div className="pdf-bloco space-y-4">
      <div>
        <Titulo>Funil de leads</Titulo>
        {i.leads ? (
          <Linhas itens={[
            { nome: "Leads", valor: num(i.leads.total) },
            { nome: "Agendaram", valor: num(i.leads.agendados) },
            { nome: "Conversão", valor: pct(i.leads.conversao, 0), destaque: true },
          ]} />
        ) : <p className="text-[11px]" style={{ color: CINZA }}>Planilha de leads não configurada.</p>}
      </div>
      {i.leads && nivel !== "resumo" && <div><Titulo>Origem</Titulo><Linhas itens={contagens(i.leads.porOrigem, 6)} /></div>}
    </div>
  );
}

export function SecFunilOrcamentosMensal({ r, nivel }: { r: ResultadoFechamento } & Nivel) {
  const i = r.indicadores;
  return (
    <div className="pdf-bloco space-y-4">
      <div>
        <Titulo>Orçamentos</Titulo>
        {i.orcamentos ? (
          <Linhas itens={[
            { nome: "Gerados", valor: `${i.orcamentos.total} · ${brl0(i.orcamentos.valorGerado)}` },
            { nome: "Fechados", valor: `${i.orcamentos.fechados} · ${brl0(i.orcamentos.valorFechado)}` },
            { nome: "Em negociação", valor: `${i.orcamentos.emAberto} · ${brl0(i.orcamentos.valorEmAberto)}` },
            { nome: "Conversão em valor", valor: pct(i.orcamentos.conversaoValor, 0), destaque: true },
          ]} />
        ) : <p className="text-[11px]" style={{ color: CINZA }}>Planilha de orçamentos não configurada.</p>}
      </div>
      {i.leads && nivel !== "resumo" && <div><Titulo>Principais objeções</Titulo><Linhas itens={contagens(i.leads.porObjecao, 5, true)} /></div>}
    </div>
  );
}

export function SecExperiencia({ r }: { r: ResultadoFechamento }) {
  const i = r.indicadores;
  return (
    <div className="pdf-bloco">
      <Titulo>Experiência do {r.vocab.cliente}</Titulo>
      {i.nps || i.google ? (
        <div className="grid grid-cols-4 gap-2.5">
          {i.nps && <Kpi rotulo="NPS" valor={num(i.nps.nps)} nota={`${i.nps.respostas} respostas`} />}
          {i.nps && <Kpi rotulo="Recepção" valor={num(i.nps.notas.recepcao, i.nps.notas.recepcao === 5 ? 1 : 2)} nota="de 5" />}
          {i.nps && <Kpi rotulo="Profissional" valor={num(i.nps.notas.profissional, i.nps.notas.profissional === 5 ? 1 : 2)} nota="de 5" />}
          {i.google && <Kpi rotulo="Google" valor={num(i.google.nota, 1)} nota={`${i.google.avaliacoes} avaliações`} />}
        </div>
      ) : <p className="text-[11px]" style={{ color: CINZA }}>Planilha de NPS não configurada.</p>}
    </div>
  );
}

/** Categorias de receita para as tabelas: catálogo + as que zeraram, em ordem alfabética. */
export function categoriasReceita(r: ResultadoFechamento, nivel?: string) {
  const i = r.indicadores, a = r.anterior;
  const antes = new Map((a.faturamento?.porGrupo ?? []).map((g) => [chave(g.nome), g]));
  const atuais = i.faturamento?.porGrupo ?? [];
  const sumiram = (a.faturamento?.porGrupo ?? []).filter((g) => g.valor > 0 && !atuais.some((x) => chave(x.nome) === chave(g.nome)));
  const linhas = [...atuais, ...sumiram.map((g) => ({ nome: g.nome, valor: 0, quantidade: 0, ticket: 0, pct: 0 }))]
    .filter((g) => nivel !== "com_valor" || g.valor || g.quantidade || antes.get(chave(g.nome))?.valor)
    .sort(ordemAlfabetica);
  return { linhas, antes };
}

/* ---------- 2. receitas ---------- */

export function SecReceitasMensal({ r, nivel }: { r: ResultadoFechamento } & Nivel) {
  const i = r.indicadores, a = r.anterior;
  const { linhas, antes } = categoriasReceita(r, nivel);
  const mesA = mesDe(a.periodo.inicio);
  return (
    <>
      <table className="w-full text-[11px]">
        <Cabecalho colunas={[{ t: "Categoria" }, { t: "Valor", dir: true }, { t: `vs ${mesA.slice(0, 3)}`, dir: true }, { t: "Qtd.", dir: true }, { t: "Ticket médio", dir: true }, { t: `vs ${mesA.slice(0, 3)}`, dir: true }, { t: "% fat.", dir: true }]} />
        <tbody>
          {linhas.map((g) => {
            const ga = antes.get(chave(g.nome));
            return (
              <tr key={g.nome} className="border-b" style={{ borderColor: LINHA }}>
                <td className="py-[4px] pr-2">{g.nome}</td>
                <td className={`${td} text-right`}>{brl(g.valor)}</td>
                <td className={`${td} pl-2 text-right`}><Var atual={g.valor} antes={ga?.valor ?? 0} /></td>
                <td className={`${td} pl-3 text-right`}>{g.quantidade}</td>
                <td className={`${td} pl-3 text-right`}>{g.valor ? brl(g.ticket) : "—"}</td>
                <td className={`${td} pl-2 text-right`}>{g.valor && ga?.valor ? <Var atual={g.ticket} antes={ga.ticket} /> : <span style={{ color: CINZA }}>—</span>}</td>
                <td className={`${td} pl-2 text-right`}>{pct(g.pct)}</td>
              </tr>
            );
          })}
          <tr className="border-t-2 font-semibold" style={{ borderColor: ROXO }}>
            <td className="py-1.5">Total</td>
            <td className={`${td} text-right`}>{brl(i.faturamento?.total)}</td>
            <td className={`${td} pl-2 text-right`}><Var atual={i.faturamento?.total} antes={a.faturamento?.total} forte /></td>
            <td className={`${td} pl-3 text-right`}>{i.faturamento?.lancamentos}</td>
            <td className={`${td} pl-3 text-right`}>{brl(i.pacientes?.ticketMedio)}</td>
            <td className={`${td} pl-2 text-right`}><Var atual={i.pacientes?.ticketMedio} antes={a.pacientes?.ticketMedio} forte /></td>
            <td className={`${td} pl-2 text-right`}>100%</td>
          </tr>
        </tbody>
      </table>
      <p className="text-[10px]" style={{ color: CINZA }}>Variação em relação a {mesA}. O ticket médio do total é por {r.vocab.cliente} atendido; o das categorias, por lançamento.</p>
    </>
  );
}

/* ---------- 3. despesas ---------- */

/** Aumento que merece destaque: mais de 10% e pelo menos R$ 300, ou categoria nova acima de R$ 300. */
const aumentoRelevante = (atual: number, antes: number) => atual - antes >= 300 && (!antes || atual / antes - 1 > 0.1);

export function SecDespesas({ r, nivel }: { r: ResultadoFechamento } & Nivel) {
  const i = r.indicadores, a = r.anterior;
  const temAnterior = !!a.despesas?.total;
  const gruposA = new Map((a.despesas?.porGrupo ?? []).map((g) => [chave(g.nome), g]));
  const catA = new Map((a.despesas?.porGrupo ?? []).flatMap((g) => g.categorias.map((c) => [`${chave(g.nome)}|${chave(c.nome)}`, c.valor] as const)));
  const mesA = mesDe(a.periodo.inicio), mesI = mesDe(i.periodo.inicio);

  const aumentos = temAnterior ? (i.despesas?.porGrupo ?? [])
    .flatMap((g) => g.categorias.map((c) => ({ grupo: g.nome, nome: c.nome, atual: c.valor, antes: catA.get(`${chave(g.nome)}|${chave(c.nome)}`) ?? 0 })))
    .filter((x) => aumentoRelevante(x.atual, x.antes))
    .sort((x, y) => (y.atual - y.antes) - (x.atual - x.antes))
    .slice(0, 4) : [];

  const Linha = ({ nome, atual, antes, grupo }: { nome: string; atual: number; antes: number; grupo?: boolean }) => {
    const alerta = temAnterior && aumentoRelevante(atual, antes);
    return (
      <tr className="border-b" style={{ borderColor: LINHA, background: grupo ? FUNDO : undefined }}>
        <td className={`py-[4px] pr-2 ${grupo ? "pl-1.5 font-semibold" : "pl-5"}`}>{nome}</td>
        <td className={`${td} text-right`} style={{ color: CINZA }}>{temAnterior ? brl(antes) : "—"}</td>
        <td className={`${td} pl-3 text-right ${grupo || alerta ? "font-semibold" : ""}`} style={{ color: alerta ? VERMELHO : undefined }}>{brl(atual)}</td>
        <td className={`${td} pl-3 text-right`}>{temAnterior ? <Var atual={atual} antes={antes} custo /> : "—"}</td>
        <td className={`${td} pl-3 pr-1.5 text-right ${grupo ? "font-semibold" : ""}`} style={{ color: grupo ? undefined : CINZA }}>{pct(i.despesas?.total ? atual / i.despesas.total : null)}</td>
      </tr>
    );
  };

  return (
    <>
      {aumentos.length > 0 && (
        <div className="pdf-bloco">
          <Titulo extra={`regime de caixa · em vermelho, o que subiu mais de 10% (e ao menos R$ 300) em relação a ${mesA}`}>O que mais aumentou</Titulo>
          <div className="grid grid-cols-4 gap-2.5">
            {aumentos.map((x) => (
              <div key={x.grupo + x.nome} className="rounded-lg border-l-[3px] px-3 py-2" style={{ borderColor: VERMELHO, background: "#FCF1F1" }}>
                <p className="truncate text-[10px] font-medium" style={{ color: CINZA }}>{x.nome}</p>
                <p className="font-heading text-[16px] font-semibold tabular-nums leading-tight" style={{ color: VERMELHO }}>{brl0(x.atual)}</p>
                <p className="text-[10px]" style={{ color: CINZA }}>{x.antes ? <><b style={{ color: VERMELHO }}>+{pct(x.atual / x.antes - 1, 0)}</b> · era {brl0(x.antes)}</> : <b style={{ color: VERMELHO }}>não houve em {mesA}</b>}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <table className="w-full text-[10.5px]">
        <Cabecalho colunas={[{ t: "Grupo / categoria", cls: "pl-1.5" }, { t: mesA, dir: true }, { t: mesI, dir: true }, { t: "Variação", dir: true }, { t: "% do total", dir: true, cls: "pr-1.5" }]} />
        <tbody>
          {(i.despesas?.porGrupo ?? []).map((g: GrupoDespesa) => {
            const ga = gruposA.get(chave(g.nome));
            const igual = g.categorias.length === 1 && g.categorias[0].nome === g.nome;
            return [
              <Linha key={g.nome} nome={g.nome} atual={g.valor} antes={ga?.valor ?? 0} grupo />,
              ...(igual || nivel === "grupos" ? [] : g.categorias.map((c) => <Linha key={g.nome + c.nome} nome={c.nome} atual={c.valor} antes={catA.get(`${chave(g.nome)}|${chave(c.nome)}`) ?? 0} />)),
            ];
          })}
          <tr className="border-t-2 font-semibold" style={{ borderColor: ROXO }}>
            <td className="py-1.5 pl-1.5">Total de despesas pagas</td>
            <td className={`${td} text-right`} style={{ color: CINZA }}>{temAnterior ? brl(a.despesas?.total) : "—"}</td>
            <td className={`${td} pl-3 text-right`}>{brl(i.despesas?.total)}</td>
            <td className={`${td} pl-3 text-right`}>{temAnterior ? <Var atual={i.despesas?.total} antes={a.despesas?.total} custo forte /> : "—"}</td>
            <td className={`${td} pl-3 pr-1.5 text-right`}>100%</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

/* ---------- 4. ano: gráfico + caixa + competência ---------- */

function TabelaRegime({ r, regime }: { r: ResultadoFechamento; regime: "caixa" | "competencia" }) {
  const k = regime === "caixa" ? "saidasCaixa" : "saidasCompetencia";
  const real = regime === "caixa" && r.anual.some((l) => l.recebido != null);
  // Caixa com fonte de Entradas: recebido. Sem ela (ou na competência): faturamento.
  const linhas = r.anual.map((l) => ({ ...l, entradas: real ? (l.recebido ?? 0) : l.entradas }));
  const soma = (f: (l: (typeof linhas)[number]) => number) => linhas.reduce((s, l) => s + f(l), 0);
  return (
    <table className="w-full text-[10.5px]">
      <Cabecalho colunas={[{ t: "Mês" }, { t: real ? "Entradas" : "Faturamento", dir: true }, { t: "Var.", dir: true }, { t: regime === "caixa" ? "Despesas pagas" : "Despesas do mês", dir: true }, { t: "Var.", dir: true }, { t: regime === "competencia" ? "Resultado" : real ? "Resultado de caixa" : "Fat. x Desp.", dir: true }]} />
      <tbody>
        {linhas.map((l, n) => {
          const ant = linhas[n - 1];
          const saldo = l.entradas - l[k];
          return (
            <tr key={l.mes} className="border-b" style={{ borderColor: LINHA }}>
              <td className="py-[3px] capitalize">{MESES[Number(l.mes.slice(5, 7)) - 1]}</td>
              <td className={`${td} text-right`}>{brl0(l.entradas)}</td>
              <td className={`${td} pl-2 text-right`}>{ant ? <Var atual={l.entradas} antes={ant.entradas} /> : <span style={{ color: CINZA }}>—</span>}</td>
              <td className={`${td} pl-3 text-right`}>{brl0(l[k])}</td>
              <td className={`${td} pl-2 text-right`}>{ant ? <Var atual={l[k]} antes={ant[k]} custo /> : <span style={{ color: CINZA }}>—</span>}</td>
              <td className={`${td} pl-3 text-right font-semibold`} style={{ color: saldo < 0 ? VERMELHO : undefined }}>{brl0(saldo)}</td>
            </tr>
          );
        })}
        <tr className="border-t-2 font-semibold" style={{ borderColor: ROXO }}>
          <td className="py-1.5">Total</td>
          <td className={`${td} text-right`}>{brl0(soma((l) => l.entradas))}</td><td />
          <td className={`${td} pl-3 text-right`}>{brl0(soma((l) => l[k]))}</td><td />
          <td className={`${td} pl-3 text-right`}>{brl0(soma((l) => l.entradas - l[k]))}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function SecRegimes({ r, nivel }: { r: ResultadoFechamento } & Nivel) {
  return (
    <>
      <div className="pdf-bloco">
        {r.anual.some((l) => l.recebido != null)
          ? <Titulo extra="entradas recebidas − despesas pagas no mês">Regime de caixa</Titulo>
          : <Titulo extra="faturamento − despesas pagas no mês (sem fonte de entradas)">Faturamento x Despesas</Titulo>}
        <TabelaRegime r={r} regime="caixa" />
      </div>
      {nivel !== "caixa" && (
        <div className="pdf-bloco">
          <Titulo extra="faturamento do mês − despesas do mês a que se referem">Regime de competência</Titulo>
          <TabelaRegime r={r} regime="competencia" />
        </div>
      )}
    </>
  );
}

/* ---------- 5. análise (opcional) ---------- */

export function SecAnalise({ r, cor = ROXO }: { r: ResultadoFechamento; cor?: string }) {
  const secoes: [string, string][] = [["Observação", r.texto.observacao], ["Principais destaques", r.texto.destaques], ["Indicadores comerciais", r.texto.comercial], ["Pontos de atenção", r.texto.atencao]];
  return (
    <>
      {secoes.filter(([, t]) => t.trim()).map(([t, corpo]) => (
        <div key={t}><Titulo cor={cor}>{t}</Titulo><div className="whitespace-pre-wrap text-[12px] leading-relaxed">{corpo.trim()}</div></div>
      ))}
      {r.acoes.length > 0 && (
        <div>
          <Titulo cor={cor}>Plano de ação</Titulo>
          <ol className="space-y-2.5">
            {r.acoes.map((x, n) => (
              <li key={x.id} className="pdf-bloco grid grid-cols-[22px_1fr] gap-2 rounded-lg border p-3" style={{ borderColor: LINHA }}>
                <span className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: cor }}>{n + 1}</span>
                <div className="space-y-0.5 text-[11px]">
                  <p className="text-[12px] font-semibold">{x.titulo || "Ação sem título"}</p>
                  {x.descricao && <p>{x.descricao}</p>}
                  <p style={{ color: CINZA }}>
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
    </>
  );
}

export function temAnalise(r: ResultadoFechamento) {
  return [r.texto.observacao, r.texto.destaques, r.texto.comercial, r.texto.atencao].some((t) => t.trim()) || r.acoes.length > 0;
}
