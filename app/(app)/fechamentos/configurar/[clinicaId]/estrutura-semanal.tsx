"use client";

import { ArrowDown, ArrowUp, X } from "lucide-react";
import {
  KPIS_SEMANAL, MAX_KPIS_LIGADOS, SECOES_SEMANAL, ehKpiPersonalizado, modeloComercial, modeloFinanceiro, tituloDaSecao,
  type EstruturaSemanal, type ItemLigado, type KpiPersonalizado, type KpiSemanal,
} from "@/lib/relatorio/estrutura-semanal";

/** Indicador de fonte personalizada que pode virar card ou linha de contratos. */
export interface IndicadorPersOpcao { id: KpiPersonalizado; rotulo: string }

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
export function EditorSemanal({ valor, onChange, pers = [] }: { valor: EstruturaSemanal; onChange: (v: EstruturaSemanal) => void; pers?: IndicadorPersOpcao[] }) {
  const ordenaveis = valor.secoes.filter((s) => s.id !== "feedbacks");
  const feedbacks = valor.secoes.find((s) => s.id === "feedbacks")!;
  const setSecoes = (secoes: ItemLigado<EstruturaSemanal["secoes"][number]["id"]>[]) => onChange({ ...valor, secoes: [...secoes, feedbacks] });
  const indicadoresLigado = ordenaveis.find((s) => s.id === "indicadores")?.ligado;
  const kpisLigados = valor.kpis.filter((k) => k.ligado).length;
  const kpiInfo = (id: KpiSemanal) => {
    if (!ehKpiPersonalizado(id)) { const d = KPIS_SEMANAL.find((x) => x.id === id)!; return { titulo: d.titulo, fonte: d.fonte }; }
    const p = pers.find((x) => x.id === id);
    return p ? { titulo: p.rotulo.split(" · ")[0], fonte: `Fonte personalizada: ${p.rotulo.split(" · ").slice(1).join(" · ")}` } : { titulo: "Indicador removido", fonte: "Não existe mais na fonte personalizada; tire da lista" };
  };
  const persFora = pers.filter((p) => !valor.kpis.some((k) => k.id === p.id));
  const setTitulo = (id: EstruturaSemanal["secoes"][number]["id"], t: string) => onChange({ ...valor, titulos: { ...valor.titulos, [id]: t } });
  const contratos = valor.contratos ?? [];

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2.5 text-sm">
          <span className="text-muted-foreground">Começar de um modelo:</span>
          <button type="button" onClick={() => onChange(modeloComercial(valor))} className="rounded-md border bg-background px-2.5 py-1 font-medium hover:bg-muted">Comercial</button>
          <button type="button" onClick={() => onChange(modeloFinanceiro(valor))} className="rounded-md border bg-background px-2.5 py-1 font-medium hover:bg-muted">Financeiro e operacional</button>
          <span className="w-full text-xs text-muted-foreground">Comercial: faturamento, NPS, Google e leads. Financeiro e operacional: entradas, saídas, saldo, despesas relevantes, contratos e próximos passos. Depois, ajuste à vontade.</span>
        </div>
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
                  {s.id === "indicadores" && <span className={`text-xs ${kpisLigados > MAX_KPIS_LIGADOS ? "font-medium text-destructive" : "text-muted-foreground"}`}>{kpisLigados} de {valor.kpis.length} cards</span>}
                </div>
                {s.ligado && s.id !== "indicadores" && (
                  <label className="mt-1.5 flex items-center gap-2 pl-10 text-xs text-muted-foreground">Título na imagem
                    <input className="h-7 w-56 rounded-md border border-input bg-background px-2 text-xs text-foreground" maxLength={40} value={valor.titulos?.[s.id] ?? ""} placeholder={d.titulo}
                      onChange={(e) => setTitulo(s.id, e.target.value)} aria-label={`Título de ${d.titulo}`} />
                  </label>
                )}
                {s.id === "contratos" && s.ligado && (
                  <div className="mt-2 space-y-1 pl-10 text-sm">
                    <p className="text-xs text-muted-foreground">Indicadores que viram linhas deste bloco (ex.: “Contratos vencendo em 60 dias: 6”). Na geração dá para editar e acrescentar linhas.</p>
                    {pers.length === 0 && <p className="text-xs text-muted-foreground">Nenhum indicador personalizado ainda. Crie em Fontes de dados → Fontes personalizadas (botão “Modelo: contratos e unidades”).</p>}
                    {pers.map((p) => (
                      <label key={p.id} className="flex items-center gap-2">
                        <input type="checkbox" checked={contratos.includes(p.id)}
                          onChange={(e) => onChange({ ...valor, contratos: e.target.checked ? [...contratos, p.id] : contratos.filter((x) => x !== p.id) })} />
                        {p.rotulo}
                      </label>
                    ))}
                  </div>
                )}
                {s.id === "indicadores" && s.ligado && (
                  <ol className="mt-2 space-y-1 pl-10">
                    {valor.kpis.map((kp, i) => {
                      const dk = kpiInfo(kp.id);
                      return (
                        <li key={kp.id} className="flex items-center gap-2">
                          <Setas rotulo={dk.titulo} k={i} total={valor.kpis.length} mover={(dir) => onChange({ ...valor, kpis: trocar(valor.kpis, i, dir) })} />
                          <label className="flex flex-1 items-start gap-2 text-sm">
                            <input type="checkbox" className="mt-1" checked={kp.ligado} onChange={(e) => onChange({ ...valor, kpis: valor.kpis.map((x, j) => (j === i ? { ...x, ligado: e.target.checked } : x)) })} />
                            <span>{dk.titulo}<span className="block text-xs text-muted-foreground">{dk.fonte}</span></span>
                          </label>
                          {ehKpiPersonalizado(kp.id) && (
                            <button type="button" aria-label={`Tirar o card ${dk.titulo}`} onClick={() => onChange({ ...valor, kpis: valor.kpis.filter((x) => x.id !== kp.id) })} className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
                          )}
                        </li>
                      );
                    })}
                    {!valor.kpis.some((k) => ehKpiPersonalizado(k.id)) && (
                      <li className="pl-6 pt-1 text-xs text-muted-foreground">
                        Para cards como unidades ocupadas, vagas e vacância: em Fontes de dados → Fontes personalizadas, crie a fonte da planilha de contratos com o botão “Modelo: contratos e unidades”. Os indicadores aparecem aqui para escolher.
                      </li>
                    )}
                    {persFora.length > 0 && (
                      <li className="pl-6 pt-1">
                        <select aria-label="Adicionar card de indicador personalizado" className="h-8 rounded-md border border-input bg-background px-2 text-sm" value=""
                          onChange={(e) => e.target.value && onChange({ ...valor, kpis: [...valor.kpis, { id: e.target.value as KpiPersonalizado, ligado: true }] })}>
                          <option value="">+ Card de indicador personalizado…</option>
                          {persFora.map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
                        </select>
                      </li>
                    )}
                  </ol>
                )}
                {s.id === "indicadores" && s.ligado && kpisLigados > MAX_KPIS_LIGADOS && (
                  <p className="mt-1 pl-10 text-xs text-destructive">Até {MAX_KPIS_LIGADOS} cards cabem na imagem (em duas linhas). Desligue {kpisLigados - MAX_KPIS_LIGADOS}.</p>
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
              {s.id === "indicadores" ? "Indicadores" : tituloDaSecao(valor, s.id)}
              {s.id === "indicadores" && indicadoresLigado && <span className="block text-[9.5px] text-white/70">{valor.kpis.filter((k) => k.ligado).map((k) => kpiInfo(k.id).titulo).join(" · ") || "nenhum card"}</span>}
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
