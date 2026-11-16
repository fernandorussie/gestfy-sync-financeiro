"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { regimesAnuais, type LinhaAnual } from "@/lib/fechamentos/indicadores";
import { METRICAS_PADRAO, type Metrica } from "@/lib/fechamentos/metricas";
import { PERIODOS, agruparSugerido, type Agrupar, type Intervalo, type SelecaoPeriodo, type TipoPeriodo } from "@/lib/fechamentos/comparativos";
import type { PontoComparativo } from "@/lib/fechamentos/servidor";
import { formatarIndicador, variacaoIndicador } from "@/lib/fechamentos/formato-indicador";
import { TabelaRegimes } from "../[id]/_components/indicadores";
import { EntreClientes, type ClienteCarteira } from "./entre-clientes";

export type ModoComparativo = "evolucao" | "periodos" | "clientes";
type Formato = Metrica["formato"];

/** Por que um indicador não aparece (sem a fonte, sem a coluna, sem meta). */
const MOTIVO: Record<string, string> = {
  entradas: "sem a planilha de Entradas",
  resultadoCaixa: "sem a planilha de Entradas",
  atingimento: "sem meta de faturamento em todos os meses do período (ou recorte que não fecha meses inteiros)",
  novos: "a planilha de vendas não informa a 1ª vez",
  leads: "sem a planilha de Leads",
  conversaoLeads: "sem a planilha de Leads",
  conversaoOrcamentos: "sem a planilha de Orçamentos",
  nps: "sem a planilha de NPS",
};
const COM_REGIME = new Set(["despesas", "resultado", "margem"]);

interface Serie { id: string; rotulo: string; formato: Formato; melhor: Metrica["melhor"]; personalizada: boolean; pontos: (PontoComparativo & { valor: number })[] }

function montarSeries(pontos: PontoComparativo[], rotulos: Record<string, string>): Serie[] {
  const m = new Map<string, Serie>();
  for (const d of METRICAS_PADRAO) m.set(d.id, { id: d.id, rotulo: rotulos[d.id] ?? d.rotulo, formato: d.formato, melhor: d.melhor, personalizada: false, pontos: [] });
  for (const p of pontos) for (const x of p.metricas) {
    const s = m.get(x.indicador) ?? { id: x.indicador, rotulo: x.rotulo, formato: x.formato, melhor: x.melhor, personalizada: true, pontos: [] };
    if (s.personalizada) s.rotulo = x.rotulo;
    s.pontos.push({ ...p, valor: x.valor });
    m.set(x.indicador, s);
  }
  return [...m.values()];
}

const curto = (v: number, f: Formato) => formatarIndicador(v, f).replace("R$ ", "");

/** Linha da evolução: rótulo de valor só no último, no maior e no menor ponto (o resto aparece ao passar o mouse ou tocar). */
function Linha({ pontos, formato, media }: { pontos: Serie["pontos"]; formato: Formato; media: number }) {
  const W = 760, H = 240, E = 10, B = 28, T = 26;
  const vals = pontos.map((p) => p.valor);
  const lo = Math.min(...vals, media), hi = Math.max(...vals, media);
  const folga = (hi - lo || Math.abs(hi) || 1) * 0.2;
  const min = lo < 0 ? lo - folga : Math.max(0, lo - folga), max = hi + folga;
  const passo = pontos.length > 1 ? (W - 2 * E - 50) / (pontos.length - 1) : 0;
  const x = (n: number) => E + 25 + n * passo;
  const y = (v: number) => T + (1 - (v - min) / (max - min || 1)) * (H - T - B);
  const caminho = pontos.map((p, n) => `${n ? "L" : "M"}${x(n)},${y(p.valor)}`).join(" ");
  const iMax = vals.indexOf(Math.max(...vals)), iMin = vals.indexOf(Math.min(...vals)), iUlt = vals.length - 1;
  const rotulados = new Set([iUlt, iMax, iMin]);
  const cada = Math.ceil(pontos.length / 12);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Evolução do indicador, com a média do período">
      {min < 0 && <line x1={E} x2={W - E} y1={y(0)} y2={y(0)} className="stroke-border" />}
      <line x1={E} x2={W - E} y1={y(media)} y2={y(media)} strokeDasharray="5 4" strokeWidth={1.5} className="stroke-accent" />
      <text x={W - E} y={y(media) - 5} textAnchor="end" className="fill-muted-foreground text-[11px]">média {formatarIndicador(media, formato)}</text>
      <path d={caminho} fill="none" strokeWidth={2.5} className="stroke-primary" />
      {pontos.map((p, n) => {
        const ponto = (
          <g key={p.chave}>
            <circle cx={x(n)} cy={y(p.valor)} r={p.origem === "fechamento" ? 6 : 4.5} strokeWidth={2} strokeDasharray={p.parcial ? "2 2" : undefined}
              className={p.origem === "fechamento" ? "fill-primary stroke-primary" : "fill-background stroke-primary"}>
              <title>{`${p.rotulo}: ${formatarIndicador(p.valor, formato)}${p.parcial ? " (parcial)" : ""} · ${p.origem === "fechamento" ? "fechamento concluído (clique para abrir)" : "calculado das planilhas"}`}</title>
            </circle>
            {rotulados.has(n) && (
              <text x={x(n)} y={y(p.valor) - 11} textAnchor={n === 0 ? "start" : n === iUlt ? "end" : "middle"} className="fill-foreground text-[11px] font-semibold">{curto(p.valor, formato)}</text>
            )}
            {(n % cada === 0 || n === iUlt) && <text x={x(n)} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">{p.rotulo}</text>}
          </g>
        );
        return p.fechamentoId ? <a key={p.chave} href={`/fechamentos/${p.fechamentoId}`}>{ponto}</a> : ponto;
      })}
    </svg>
  );
}

