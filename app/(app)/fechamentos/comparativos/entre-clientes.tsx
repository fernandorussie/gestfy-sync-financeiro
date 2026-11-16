"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { METRICAS_PADRAO, type Metrica } from "@/lib/fechamentos/metricas";
import type { Intervalo } from "@/lib/fechamentos/comparativos";
import type { PontoComparativo } from "@/lib/fechamentos/servidor";
import { formatarIndicador } from "@/lib/fechamentos/formato-indicador";
import { indicadoresDoCliente } from "./actions";

export interface ClienteCarteira { id: string; nome: string; porte: string | null; segmento: string | null; uf: string | null }
type Estado = { estado: "carregando" } | { estado: "ok"; ponto: PontoComparativo } | { estado: "erro"; erro: string };

export const MAX_CLIENTES = 6;

/** Taxas e médias: as mais justas para comparar clientes de portes diferentes. */
const JUSTAS = new Set(["margem", "ticket", "conversaoLeads", "conversaoOrcamentos", "nps", "atingimento"]);

/**
 * Comparação entre clientes da carteira, no mesmo período. Só entram
 * indicadores calculados do mesmo jeito para todos: os padrão (Resultado =
 * Faturamento x Despesas) e personalizados marcados como comparáveis com a
 * mesma chave. Cliente sem a fonte fica "não disponível", nunca zero.
 * Uso interno: não vai para PDF nem para o pacote do Claude.
 */
