"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronDown, ExternalLink, Loader2, Lock, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { defSecao, ehPadrao, estruturaPadrao, normalizarEstrutura, paginar, type EstruturaRelatorio, type ExtraSecao, type ItemSecao, type SecaoPersonalizada, type TipoRelatorio } from "@/lib/fechamentos/estrutura";
import { blocosDa, blocosLigados } from "@/lib/fechamentos/blocos";
import { salvarEstrutura } from "../../actions";

const COR: Record<TipoRelatorio, string> = { mensal: "#7B099C", quinzenal: "#E04800" };

const comSecoes = (fontes: ExtraSecao[], secoes: SecaoPersonalizada[]): ExtraSecao[] => [...fontes, ...secoes.map((x) => ({ id: x.id, nome: x.titulo || "Seção sem nome", tipo: "secao" as const }))];

/** Estrutura não salva vai para o PDF de exemplo pelo endereço (base64url). */
function codificar(itens: ItemSecao[]): string {
  const bytes = new TextEncoder().encode(JSON.stringify(itens));
  let bin = ""; bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function EstruturaRelatorioCard({ clinicaId, inicial, extrasFontes = [], porSecao = {}, indisponiveis = {}, exemplos = {} }: {
  clinicaId: string; inicial: Required<EstruturaRelatorio>; extrasFontes?: ExtraSecao[]; porSecao?: Record<string, string[]>;
  /** Blocos sem dados para este cliente (id → motivo), pelo fechamento mais recente. */
  indisponiveis?: Record<string, string>;
  /** Fechamento mais recente de cada tipo, para o PDF de exemplo. */
  exemplos?: Partial<Record<TipoRelatorio, { id: string; rotulo: string }>>;
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoRelatorio>("mensal");
  const [estrutura, setEstrutura] = useState(inicial);
  const [mudou, setMudou] = useState(false);
  const [salvando, iniciar] = useTransition();
  const itens = estrutura[tipo];
  const extras = comSecoes(extrasFontes, estrutura.secoes);

  /** Cria, renomeia ou remove seções personalizadas, mantendo as listas mensal e quinzenal em dia. */
  const mudarSecoes = (secoes: SecaoPersonalizada[]) => {
    const ex = comSecoes(extrasFontes, secoes);
    setEstrutura({ ...estrutura, secoes, mensal: normalizarEstrutura(estrutura.mensal, "mensal", ex), quinzenal: normalizarEstrutura(estrutura.quinzenal, "quinzenal", ex) });
    setMudou(true);
  };

  const definir = (novos: ItemSecao[]) => { setEstrutura({ ...estrutura, [tipo]: novos }); setMudou(true); };
  const mover = (k: number, d: -1 | 1) => {
    const j = k + d;
    if (j < 0 || j >= itens.length) return;
    const novos = [...itens];
    [novos[k], novos[j]] = [novos[j], novos[k]];
    definir(novos);
  };
  const alterar = (k: number, p: Partial<ItemSecao>) => definir(itens.map((x, j) => (j === k ? { ...x, ...p } : x)));
  const salvar = () => iniciar(async () => {
    const r = await salvarEstrutura({ clinicaId, estrutura });
    if (!r.ok) { toast.error(r.erro); return; }
    setEstrutura(r.dados); setMudou(false); toast.success("Estrutura do relatório salva.");
    router.refresh();
  });
  // Sem a fonte de Entradas, a seção não sai no PDF: fica fora da prévia e avisada na lista.
  const semEntradas = !!indisponiveis["res.entradas"];
  const paginas = paginar(itens.map((x) => (x.id === "entradas" && semEntradas ? { ...x, ativa: false } : x)), tipo, extras);
  const abreSet = new Set(paginas.map((p) => p.secoes[0].id));
  const semIndicadores = !Object.keys(indisponiveis).length;
  /** Liga ou desliga um bloco; a primeira escolha grava a lista completa de ocultos. */
  const alternarBloco = (k: number, id: string, ligar: boolean) => {
    const it = itens[k];
    const atuais = blocosLigados(it, tipo);
    const ocultos = blocosDa(it.id, tipo).filter((b) => !b.obrigatorio && (b.id === id ? !ligar : !atuais.has(b.id))).map((b) => b.id);
    alterar(k, { ocultos });
  };
  /** Atalhos Resumo / Completo: marcam os blocos de detalhe. */
  const atalho = (k: number, nivel: string) => {
    const it = itens[k];
    const ocultos = nivel === "resumo" ? blocosDa(it.id, tipo).filter((b) => b.detalhe).map((b) => b.id) : [];
    alterar(k, { nivel, ocultos });
  };
  const exemplo = exemplos[tipo];

  return (
    <section className="space-y-4 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <h2 className="font-semibold">Estrutura do relatório</h2>
          <p className="text-sm text-muted-foreground">
            Escolha as seções do PDF deste cliente, a ordem e o nível de detalhe. As seções com cadeado formam o padrão mínimo Gestfy e não podem ser ocultadas. Fechamentos já concluídos mantêm a estrutura da época.
          </p>
        </div>
        <div className="inline-flex rounded-md border p-0.5" role="tablist" aria-label="Tipo de relatório">
          {(["mensal", "quinzenal"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tipo === t} onClick={() => setTipo(t)}
              className={`rounded px-3 py-1 text-sm font-medium ${tipo === t ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
              {t === "mensal" ? "Mensal" : "Quinzenal"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
        <ol className="divide-y rounded-md border">
          {itens.map((it, k) => {
            const d = defSecao(it.id, extras);
            if (!d) return null;
            const blocos = blocosDa(it.id, tipo);
            const ligados = blocosLigados(it, tipo);
            return (
              <li key={it.id} className={`px-3 py-2.5 ${it.ativa ? "" : "bg-muted/40"}`}>
               <div className="flex flex-wrap items-center gap-3">
                <span className="flex flex-col">
                  <button type="button" aria-label={`Subir ${d.titulo}`} disabled={k === 0} onClick={() => mover(k, -1)} className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" aria-label={`Descer ${d.titulo}`} disabled={k === itens.length - 1} onClick={() => mover(k, 1)} className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                </span>
                <label className="flex min-w-0 flex-1 items-start gap-2.5">
                  {d.fixa ? (
                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label="Padrão mínimo Gestfy" />
                  ) : (
                    <input type="checkbox" className="mt-1" checked={it.ativa} onChange={(e) => alterar(k, { ativa: e.target.checked })} aria-label={`Mostrar ${d.titulo}`} />
                  )}
                  <span className="min-w-0">
                    <span className={`block text-sm font-medium ${it.ativa ? "" : "text-muted-foreground line-through decoration-muted-foreground/40"}`}>{d.titulo}</span>
                    <span className="block text-xs text-muted-foreground">{d.descricao}{d.fixa ? " · padrão Gestfy" : ""}</span>
                    {it.id === "entradas" && semEntradas && it.ativa && <span className="block text-xs text-amber-700 dark:text-amber-400">Este cliente não tem a fonte de Entradas: a seção não aparece no PDF.</span>}
                    {porSecao[it.id]?.length ? <span className="block text-xs text-primary">+ {porSecao[it.id].join(", ")}</span> : it.id.startsWith("sec:") ? <span className="block text-xs text-amber-700 dark:text-amber-400">Sem indicadores: escolha esta seção em “Onde aparece” nos indicadores das fontes.</span> : null}
                  </span>
                </label>
                {d.niveis && !d.niveisAtalho && (
                  <select className="h-8 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50" value={it.nivel} disabled={!it.ativa}
                    onChange={(e) => alterar(k, { nivel: e.target.value })} aria-label={`Nível de detalhe de ${d.titulo}`}>
                    {d.niveis.map((n) => <option key={n.id} value={n.id}>{n.rotulo}</option>)}
                  </select>
                )}
                {blocos.length > 0 && (
                  <button type="button" disabled={!it.ativa} onClick={() => setAberta(aberta === it.id ? null : it.id)} aria-expanded={aberta === it.id}
                    className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
                    {ligados.size} de {blocos.length} itens<ChevronDown className={`h-3.5 w-3.5 transition-transform ${aberta === it.id ? "rotate-180" : ""}`} />
                  </button>
                )}
               </div>
               {it.ativa && aberta === it.id && (
                <div className="mt-2 space-y-2 pl-10">
                  {d.niveisAtalho && d.niveis && (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-muted-foreground">Atalhos:</span>
                      {d.niveis.map((n) => <button key={n.id} type="button" onClick={() => atalho(k, n.id)} className="rounded border px-2 py-0.5 hover:bg-muted">{n.rotulo}</button>)}
                    </div>
                  )}
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {blocos.map((b) => {
                      const motivo = indisponiveis[b.id];
                      return (
                        <li key={b.id}>
                          <label className={`flex items-start gap-2 text-sm ${motivo ? "text-muted-foreground" : ""}`} title={`${b.fonte}: ${b.regra}`}>
                            {b.obrigatorio ? <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Padrão mínimo Gestfy" />
                              : <input type="checkbox" className="mt-1" checked={ligados.has(b.id)} onChange={(e) => alternarBloco(k, b.id, e.target.checked)} />}
                            <span>
                              {b.rotulo}
                              <span className="block text-[11px] text-muted-foreground">{motivo ? `Sem dados: ${motivo}` : b.fonte}</span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
               )}
               {it.ativa && k > 0 && (
                <label className="mt-1.5 flex items-center gap-2 pl-10 text-xs text-muted-foreground">
                  <input type="checkbox" checked={abreSet.has(it.id)} onChange={(e) => alterar(k, { novaPagina: e.target.checked })} />
                  Começar em página nova
                </label>
               )}
              </li>
            );
          })}
        </ol>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Páginas do PDF</p>
          <div className="flex flex-wrap gap-2 lg:flex-col">
            {paginas.map((p, n) => (
              <div key={p.secoes[0].id} className="w-[118px] rounded border bg-background p-2 shadow-sm lg:w-full">
                <p className="truncate text-[11px] font-semibold" style={{ color: COR[tipo] }}>{n + 1}. {p.titulo}</p>
                <ul className="mt-1 space-y-0.5">
                  {p.secoes.map((s) => {
                    const nb = blocosDa(s.id, tipo).length;
                    return <li key={s.id} className="truncate text-[10.5px] text-muted-foreground">· {defSecao(s.id, extras)?.titulo}{nb ? ` (${blocosLigados(s, tipo).size}/${nb})` : ""}</li>;
                  })}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">No papel, o que não cabe numa folha continua na seguinte, sem cortar cards nem linhas. A análise só aparece quando o fechamento tem texto ou plano de ação; Entradas detalhadas, só com a fonte de Entradas.</p>
          {exemplo ? (
            <a href={`/fechamentos-pdf/${exemplo.id}?previa=${codificar(itens)}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted">
              <ExternalLink className="h-4 w-4" />Ver PDF de exemplo
            </a>
          ) : <p className="text-[11px] text-muted-foreground">O PDF de exemplo aparece depois do primeiro fechamento {tipo} deste cliente.</p>}
          {exemplo && <p className="text-[11px] text-muted-foreground">Usa os dados de {exemplo.rotulo} e esta estrutura, mesmo sem salvar.</p>}
          {semIndicadores && <p className="text-[11px] text-muted-foreground">Os itens sem dados na fonte aparecem depois do primeiro fechamento.</p>}
        </div>
      </div>

      <div className="space-y-2 rounded-md border border-dashed p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Seções personalizadas</p>
            <p className="text-xs text-muted-foreground">Junte indicadores de fontes diferentes numa seção própria (ex.: “Relacionamento” com recall e retorno). Depois de salvar, escolha a seção no indicador, em Fontes de dados.</p>
          </div>
          <Button size="sm" variant="outline" disabled={estrutura.secoes.length >= 10} onClick={() => mudarSecoes([...estrutura.secoes, { id: crypto.randomUUID().slice(0, 8), titulo: "Nova seção" }])}><Plus />Nova seção</Button>
        </div>
        {estrutura.secoes.map((x, k) => (
          <div key={x.id} className="flex items-center gap-2">
            <input className="h-8 w-72 rounded-md border border-input bg-background px-2 text-sm" value={x.titulo} aria-label="Título da seção"
              onChange={(e) => mudarSecoes(estrutura.secoes.map((y, j) => (j === k ? { ...y, titulo: e.target.value } : y)))} />
            <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label={`Remover ${x.titulo}`} onClick={() => mudarSecoes(estrutura.secoes.filter((_, j) => j !== k))}><Trash2 className="h-4 w-4" /></button>
            {porSecao[`sec:${x.id}`]?.length ? <span className="text-xs text-muted-foreground">{porSecao[`sec:${x.id}`].length} indicador(es); se remover, eles vão para o Resultado</span> : null}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="outline" size="sm" disabled={ehPadrao(itens, tipo, extras)} onClick={() => definir(estruturaPadrao(tipo, extras))}><RotateCcw />Voltar ao padrão Gestfy</Button>
        <Button onClick={salvar} disabled={salvando || !mudou}>{salvando ? <Loader2 className="animate-spin" /> : <Save />}Salvar estrutura</Button>
      </div>
    </section>
  );
}