/** Dois períodos lado a lado, em barras horizontais. */
function BarrasPeriodos({ a, b, formato }: { a: { rotulo: string; valor: number } | null; b: { rotulo: string; valor: number } | null; formato: Formato }) {
  const maior = Math.max(Math.abs(a?.valor ?? 0), Math.abs(b?.valor ?? 0)) || 1;
  const linha = (x: { rotulo: string; valor: number } | null, cor: string, nome: string) => (
    <div className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3">
      <span className="truncate text-sm text-muted-foreground">{x?.rotulo ?? nome}</span>
      <div className="h-6 rounded bg-muted">{x && <div className={`h-6 rounded ${cor}`} style={{ width: `${Math.max(2, (Math.abs(x.valor) / maior) * 100)}%` }} />}</div>
      <span className="min-w-24 text-right text-sm font-semibold tabular-nums">{x ? formatarIndicador(x.valor, formato) : "não disponível"}</span>
    </div>
  );
  return <div className="space-y-2">{linha(b, "bg-muted-foreground/40", "Período B")}{linha(a, "bg-primary", "Período A")}</div>;
}

function Stat({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
      <p className="font-heading text-xl font-semibold tabular-nums">{valor}</p>
      {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}

function Segmentos<T extends string>({ rotulo, valor, opcoes, onChange }: { rotulo: string; valor: T; opcoes: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap rounded-md border p-0.5" role="radiogroup" aria-label={rotulo}>
      {opcoes.map(([k, r]) => (
        <button key={k} type="button" role="radio" aria-checked={valor === k} onClick={() => onChange(k)}
          className={`rounded px-3 py-1 text-sm font-medium ${valor === k ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{r}</button>
      ))}
    </div>
  );
}

export function SeletorCliente({ clientes, atual, onChange }: { clientes: { id: string; nome: string }[]; atual: string; onChange?: (id: string) => void }) {
  const router = useRouter();
  return (
    <label className="flex w-full max-w-xs flex-col gap-1.5 text-sm font-medium">Cliente
      <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={atual}
        onChange={(e) => (onChange ? onChange(e.target.value) : router.push(`/fechamentos/comparativos?cliente=${e.target.value}`))}>
        {!atual && <option value="">Escolha um cliente…</option>}
        {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
    </label>
  );
}

const entrada = "h-9 rounded-md border border-input bg-background px-2 text-sm";

/** Escolha da referência do período (qual mês, qual trimestre…), conforme o tipo. */
function Referencia({ tipo, valor, onChange, rotulo = "Qual" }: { tipo: TipoPeriodo; valor: string; onChange: (v: string) => void; rotulo?: string }) {
  const anoHoje = new Date().getFullYear();
  const anos = [anoHoje, anoHoje - 1, anoHoje - 2, anoHoje - 3];
  if (tipo === "12m") return null;
  if (tipo === "ano") return (
    <label className="flex flex-col gap-1 text-sm font-medium">{rotulo}
      <select className={entrada} value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value="">Ano atual</option>
        {anos.slice(1).map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
    </label>
  );
  if (tipo === "semestre" || tipo === "trimestre") {
    const n = tipo === "semestre" ? 2 : 4;
    const ops = anos.flatMap((a) => Array.from({ length: n }, (_, i) => `${a}-${n - i}`));
    return (
      <label className="flex flex-col gap-1 text-sm font-medium">{rotulo}
        <select className={entrada} value={valor} onChange={(e) => onChange(e.target.value)}>
          <option value="">O último já terminado</option>
          {ops.map((o) => { const [a, k] = o.split("-"); return <option key={o} value={o}>{k}º {tipo}/{a}</option>; })}
        </select>
      </label>
    );
  }
  if (tipo === "mes") return <label className="flex flex-col gap-1 text-sm font-medium">{rotulo}<input type="month" className={entrada} value={valor} onChange={(e) => onChange(e.target.value)} /></label>;
  if (tipo === "quinzena") {
    const [mes, q] = valor ? [valor.slice(0, 7), valor.slice(8) || "1"] : ["", "1"];
    return (
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm font-medium">{rotulo}<input type="month" className={entrada} value={mes} onChange={(e) => onChange(e.target.value ? `${e.target.value}-${q}` : "")} /></label>
        <select aria-label="Quinzena" className={entrada} value={q} disabled={!mes} onChange={(e) => onChange(`${mes}-${e.target.value}`)}>
          <option value="1">1ª (1 a 15)</option><option value="2">2ª (16 ao fim)</option>
        </select>
      </div>
    );
  }
  if (tipo === "semana") return <label className="flex flex-col gap-1 text-sm font-medium">{rotulo} (qualquer dia da semana)<input type="date" className={entrada} value={valor} onChange={(e) => onChange(e.target.value)} /></label>;
  const [de, ate] = valor ? valor.split("_") : ["", ""];
  return (
    <div className="flex items-end gap-2">
      <label className="flex flex-col gap-1 text-sm font-medium">De<input type="date" className={entrada} value={de} onChange={(e) => onChange(`${e.target.value}_${ate}`)} /></label>
      <label className="flex flex-col gap-1 text-sm font-medium">Até<input type="date" className={entrada} value={ate} onChange={(e) => onChange(`${de}_${e.target.value}`)} /></label>
    </div>
  );
}

export function ComparativosView(p: {
  clientes: { id: string; nome: string }[];
  clienteId: string;
  modo: ModoComparativo;
  selecao: SelecaoPeriodo;
  agrupar: Agrupar;
  intervalo: Intervalo;
  comp: "anterior" | "ano" | "outro";
  bref: string;
  periodoB: Intervalo | null;
  tamanhosDiferentes: boolean;
  pontos: PontoComparativo[];
  erro: string | null;
  ano: { ano: string; linhas: LinhaAnual[] } | null;
  rotulos: Record<string, string>;
  carteira: ClienteCarteira[];
  selecionados: string[];
}) {
  const router = useRouter();
  const busca = useSearchParams();
  const [carregando, iniciar] = useTransition();
  const ir = (mudar: Record<string, string | null>) => {
    const q = new URLSearchParams(busca.toString());
    q.set("cliente", p.clienteId);
    for (const [k, v] of Object.entries(mudar)) { if (v === null || v === "") q.delete(k); else q.set(k, v); }
    iniciar(() => router.push(`/fechamentos/comparativos?${q}`, { scroll: false }));
  };

  const series = useMemo(() => montarSeries(p.pontos, p.rotulos), [p.pontos, p.rotulos]);
  const comDados = series.filter((s) => s.pontos.length);
  const [id, setId] = useState(busca.get("indicador") ?? "faturamento");
  const serie = comDados.find((s) => s.id === id) ?? comDados[0];
  const escolherIndicador = (v: string) => { setId(v); const q = new URLSearchParams(window.location.search); q.set("indicador", v); window.history.replaceState(null, "", `?${q}`); };

  const [regime, setRegime] = useState<"caixa" | "competencia">("caixa");
  const temRegime = p.modo === "evolucao" && p.agrupar === "mes" && !!serie && COM_REGIME.has(serie.id) && !!p.ano?.linhas.length;
  const pontos = (() => {
    if (!serie) return [];
    if (!(temRegime && regime === "competencia")) return serie.pontos;
    const porMes = new Map((p.ano?.linhas ?? []).map((m) => [m.mes, m]));
    return serie.pontos.flatMap((pt) => {
      const m = porMes.get(pt.chave);
      if (!m) return [];
      const res = m.entradas - m.saidasCompetencia;
      const valor = serie.id === "despesas" ? m.saidasCompetencia : serie.id === "resultado" ? res : m.entradas ? Math.round((res / m.entradas) * 1000) / 10 : 0;
      return [{ ...pt, valor, origem: "planilha" as const, fechamentoId: null }];
    });
  })();

  const opcoesIndicador = (
    <label className="flex w-full max-w-md flex-col gap-1.5 text-sm font-medium">Indicador
      <select className="h-9 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm" value={serie?.id ?? ""} onChange={(e) => escolherIndicador(e.target.value)}>
        <optgroup label="Padrão">
          {series.filter((s) => !s.personalizada).map((s) => (
            <option key={s.id} value={s.id} disabled={!s.pontos.length}>{s.rotulo}{s.pontos.length ? "" : ` — não disponível (${MOTIVO[s.id] ?? "sem dados no período"})`}</option>
          ))}
        </optgroup>
        {comDados.some((s) => s.personalizada) && <optgroup label="Personalizados">{comDados.filter((s) => s.personalizada).map((s) => <option key={s.id} value={s.id}>{s.rotulo}</option>)}</optgroup>}
      </select>
    </label>
  );

  /* ---------- filtros ---------- */
  const tipo = p.selecao.tipo;
  const filtros = (
    <section className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-end gap-4">
        {p.modo !== "clientes" && <SeletorCliente clientes={p.clientes} atual={p.clienteId} onChange={(c) => { const q = new URLSearchParams(busca.toString()); q.set("cliente", c); iniciar(() => router.push(`/fechamentos/comparativos?${q}`, { scroll: false })); }} />}
        <div className="flex flex-col gap-1.5 text-sm font-medium">Comparar
          <Segmentos rotulo="Tipo de comparação" valor={p.modo} onChange={(m) => ir({ modo: m === "evolucao" ? null : m, comp: null, bref: null, ...(m === "clientes" && (p.selecao.tipo === "12m" || p.selecao.tipo === "ano") ? { periodo: "mes", agrupar: null } : {}) })}
            opcoes={[["evolucao", "Evolução"], ["periodos", "Entre períodos"], ["clientes", "Entre clientes"]]} />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">{p.modo === "periodos" ? "Período A" : "Período"}
          <select className={entrada} value={tipo} onChange={(e) => { const t = e.target.value as TipoPeriodo; ir({ periodo: t === "12m" ? null : t, ref: null, atual: null, bref: null, agrupar: p.modo === "evolucao" && agruparSugerido(t) !== "mes" ? agruparSugerido(t) : null }); }}>
            {PERIODOS.map((x) => <option key={x.id} value={x.id}>{x.rotulo}</option>)}
          </select>
        </label>
        <Referencia key={`${tipo}-a`} tipo={tipo} valor={p.selecao.ref ?? ""} onChange={(v) => ir({ ref: v || null })} />
        {tipo !== "livre" && !p.selecao.ref && (
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" checked={!!p.selecao.atual} onChange={(e) => ir({ atual: e.target.checked ? "1" : null })} />
            Incluir o período em andamento
          </label>
        )}
        {p.modo === "evolucao" && (
          <div className="flex flex-col gap-1.5 text-sm font-medium">Agrupar por
            <Segmentos rotulo="Agrupar por" valor={p.agrupar} onChange={(a) => ir({ agrupar: a === "mes" ? null : a })} opcoes={[["mes", "Mês"], ["quinzena", "Quinzena"], ["semana", "Semana"]]} />
          </div>
        )}
        {p.modo === "periodos" && (
          <div className="flex flex-col gap-1.5 text-sm font-medium">Período B
            <Segmentos rotulo="Período B" valor={p.comp} onChange={(c) => ir({ comp: c === "anterior" ? null : c, bref: c === "outro" ? p.bref || (p.selecao.ref ?? "") : null })}
              opcoes={[["anterior", "Anterior"], ["ano", "Mesmo período do ano anterior"], ["outro", "Escolher"]]} />
          </div>
        )}
        {p.modo === "periodos" && p.comp === "outro" && <Referencia key={`${tipo}-b`} tipo={tipo} valor={p.bref} rotulo="Qual (B)" onChange={(v) => ir({ comp: "outro", bref: v || null })} />}
      </div>
      <p className="text-xs text-muted-foreground">
        {p.modo === "periodos" && p.periodoB ? <>A: <b className="font-medium text-foreground">{p.intervalo.rotulo}</b> · B: <b className="font-medium text-foreground">{p.periodoB.rotulo}</b></> : <>Período: <b className="font-medium text-foreground">{p.intervalo.rotulo}</b></>}
      </p>
    </section>
  );

  const aviso = p.erro && (
    <div className="rounded-lg border border-amber-400/60 bg-amber-50 p-4 text-sm dark:bg-amber-950/30" role="alert">
      <b className="font-medium">Não foi possível ler as planilhas do cliente.</b> {p.erro} <span className="block text-muted-foreground">Enquanto isso, aparecem só os períodos com fechamento concluído.</span>
    </div>
  );

  return (
    <div className="space-y-6">
      {filtros}
      {aviso}
      <div className="relative">
        {carregando && (
          <div className="absolute inset-0 z-10 flex items-start justify-center rounded-lg bg-background/70 pt-16 backdrop-blur-[1px]" role="status">
            <span className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-medium shadow-sm"><Loader2 className="h-4 w-4 animate-spin" />Lendo as planilhas e calculando…</span>
          </div>
        )}
        {p.modo === "evolucao" ? evolucao() : p.modo === "periodos" ? entrePeriodos() : (
          <EntreClientes carteira={p.carteira} selecionados={p.selecionados} intervalo={p.intervalo} rotulos={p.rotulos} onSelecionar={(ids) => ir({ clientes: ids.join(",") || null })} />
        )}
      </div>
    </div>
  );

  function evolucao() {
    if (!serie) return <p className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">Sem dados no período escolhido.</p>;
    const vals = pontos.map((x) => x.valor);
    const media = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    const ult = pontos[pontos.length - 1];
    const iMax = vals.indexOf(Math.max(...vals)), iMin = vals.indexOf(Math.min(...vals));
    const vsMedia = ult ? variacaoIndicador(ult.valor, media, serie.formato, serie.melhor) : null;
    return (
      <div className="space-y-6">
        <section className="space-y-4 rounded-lg border bg-card p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            {opcoesIndicador}
            {temRegime && <Segmentos rotulo="Regime" valor={regime} onChange={setRegime} opcoes={[["caixa", "Caixa"], ["competencia", "Competência"]]} />}
          </div>
          {ult && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat rotulo={`Último (${ult.rotulo})`} valor={formatarIndicador(ult.valor, serie.formato)} nota={vsMedia ? `${vsMedia.texto} vs média${ult.parcial ? " · parcial" : ""}` : undefined} />
              <Stat rotulo={`Média de ${pontos.length} ${p.agrupar === "mes" ? (pontos.length === 1 ? "mês" : "meses") : p.agrupar === "quinzena" ? "quinzenas" : "semanas"}`} valor={formatarIndicador(media, serie.formato)} />
              <Stat rotulo="Maior" valor={formatarIndicador(vals[iMax], serie.formato)} nota={pontos[iMax].rotulo} />
              <Stat rotulo="Menor" valor={formatarIndicador(vals[iMin], serie.formato)} nota={pontos[iMin].rotulo} />
            </div>
          )}
          {pontos.length > 1 ? <Linha pontos={pontos} formato={serie.formato} media={media} /> : <p className="text-sm text-muted-foreground">Só um ponto com esse indicador. O gráfico aparece a partir de dois.</p>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-primary" />Fechamento concluído (clique para abrir)</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-primary" />Calculado das planilhas</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-dashed border-primary" />Parcial</span>
            {temRegime && regime === "competencia" && <span>Competência: despesas pelo mês a que se referem ({p.ano!.ano}).</span>}
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {pontos.map((x) => x.fechamentoId
              ? <Link key={x.chave} href={`/fechamentos/${x.fechamentoId}`} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary hover:bg-primary/20"><CheckCircle2 className="h-3 w-3" />{x.rotulo}: {formatarIndicador(x.valor, serie.formato)}</Link>
              : <span key={x.chave} className="rounded-full border px-2.5 py-0.5 text-muted-foreground">{x.rotulo}: {formatarIndicador(x.valor, serie.formato)}{x.parcial ? " (parcial)" : ""}</span>)}
          </div>
        </section>

        <section className="space-y-3 rounded-lg border bg-card p-5">
          <div>
            <h2 className="font-semibold">Caixa x competência{p.ano ? ` em ${p.ano.ano}` : ""}</h2>
            <p className="text-sm text-muted-foreground">Caixa: o que entrou e saiu no mês. Competência: faturamento e despesas do mês a que se referem. Mostra se o resultado do mês foi puxado por pagamentos de outros meses.</p>
          </div>
          {!p.ano ? <p className="text-sm text-muted-foreground">Sem lançamentos no ano para este cliente.</p> : <TabelaRegimes reg={regimesAnuais(p.ano.linhas)} />}
        </section>
      </div>
    );
  }

  function entrePeriodos() {
    const A = p.pontos.find((x) => x.chave === "A") ?? null;
    const B = p.pontos.find((x) => x.chave === "B") ?? null;
    const valor = (pt: PontoComparativo | null, ind: string) => pt?.metricas.find((m) => m.indicador === ind)?.valor ?? null;
    const linhas = series.filter((s) => valor(A, s.id) !== null || valor(B, s.id) !== null || !s.personalizada);
    const sel = serie;
    return (
      <div className="space-y-6">
        {p.tamanhosDiferentes && (
          <p className="rounded-md border border-amber-400/60 bg-amber-50 px-4 py-2.5 text-sm dark:bg-amber-950/30">
            Os dois períodos têm tamanhos diferentes. Totais (faturamento, despesas, leads) não se comparam diretamente; médias e taxas (ticket, margem, conversão, NPS) sim.
          </p>
        )}
        {sel && (
          <section className="space-y-4 rounded-lg border bg-card p-5">
            {opcoesIndicador}
            <BarrasPeriodos formato={sel.formato}
              a={valor(A, sel.id) !== null ? { rotulo: p.intervalo.rotulo, valor: valor(A, sel.id)! } : null}
              b={valor(B, sel.id) !== null ? { rotulo: p.periodoB?.rotulo ?? "B", valor: valor(B, sel.id)! } : null} />
          </section>
        )}
        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Indicador</th>
                  <th className="px-3 py-2 text-right font-medium">B · {p.periodoB?.rotulo}</th>
                  <th className="px-3 py-2 text-right font-medium">A · {p.intervalo.rotulo}</th>
                  <th className="px-4 py-2 text-right font-medium">Variação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((s) => {
                  const a = valor(A, s.id), b = valor(B, s.id);
                  const v = a !== null && b !== null ? variacaoIndicador(a, b, s.formato, s.melhor) : null;
                  return (
                    <tr key={s.id} className={`border-b last:border-0 ${s.id === sel?.id ? "bg-muted/40" : ""}`}>
                      <td className="px-4 py-2 font-medium">{s.rotulo}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{b !== null ? formatarIndicador(b, s.formato) : <span className="text-xs text-muted-foreground">não disponível</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{a !== null ? formatarIndicador(a, s.formato) : <span className="text-xs text-muted-foreground" title={MOTIVO[s.id]}>não disponível</span>}</td>
                      <td className={`px-4 py-2 text-right text-xs font-medium tabular-nums ${v?.tom === "bom" ? "text-emerald-700 dark:text-emerald-400" : v?.tom === "ruim" ? "text-red-700 dark:text-red-400" : "text-muted-foreground"}`}>{v?.texto ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
            {[A, B].filter(Boolean).map((x) => x!.origem === "fechamento" ? `${x!.chave === "A" ? "A" : "B"}: números do fechamento concluído` : `${x!.chave === "A" ? "A" : "B"}: calculado das planilhas`).join(" · ") || "Sem dados nos dois períodos"}.
            {" "}“Não disponível” = o cliente não tem a planilha, a coluna ou a meta para esse indicador.
          </p>
        </section>
      </div>
    );
  }
}