export function EntreClientes({ carteira, selecionados, intervalo, rotulos, onSelecionar }: {
  carteira: ClienteCarteira[];
  selecionados: string[];
  intervalo: Intervalo;
  rotulos: Record<string, string>;
  onSelecionar: (ids: string[]) => void;
}) {
  const [dados, setDados] = useState<Record<string, Estado>>({});
  const [indicador, setIndicador] = useState("margem");
  const chave = `${intervalo.inicio}|${intervalo.fim}`;

  useEffect(() => {
    let vivo = true;
    for (const id of selecionados) {
      // Sem resposta ainda = "carregando" (ver estado()).
      indicadoresDoCliente({ clinicaId: id, inicio: intervalo.inicio, fim: intervalo.fim }).then((r) => {
        if (!vivo) return;
        setDados((d) => ({ ...d, [`${chave}|${id}`]: r.ponto ? { estado: "ok", ponto: r.ponto } : { estado: "erro", erro: r.erro ?? "Sem dados." } }));
      }, () => vivo && setDados((d) => ({ ...d, [`${chave}|${id}`]: { estado: "erro", erro: "Falha ao calcular." } })));
    }
    return () => { vivo = false; };
  }, [selecionados, chave, intervalo.inicio, intervalo.fim]);

  const estado = (id: string): Estado => dados[`${chave}|${id}`] ?? { estado: "carregando" };
  const valor = (id: string, ind: string): Metrica | null => {
    const e = estado(id);
    return e.estado === "ok" ? e.ponto.metricas.find((m) => m.indicador === ind) ?? null : null;
  };

  // Personalizados: só os com a mesma chave de comparação em 2 ou mais clientes.
  const comparaveis = new Map<string, { rotulo: string; formato: Metrica["formato"]; melhor: Metrica["melhor"]; ids: Map<string, number> }>();
  for (const id of selecionados) {
    const e = estado(id);
    if (e.estado !== "ok") continue;
    for (const m of e.ponto.metricas) {
      if (!m.indicador.startsWith("pers:") || !m.comparavel) continue;
      const c = comparaveis.get(m.comparavel) ?? { rotulo: m.rotulo.split(" · ")[0], formato: m.formato, melhor: m.melhor, ids: new Map() };
      c.ids.set(id, m.valor);
      comparaveis.set(m.comparavel, c);
    }
  }
  const linhas: { id: string; rotulo: string; formato: Metrica["formato"]; melhor: Metrica["melhor"]; ler: (cliente: string) => number | null }[] = [
    ...METRICAS_PADRAO.map((d) => ({ id: d.id, rotulo: rotulos[d.id] ?? d.rotulo, formato: d.formato, melhor: d.melhor, ler: (c: string) => valor(c, d.id)?.valor ?? null })),
    ...[...comparaveis.entries()].filter(([, c]) => c.ids.size >= 2).map(([k, c]) => ({ id: `cmp:${k}`, rotulo: `${c.rotulo} (personalizado)`, formato: c.formato, melhor: c.melhor, ler: (cl: string) => c.ids.get(cl) ?? null })),
  ];
  const linha = linhas.find((l) => l.id === indicador) ?? linhas[0];
  const nome = (id: string) => carteira.find((c) => c.id === id)?.nome ?? "—";
  const ranking = selecionados.map((id) => ({ id, v: linha.ler(id) }))
    .sort((a, b) => (a.v === null ? 1 : b.v === null ? -1 : linha.melhor === "menor" ? a.v - b.v : b.v - a.v));
  const maiorAbs = Math.max(1e-9, ...ranking.map((r) => Math.abs(r.v ?? 0)));
  const carregando = selecionados.filter((id) => estado(id).estado === "carregando").length;

  const disponiveis = carteira.filter((c) => !selecionados.includes(c.id));

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h2 className="font-semibold">Clientes comparados</h2>
            <p className="text-sm text-muted-foreground">De 2 a {MAX_CLIENTES} clientes, todos no mesmo período. Uso interno da Gestfy: esta comparação não vai para relatórios.</p>
          </div>
          {selecionados.length < MAX_CLIENTES && disponiveis.length > 0 && (
            <select aria-label="Adicionar cliente" className="h-9 rounded-md border border-input bg-background px-3 text-sm" value=""
              onChange={(e) => e.target.value && onSelecionar([...selecionados, e.target.value])}>
              <option value="">+ Adicionar cliente…</option>
              {disponiveis.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          )}
        </div>
        <ul className="flex flex-wrap gap-2">
          {selecionados.map((id) => {
            const c = carteira.find((x) => x.id === id);
            const e = estado(id);
            return (
              <li key={id} className="inline-flex items-center gap-2 rounded-full border bg-background py-1 pl-3 pr-1 text-sm">
                {e.estado === "carregando" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Carregando" />}
                <span className="font-medium">{c?.nome}</span>
                {(c?.porte || c?.segmento) && <span className="text-xs text-muted-foreground">{[c.segmento, c.porte, c.uf].filter(Boolean).join(" · ")}</span>}
                {e.estado === "erro" && <span className="text-xs text-amber-700 dark:text-amber-400" title={e.erro}>sem dados</span>}
                <button type="button" aria-label={`Tirar ${c?.nome}`} onClick={() => onSelecionar(selecionados.filter((x) => x !== id))} className="rounded-full p-1 text-muted-foreground hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
              </li>
            );
          })}
        </ul>
        {selecionados.length < 2 && <p className="text-sm text-muted-foreground">Adicione pelo menos mais um cliente para comparar.</p>}
        {carregando > 0 && <p className="inline-flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" />Lendo as planilhas: faltam {carregando} de {selecionados.length} clientes…</p>}
      </section>

      {selecionados.length >= 2 && (
        <>
          <section className="space-y-4 rounded-lg border bg-card p-5">
            <label className="flex w-full max-w-md flex-col gap-1.5 text-sm font-medium">Indicador
              <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={linha.id} onChange={(e) => setIndicador(e.target.value)}>
                <optgroup label="Taxas e médias (mais justas entre portes diferentes)">{linhas.filter((l) => JUSTAS.has(l.id)).map((l) => <option key={l.id} value={l.id}>{l.rotulo}</option>)}</optgroup>
                <optgroup label="Totais">{linhas.filter((l) => !JUSTAS.has(l.id) && !l.id.startsWith("cmp:")).map((l) => <option key={l.id} value={l.id}>{l.rotulo}</option>)}</optgroup>
                {linhas.some((l) => l.id.startsWith("cmp:")) && <optgroup label="Personalizados comparáveis">{linhas.filter((l) => l.id.startsWith("cmp:")).map((l) => <option key={l.id} value={l.id}>{l.rotulo}</option>)}</optgroup>}
              </select>
            </label>
            <ol className="space-y-2">
              {ranking.map((r, k) => (
                <li key={r.id} className="grid grid-cols-[1.5rem_minmax(0,12rem)_1fr_auto] items-center gap-3">
                  <span className="text-xs font-semibold text-muted-foreground">{r.v === null ? "" : `${k + 1}º`}</span>
                  <span className="truncate text-sm">{nome(r.id)}</span>
                  <div className="h-6 rounded bg-muted">{r.v !== null && <div className={`h-6 rounded ${k === 0 ? "bg-primary" : "bg-primary/55"}`} style={{ width: `${Math.max(2, (Math.abs(r.v) / maiorAbs) * 100)}%` }} />}</div>
                  <span className="min-w-28 text-right text-sm font-semibold tabular-nums">
                    {estado(r.id).estado === "carregando" ? <span className="text-xs font-normal text-muted-foreground">carregando…</span> : r.v !== null ? formatarIndicador(r.v, linha.formato) : <span className="text-xs font-normal text-muted-foreground">não disponível</span>}
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted-foreground">Ordenado do melhor para o pior{linha.melhor === "menor" ? " (menor é melhor)" : ""}. “Não disponível” = o cliente não tem a planilha, a coluna ou a meta desse indicador; nunca conta como zero.</p>
          </section>

          <section className="overflow-hidden rounded-lg border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Indicador</th>
                    {selecionados.map((id) => <th key={id} className="px-3 py-2 text-right font-medium normal-case">{nome(id)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.id} className={`border-b last:border-0 ${l.id === linha.id ? "bg-muted/40" : ""}`}>
                      <td className="px-4 py-2 font-medium">{l.rotulo}</td>
                      {selecionados.map((id) => {
                        const v = l.ler(id);
                        return <td key={id} className="px-3 py-2 text-right tabular-nums">{estado(id).estado === "carregando" ? <span className="text-xs text-muted-foreground">…</span> : v !== null ? formatarIndicador(v, l.formato) : <span className="text-xs text-muted-foreground">não disponível</span>}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
              Resultado = Faturamento x Despesas, igual para todos. Resultado de caixa só aparece para quem tem a planilha de Entradas. Clientes com o período concluído usam os números do fechamento entregue.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
