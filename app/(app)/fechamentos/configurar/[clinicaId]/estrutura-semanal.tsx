"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { KPIS_SEMANAL, SECOES_SEMANAL, type EstruturaSemanal, type ItemLigado } from "@/lib/relatorio/estrutura-semanal";

/** Troca dois itens de lugar, se o destino existir. */
function trocar<T>(lista: T[], k: number, d: -1 | 1): T[] {
  const j = k + d;
  if (j < 0 || j >= lista.length) return lista;
  const n = [...lista];
  [n[k], n[j]] = [n[j], n[k]];
  return n;
}

function Setas({ rotulo, k, total, mover }: { rotulo: string; k: number; total: number; mover: (d: -1 | 1) => void }) {
  return (
    <span className="flex flex-col">
      <button type="button" aria-label={`Subir ${rotulo}`} disabled={k === 0} onClick={() => mover(-1)} className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
      <button type="button" aria-label={`Descer ${rotulo}`} disabled={k === total - 1} onClick={() => mover(1)} className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
    </span>
  );
}

/**
 * Editor do Report Semanal: o infográfico continua com o visual de sempre; aqui
 * se escolhe quais blocos aparecem e em que ordem. Cabeçalho e rodapé são fixos.
 */
export function EditorSemanal({ valor, onChange }: { valor: EstruturaSemanal; onChange: (v: EstruturaSemanal) => void }) {
  const ordenaveis = valor.secoes.filter((s) => s.id !== "feedbacks");
  const feedbacks = valor.secoes.find((s) => s.id === "feedbacks")!;
  const setSecoes = (secoes: ItemLigado<EstruturaSemanal["secoes"][number]["id"]>[]) => onChange({ ...valor, secoes: [...secoes, feedbacks] });
  const indicadoresLigado = ordenaveis.find((s) => s.id === "indicadores")?.ligado;
  const kpisLigados = valor.kpis.filter((k) => k.ligado).length;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
      <div className="space-y-3">
        <ol className="divide-y rounded-md border">
          {ordenaveis.map((s, k) => {
            const d = SECOES_SEMANAL.find((x) => x.id === s.id)!;
            return (
              <li key={s.id} className={`px-3 py-2.5 ${s.ligado ? "" : "bg-muted/40"}`}>
                <div className="flex items-center gap-3">
                  <Setas rotulo={d.titulo} k={k} total={ordenaveis.length} mover={(dir) => setSecoes(trocar(ordenaveis, k, dir))} />
                  <label className="flex min-w-0 flex-1 items-start gap-2.5">
                    <input type="checkbox" className="mt-1" checked={s.ligado} aria-label={`Mostrar ${d.titulo}`}
                      onChange={(e) => setSecoes(ordenaveis.map((x, j) => (j === k ? { ...x, ligado: e.target.checked } : x)))} />
                    <span className="min-w-0">
                      <span className={`block text-sm font-medium ${s.ligado ? "" : "text-muted-foreground line-through decoration-muted-foreground/40"}`}>{d.titulo}</span>
                      <span className="block text-xs text-muted-foreground">{d.descricao}</span>
                    </span>
                  </label>
                  {s.id === "indicadores" && <span className="text-xs text-muted-foreground">{kpisLigados} de {valor.kpis.length} cards</span>}
                </div>
                {s.id === "indicadores" && s.ligado && (
                  <ol className="mt-2 space-y-1 pl-10">
                    {valor.kpis.map((kp, i) => {
                      const dk = KPIS_SEMANAL.find((x) => x.id === kp.id)!;
                      return (
                        <li key={kp.id} className="flex items-center gap-2">
                          <Setas rotulo={dk.titulo} k={i} total={valor.kpis.length} mover={(dir) => onChange({ ...valor, kpis: trocar(valor.kpis, i, dir) })} />
                          <label className="flex items-start gap-2 text-sm">
                            <input type="checkbox" className="mt-1" checked={kp.ligado} onChange={(e) => onChange({ ...valor, kpis: valor.kpis.map((x, j) => (j === i ? { ...x, ligado: e.target.checked } : x)) })} />
                            <span>{dk.titulo}<span className="block text-xs text-muted-foreground">{dk.fonte}</span></span>
                          </label>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </li>
            );
          })}
        </ol>
        <label className="flex items-start gap-2.5 rounded-md border px-3 py-2.5">
          <input type="checkbox" className="mt-1" checked={feedbacks.ligado} onChange={(e) => onChange({ ...valor, secoes: [...ordenaveis, { ...feedbacks, ligado: e.target.checked }] })} />
          <span>
            <span className="block text-sm font-medium">Página de feedbacks</span>
            <span className="block text-xs text-muted-foreground">Segunda imagem com os comentários do NPS e do Google. Mesmo ligada, só é gerada quando pedida na tela do Report Semanal.</span>
          </span>
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Imagem do Report Semanal</p>
        <div className="space-y-1 rounded border bg-[#210246] p-2.5 text-[10.5px] text-white shadow-sm">
          <p className="font-semibold text-[#FF6F03]">REPORT SEMANAL — CLIENTE</p>
          {ordenaveis.filter((s) => s.ligado).map((s) => (
            <div key={s.id} className="rounded bg-white/10 px-2 py-1">
              {SECOES_SEMANAL.find((x) => x.id === s.id)!.titulo}
              {s.id === "indicadores" && indicadoresLigado && <span className="block text-[9.5px] text-white/70">{valor.kpis.filter((k) => k.ligado).map((k) => KPIS_SEMANAL.find((x) => x.id === k.id)!.titulo).join(" · ") || "nenhum card"}</span>}
            </div>
          ))}
          <p className="text-white/40">gestfy</p>
        </div>
        {feedbacks.ligado && <div className="rounded border bg-[#210246] p-2 text-[10.5px] text-white/80">2ª imagem: feedbacks</div>}
        <p className="text-xs text-muted-foreground">O visual é o de sempre. Blocos sem dados na semana (por exemplo, sem alertas escritos) não aparecem na imagem.</p>
      </div>
    </div>
  );
}
