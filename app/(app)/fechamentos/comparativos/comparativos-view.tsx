"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { estatisticas, type PontoSerie, type SerieComparativo } from "@/lib/fechamentos/historico";
import type { LinhaAnual } from "@/lib/fechamentos/indicadores";
import { formatarIndicador, variacaoIndicador } from "@/lib/fechamentos/formato-indicador";
import { brl0, mesAbrev } from "../_components/formato";

const rotMes = (m: string) => `${mesAbrev(m)}/${m.slice(2, 4)}`;

function Linha({ pontos, formato, media }: { pontos: PontoSerie[]; formato: SerieComparativo["formato"]; media: number }) {
  const W = 760, H = 220, E = 8, B = 26, T = 22;
  const vals = pontos.map((p) => p.valor);
  // Escala justa nos dados (com folga); o zero só entra quando há valor negativo.
  const lo = Math.min(...vals, media), hi = Math.max(...vals, media);
  const folga = (hi - lo || Math.abs(hi) || 1) * 0.18;
  const min = lo < 0 ? lo - folga : Math.max(0, lo - folga), max = hi + folga;
  const passo = pontos.length > 1 ? (W - 2 * E - 40) / (pontos.length - 1) : 0;
  const x = (n: number) => E + 20 + n * passo;
  const y = (v: number) => T + (1 - (v - min) / (max - min || 1)) * (H - T - B);
  const caminho = pontos.map((p, n) => `${n ? "L" : "M"}${x(n)},${y(p.valor)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Evolução do indicador por mês, com a média do período">
      {min < 0 && <line x1={E} x2={W - E} y1={y(0)} y2={y(0)} className="stroke-border" />}
      <line x1={E} x2={W - E} y1={y(media)} y2={y(media)} strokeDasharray="5 4" strokeWidth={1.5} className="stroke-accent"><title>{`Média: ${formatarIndicador(media, formato)}`}</title></line>
      <text x={E} y={y(media) + 14} textAnchor="start" className="fill-muted-foreground text-[11px]">média {formatarIndicador(media, formato)}</text>
      <path d={caminho} fill="none" strokeWidth={2.5} className="stroke-primary" />
      {pontos.map((p, n) => (
        <g key={p.mes}>
          <circle cx={x(n)} cy={y(p.valor)} r={4.5} strokeWidth={2} className={p.definitivo ? "fill-primary stroke-primary" : "fill-background stroke-primary"}>
            <title>{`${rotMes(p.mes)}: ${formatarIndicador(p.valor, formato)} (${ORIGEM[p.origem ?? (p.definitivo ? "fechamento" : "andamento")]})`}</title>
          </circle>
          {pontos.length <= 12 && <text x={x(n)} y={y(p.valor) - 9} textAnchor="middle" className="fill-foreground text-[10.5px] font-medium">{formatarIndicador(p.valor, formato).replace("R$ ", "")}</text>}
          <text x={x(n)} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[11px]">{rotMes(p.mes)}</text>
        </g>
      ))}
    </svg>
  );
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

/** Indicadores que mudam conforme o regime (a receita é sempre pela data de atendimento). */
const COM_REGIME = new Set(["despesas", "resultado", "margem"]);

const ORIGEM = { fechamento: "fechamento concluído", planilha: "calculado das planilhas", andamento: "fechamento em andamento" } as const;

/** Série por competência, a partir do resumo anual das planilhas do cliente. */
function serieCompetencia(base: SerieComparativo, ano: { linhas: LinhaAnual[] } | null): PontoSerie[] {
  return (ano?.linhas ?? []).map((m) => {
    const res = m.entradas - m.saidasCompetencia;
    const valor = base.id === "despesas" ? m.saidasCompetencia : base.id === "resultado" ? res : m.entradas ? Math.round((res / m.entradas) * 1000) / 10 : 0;
    return { mes: m.mes, valor, definitivo: false, id: "", origem: "planilha" as const };
  });
}

export function SeletorCliente({ clientes, atual }: { clientes: { id: string; nome: string }[]; atual: string }) {
  const router = useRouter();
  return (
    <label className="flex w-full max-w-sm flex-col gap-1.5 text-sm font-medium">Cliente
      <select className="h-9 min-w-56 rounded-md border border-input bg-background px-3 text-sm" value={atual}
        onChange={(e) => router.push(`/fechamentos/comparativos?cliente=${e.target.value}`)}>
        {!atual && <option value="">Escolha um cliente…</option>}
        {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
    </label>
  );
}

export function ComparativosView({ series, ano, rotulos }: { series: SerieComparativo[]; ano: { ano: string; linhas: LinhaAnual[] } | null; rotulos: Record<string, string> }) {
  const [id, setId] = useState(series[0]?.id ?? "faturamento");
  const [meses, setMeses] = useState<6 | 12>(12);
  const [regime, setRegime] = useState<"caixa" | "competencia">("caixa");
  const base = series.find((s) => s.id === id) ?? series[0];
  const temRegime = !!base && COM_REGIME.has(base.id) && !!ano?.linhas.length;
  const serie = useMemo(() => (base && temRegime && regime === "competencia" ? { ...base, pontos: serieCompetencia(base, ano) } : base), [base, temRegime, regime, ano]);
  const pontos = useMemo(() => (serie?.pontos ?? []).slice(-meses), [serie, meses]);
  const st = estatisticas(pontos);
  const nome = (s: SerieComparativo) => rotulos[s.id] ?? s.rotulo;

  if (!serie) return <p className="text-sm text-muted-foreground">Ainda não há fechamentos mensais para comparar.</p>;
  const vsMedia = st ? variacaoIndicador(st.ultimo.valor, st.media, serie.formato, serie.melhor) : null;

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">Indicador
            <select className="h-9 min-w-64 rounded-md border border-input bg-background px-3 text-sm" value={serie.id} onChange={(e) => setId(e.target.value)}>
              <optgroup label="Padrão">{series.filter((s) => !s.personalizada).map((s) => <option key={s.id} value={s.id}>{nome(s)}</option>)}</optgroup>
              {series.some((s) => s.personalizada) && <optgroup label="Personalizados">{series.filter((s) => s.personalizada).map((s) => <option key={s.id} value={s.id}>{s.rotulo}</option>)}</optgroup>}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
          {temRegime && (
            <div className="inline-flex rounded-md border p-0.5" role="radiogroup" aria-label="Regime">
              {([["caixa", "Caixa"], ["competencia", "Competência"]] as const).map(([k, r]) => (
                <button key={k} type="button" role="radio" aria-checked={regime === k} onClick={() => setRegime(k)}
                  className={`rounded px-3 py-1 text-sm font-medium ${regime === k ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{r}</button>
              ))}
            </div>
          )}
          <div className="inline-flex rounded-md border p-0.5" role="radiogroup" aria-label="Período">
            {([6, 12] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={meses === m} onClick={() => setMeses(m)}
                className={`rounded px-3 py-1 text-sm font-medium ${meses === m ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{m} meses</button>
            ))}
          </div>
          </div>
        </div>
        {st && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat rotulo={`Último (${rotMes(st.ultimo.mes)})`} valor={formatarIndicador(st.ultimo.valor, serie.formato)} nota={vsMedia ? `${vsMedia.texto} vs média` : undefined} />
            <Stat rotulo={`Média de ${st.meses} ${st.meses === 1 ? "mês" : "meses"}`} valor={formatarIndicador(st.media, serie.formato)} />
            <Stat rotulo="Maior" valor={formatarIndicador(st.maior.valor, serie.formato)} nota={rotMes(st.maior.mes)} />
            <Stat rotulo="Menor" valor={formatarIndicador(st.menor.valor, serie.formato)} nota={rotMes(st.menor.mes)} />
          </div>
        )}
        {pontos.length > 1 ? <Linha pontos={pontos} formato={serie.formato} media={st!.media} /> : <p className="text-sm text-muted-foreground">Só um mês com esse indicador. O gráfico aparece a partir de dois.</p>}
        <p className="text-xs text-muted-foreground">
          {temRegime && regime === "competencia"
            ? `Competência: despesas pelo mês a que se referem, calculadas das planilhas do cliente (${ano!.ano}).`
            : <>Ponto cheio = mês com fechamento concluído (números do fechamento, com os ajustes da conferência). Ponto vazado = calculado direto das planilhas do cliente{temRegime ? ", regime de caixa" : ""}. Meses com fechamento abrem ao clicar abaixo.</>}
        </p>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {pontos.map((p) => p.id
            ? <Link key={p.mes} href={`/fechamentos/${p.id}`} className="rounded-full border px-2 py-0.5 hover:bg-muted">{rotMes(p.mes)}: {formatarIndicador(p.valor, serie.formato)}</Link>
            : <span key={p.mes} className="rounded-full border px-2 py-0.5 text-muted-foreground">{rotMes(p.mes)}: {formatarIndicador(p.valor, serie.formato)}</span>)}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-5">
        <div>
          <h2 className="font-semibold">Caixa x competência{ano ? ` em ${ano.ano}` : ""}</h2>
          <p className="text-sm text-muted-foreground">Caixa: despesa no mês em que foi paga. Competência: no mês a que se refere. Mostra se o resultado do mês foi puxado por pagamentos de outros meses.</p>
        </div>
        {!ano ? <p className="text-sm text-muted-foreground">Aparece depois do primeiro fechamento mensal concluído.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="py-2 font-medium">Mês</th><th className="py-2 text-right font-medium">Entradas</th><th className="py-2 text-right font-medium">Saídas (caixa)</th><th className="py-2 text-right font-medium">Saldo caixa</th><th className="py-2 text-right font-medium">Saídas (competência)</th><th className="py-2 text-right font-medium">Saldo competência</th><th className="py-2 text-right font-medium">Diferença</th></tr>
              </thead>
              <tbody>
                {ano.linhas.map((m) => {
                  const sc = m.entradas - m.saidasCaixa, sp = m.entradas - m.saidasCompetencia;
                  return (
                    <tr key={m.mes} className="border-b last:border-0">
                      <td className="py-1.5 capitalize">{rotMes(m.mes)}</td>
                      <td className="py-1.5 text-right tabular-nums">{brl0(m.entradas)}</td>
                      <td className="py-1.5 text-right tabular-nums">{brl0(m.saidasCaixa)}</td>
                      <td className={`py-1.5 text-right tabular-nums ${sc < 0 ? "text-red-600 dark:text-red-400" : ""}`}>{brl0(sc)}</td>
                      <td className="py-1.5 text-right tabular-nums">{brl0(m.saidasCompetencia)}</td>
                      <td className={`py-1.5 text-right tabular-nums ${sp < 0 ? "text-red-600 dark:text-red-400" : ""}`}>{brl0(sp)}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">{brl0(sc - sp)}</td>
                    </tr>
                  );
                })}
                {(() => {
                  const t = ano.linhas.reduce((a, m) => ({ e: a.e + m.entradas, c: a.c + m.saidasCaixa, p: a.p + m.saidasCompetencia }), { e: 0, c: 0, p: 0 });
                  return (
                    <tr className="bg-muted/60 font-semibold">
                      <td className="py-2">Ano</td><td className="py-2 text-right tabular-nums">{brl0(t.e)}</td><td className="py-2 text-right tabular-nums">{brl0(t.c)}</td>
                      <td className="py-2 text-right tabular-nums">{brl0(t.e - t.c)}</td><td className="py-2 text-right tabular-nums">{brl0(t.p)}</td><td className="py-2 text-right tabular-nums">{brl0(t.e - t.p)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">{brl0(t.p - t.c)}</td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
