"use client";

import { useState, useTransition } from "react";
import { Calculator, ChevronDown, ChevronUp, EyeOff, Loader2, PlayCircle, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CATALOGO_COMPARAVEL, FORMATOS, OPERACOES, OPERADORES, OPS_FORMULA, PADRAO_FORMULA, descreverIndicador, indicadorVazio, rotuloRef,
  type Filtro, type FontePersonalizada, type IndicadorDef, type OpFormula,
} from "@/lib/fechamentos/fonte-personalizada";
import { formatarIndicador, variacaoIndicador } from "@/lib/fechamentos/formato-indicador";
import type { PreviaFonte } from "@/lib/fechamentos/servidor";
import { previaFonte } from "../../actions";
import type { EstadoConexao } from "./configurar-client";

/*
 * Editor de uma fonte personalizada: planilha + coluna de data e, em cima
 * dela, indicadores montados por seleção (operação, coluna, filtros,
 * agrupamento ou fórmula), com prévia dos números reais.
 */

const campo = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
const campoP = "h-8 rounded-md border border-input bg-background px-2 text-sm";
const EXEMPLOS = ["Contratos", "Cirurgias", "Recall", "Entradas bancárias", "Procedimentos"];

export const novaFonte = (): FontePersonalizada => ({
  id: crypto.randomUUID(), nome: "", sheetId: "", aba: "", colunaData: "", pessoais: [], comparavel: "",
  indicadores: [indicadorVazio({ nome: "Quantidade", operacao: "contar" })],
});

export interface Destino { id: string; rotulo: string }

/** Coluna: lista dos cabeçalhos depois de ler a planilha; antes disso, texto livre (cabeçalho ou letra). */
function Coluna({ valor, cabecalho, onChange, excluir = [], vazio = "—", rotulo }: { valor?: string; cabecalho: string[]; onChange: (v: string) => void; excluir?: string[]; vazio?: string; rotulo: string }) {
  if (!cabecalho.length) {
    return <input className={`${campoP} w-40`} value={valor ?? ""} placeholder="cabeçalho ou letra" aria-label={rotulo} onChange={(e) => onChange(e.target.value)} />;
  }
  const opcoes = cabecalho.filter((h) => !excluir.includes(h));
  return (
    <select className={`${campoP} w-44`} value={valor ?? ""} aria-label={rotulo} onChange={(e) => onChange(e.target.value)}>
      <option value="">{vazio}</option>
      {valor && !opcoes.includes(valor) && <option value={valor}>{rotuloRef(valor)}</option>}
      {opcoes.map((h) => <option key={h} value={h}>{h}</option>)}
    </select>
  );
}

function LinhaFiltro({ f, cabecalho, valores, onChange, onRemover }: { f: Filtro; cabecalho: string[]; valores: Record<string, string[]>; onChange: (f: Filtro) => void; onRemover?: () => void }) {
  const op = OPERADORES.find((o) => o.id === f.op);
  const lista = `vals-${f.coluna}`.replace(/\W/g, "_");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Coluna valor={f.coluna} cabecalho={cabecalho} onChange={(v) => onChange({ ...f, coluna: v })} rotulo="Coluna do filtro" vazio="coluna…" />
      <select className={campoP} value={f.op} aria-label="Condição" onChange={(e) => onChange({ ...f, op: e.target.value as Filtro["op"] })}>
        {OPERADORES.map((o) => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
      </select>
      {!op?.semValor && (
        <>
          <input className={`${campoP} w-44`} value={f.valor ?? ""} list={lista} placeholder={f.op === "igual" || f.op === "diferente" ? "valor (vírgula = ou)" : "valor"} aria-label="Valor"
            onChange={(e) => onChange({ ...f, valor: e.target.value })} />
          <datalist id={lista}>{(valores[f.coluna] ?? []).map((v) => <option key={v} value={v} />)}</datalist>
        </>
      )}
      {onRemover && <button type="button" onClick={onRemover} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Remover filtro"><X className="h-3.5 w-3.5" /></button>}
    </div>
  );
}

function EditorIndicador({ d, onChange, cabecalho, pessoais, valores, termos, destinos }: {
  d: IndicadorDef; onChange: (d: IndicadorDef) => void; cabecalho: string[]; pessoais: string[]; valores: Record<string, string[]>;
  termos: { grupo: string; itens: { id: string; rotulo: string }[] }[]; destinos: Destino[];
}) {
  const set = (p: Partial<IndicadorDef>) => onChange({ ...d, ...p });
  const op = OPERACOES.find((o) => o.id === d.operacao)!;
  const setTermo = (k: number, v: string) => { const t = [...d.termos]; t[k] = v; set({ termos: t }); };
  const setOp = (k: number, v: OpFormula) => { const o = [...d.ops]; o[k] = v; set({ ops: o }); };
  const rot = "text-xs font-medium text-muted-foreground";

  return (
    <div className="space-y-3 border-t bg-muted/20 px-3 py-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1"><span className={rot}>Nome no relatório</span>
          <input className={`${campoP} w-56`} value={d.nome} placeholder="Ex.: Taxa de reagendamento" onChange={(e) => set({ nome: e.target.value })} />
        </label>
        <div className="inline-flex rounded-md border p-0.5" role="radiogroup" aria-label="Tipo de indicador">
          {(["calculo", "formula"] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={d.tipo === t} onClick={() => set(t === "formula" && d.termos.length < 2 ? { tipo: t, termos: ["", ""], ops: ["/"] } : { tipo: t })}
              className={`rounded px-2.5 py-1 text-xs font-medium ${d.tipo === t ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
              {t === "calculo" ? "Cálculo na planilha" : "Fórmula entre indicadores"}
            </button>
          ))}
        </div>
      </div>

      {d.tipo === "calculo" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select className={campoP} value={d.operacao} aria-label="Operação" onChange={(e) => set({ operacao: e.target.value as IndicadorDef["operacao"] })}>
              {OPERACOES.map((o) => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
            </select>
            {op.precisaColuna && (
              <>
                <span className="text-muted-foreground">da coluna</span>
                <Coluna valor={d.coluna} cabecalho={cabecalho} onChange={(v) => set({ coluna: v })} rotulo="Coluna do cálculo" vazio="escolha…"
                  excluir={d.operacao === "distintos" ? [] : pessoais} />
              </>
            )}
          </div>
          {d.operacao === "percentual" && (
            <div className="space-y-1">
              <p className={rot}>Condição (o % é das linhas que atendem a ela)</p>
              <LinhaFiltro f={d.condicao ?? { coluna: "", op: "igual", valor: "" }} cabecalho={cabecalho} valores={valores} onChange={(c) => set({ condicao: c })} />
            </div>
          )}
          <div className="space-y-1.5">
            <p className={rot}>Contar só as linhas em que {d.filtros.length ? "(todas as condições valem juntas)" : "— sem filtro"}</p>
            {d.filtros.map((f, k) => (
              <LinhaFiltro key={k} f={f} cabecalho={cabecalho} valores={valores}
                onChange={(x) => set({ filtros: d.filtros.map((y, j) => (j === k ? x : y)) })} onRemover={() => set({ filtros: d.filtros.filter((_, j) => j !== k) })} />
            ))}
            {d.filtros.length < 6 && <Button size="sm" variant="ghost" onClick={() => set({ filtros: [...d.filtros, { coluna: "", op: "igual", valor: "" }] })}><Plus />Filtro</Button>}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={rot}>Agrupar por</span>
            <Coluna valor={d.agruparPor} cabecalho={cabecalho} onChange={(v) => set({ agruparPor: v || undefined })} rotulo="Agrupar por" vazio="não agrupar" excluir={pessoais} />
            {d.agruparPor && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">mostrar os
                <input type="number" min={3} max={30} className={`${campoP} w-16`} value={d.limite} onChange={(e) => set({ limite: Number(e.target.value) })} /> maiores
              </label>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {d.termos.map((t, k) => (
            <span key={k} className="flex items-center gap-2">
              {k > 0 && (
                <select className={campoP} value={d.ops[k - 1]} aria-label="Operação da fórmula" onChange={(e) => setOp(k - 1, e.target.value as OpFormula)}>
                  {OPS_FORMULA.map((o) => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
                </select>
              )}
              <select className={`${campoP} max-w-56`} value={t} aria-label={`Termo ${k + 1}`} onChange={(e) => setTermo(k, e.target.value)}>
                <option value="">escolha…</option>
                {termos.map((g) => <optgroup key={g.grupo} label={g.grupo}>{g.itens.map((i) => <option key={i.id} value={i.id}>{i.rotulo}</option>)}</optgroup>)}
              </select>
            </span>
          ))}
          {d.termos.length < 3
            ? <Button size="sm" variant="ghost" onClick={() => set({ termos: [...d.termos, ""], ops: [...d.ops, "+"] })}><Plus />Termo</Button>
            : <Button size="sm" variant="ghost" onClick={() => set({ termos: d.termos.slice(0, 2), ops: d.ops.slice(0, 1) })}><X />Tirar 3º termo</Button>}
          {d.termos.length > 2 && <span className="text-xs text-muted-foreground">Calcula da esquerda para a direita: (1º e 2º) e depois o 3º.</span>}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1"><span className={rot}>Formato</span>
          <select className={campoP} value={d.formato} onChange={(e) => set({ formato: e.target.value as IndicadorDef["formato"] })}>
            {FORMATOS.map((f) => <option key={f.id} value={f.id}>{f.rotulo}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1"><span className={rot}>Se subir, é</span>
          <select className={campoP} value={d.melhor} onChange={(e) => set({ melhor: e.target.value as IndicadorDef["melhor"] })}>
            <option value="maior">bom (verde)</option><option value="menor">ruim (vermelho)</option><option value="neutro">neutro</option>
          </select>
        </label>
        <label className="flex flex-col gap-1"><span className={rot}>Onde aparece no relatório</span>
          <select className={`${campoP} w-60`} value={d.oculto ? "__oculto" : d.secao} onChange={(e) => set(e.target.value === "__oculto" ? { oculto: true } : { oculto: false, secao: e.target.value })}>
            {destinos.map((x) => <option key={x.id} value={x.id}>{x.rotulo}</option>)}
            <option value="__oculto">Não mostrar (só para fórmulas)</option>
          </select>
        </label>
      </div>
    </div>
  );
}

export function EditorFontePersonalizada({ clinicaId, f, todas, destinos, onChange, onRemover, onEstado }: {
  clinicaId: string; f: FontePersonalizada; todas: FontePersonalizada[]; destinos: Destino[];
  onChange: (f: FontePersonalizada) => void; onRemover: () => void; onEstado: (e: EstadoConexao) => void;
}) {
  const [previa, setPrevia] = useState<PreviaFonte | null>(null);
  const [mes, setMes] = useState<string>("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [lendo, iniciar] = useTransition();
  const set = (p: Partial<FontePersonalizada>) => onChange({ ...f, ...p });
  const cabecalho = previa?.leitura?.cabecalho ?? [];
  const valores = previa?.leitura?.valores ?? {};

  const ler = (m?: string) => iniciar(async () => {
    const r = await previaFonte({ clinicaId, fonte: f, outras: todas, mes: m || undefined });
    setPrevia(r);
    if (r.periodo) setMes(r.periodo.inicio.slice(0, 7));
    onEstado(r.erro ? { tipo: "erro", texto: r.erro } : r.leitura ? { tipo: "ok", texto: `${r.leitura.linhas} linhas` } : null);
  });

  const nomes = new Map(todas.flatMap((s) => s.indicadores.map((d) => [s.id === f.id ? d.id : `${s.id}.${d.id}`, d.nome || "sem nome"] as const)));
  const termosDe = (atual: IndicadorDef) => [
    { grupo: `Desta fonte (${f.nome || "nova"})`, itens: f.indicadores.filter((d) => d.id !== atual.id).map((d) => ({ id: d.id, rotulo: d.nome || "sem nome" })) },
    ...todas.filter((s) => s.id !== f.id && s.indicadores.length).map((s) => ({ grupo: s.nome || "Outra fonte", itens: s.indicadores.map((d) => ({ id: `${s.id}.${d.id}`, rotulo: d.nome || "sem nome" })) })),
    { grupo: "Indicadores padrão do fechamento", itens: PADRAO_FORMULA.map((p) => ({ id: p.id, rotulo: p.rotulo })) },
  ].filter((g) => g.itens.length);
  const descricao = (d: IndicadorDef) => descreverIndicador(d, (r) => nomes.get(r) ?? PADRAO_FORMULA.find((p) => p.id === r)?.rotulo ?? "?");
  const destino = (d: IndicadorDef) => (d.oculto ? "não aparece" : destinos.find((x) => x.id === d.secao)?.rotulo ?? "seção da fonte");

  const colValor = cabecalho.find((h) => /valor/i.test(h)) ?? "";
  const atalhos: { rotulo: string; novo: () => IndicadorDef }[] = [
    { rotulo: "Quantidade", novo: () => indicadorVazio({ nome: "Quantidade", operacao: "contar" }) },
    { rotulo: "Valor total", novo: () => indicadorVazio({ nome: "Valor total", operacao: "somar", coluna: colValor, formato: "moeda" }) },
    { rotulo: "Valor médio", novo: () => indicadorVazio({ nome: "Valor médio", operacao: "media", coluna: colValor, formato: "moeda" }) },
    { rotulo: "Taxa (%)", novo: () => indicadorVazio({ nome: "Taxa", operacao: "percentual", formato: "percentual", condicao: { coluna: "", op: "igual", valor: "" } }) },
    { rotulo: "Agrupado por…", novo: () => indicadorVazio({ nome: "Por categoria", operacao: "contar", agruparPor: "" }) },
    { rotulo: "Fórmula", novo: () => indicadorVazio({ nome: "", tipo: "formula", termos: ["", ""], ops: ["/"] }) },
  ];
  const adicionar = (d: IndicadorDef) => { set({ indicadores: [...f.indicadores, d] }); setAberto(d.id); };
  const res = previa?.resultado;

  return (
    <div className="space-y-5">
      {/* 1. Planilha */}
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[200px_1fr_160px]">
          <label className="flex flex-col gap-1.5 text-sm font-medium">Nome da fonte
            <input className={campo} value={f.nome} list="exemplos-fonte" placeholder="Ex.: Recall" onChange={(e) => set({ nome: e.target.value })} />
            <datalist id="exemplos-fonte">{EXEMPLOS.map((x) => <option key={x} value={x} />)}</datalist>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">Link da planilha
            <input className={campo} value={f.sheetId} placeholder="https://docs.google.com/spreadsheets/d/…" onChange={(e) => set({ sheetId: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">Nome da aba
            <input className={campo} value={f.aba} placeholder="Ex.: Base" onChange={(e) => set({ aba: e.target.value })} />
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">Coluna de data *
            <Coluna valor={f.colunaData} cabecalho={cabecalho} onChange={(v) => set({ colunaData: v })} rotulo="Coluna de data" vazio="procurar “Data”" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">Linha do cabeçalho
            <input type="number" min={1} max={50} className={`${campoP} w-20`} value={f.linhaCabecalho ?? ""} placeholder="auto" onChange={(e) => set({ linhaCabecalho: e.target.value ? Number(e.target.value) : undefined })} />
          </label>
          <Button size="sm" variant="outline" onClick={() => ler(mes)} disabled={lendo || !f.sheetId || !f.aba}>
            {lendo ? <Loader2 className="animate-spin" /> : <PlayCircle />}{previa ? "Ler de novo e calcular" : "Ler planilha"}
          </Button>
          {previa?.leitura && <span className="text-xs text-muted-foreground">{previa.leitura.linhas} linhas · cabeçalho na linha {previa.leitura.linhaCabecalho}{previa.leitura.totalIgnoradas ? ` · ${previa.leitura.totalIgnoradas} sem data legível` : ""}</span>}
        </div>
        {previa?.erro && <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">{previa.erro}</p>}
        {!cabecalho.length && <p className="text-xs text-muted-foreground">Leia a planilha para escolher as colunas numa lista. Antes disso, dá para escrever o nome do cabeçalho ou a letra.</p>}
      </div>

      {/* 2. Dados pessoais */}
      {cabecalho.length > 0 && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-sm font-medium"><ShieldCheck className="h-4 w-4 text-primary" />Colunas com dado pessoal <span className="font-normal text-muted-foreground">· só servem para contar valores diferentes; nunca aparecem no relatório nem vão para o Claude</span></p>
          <div className="flex flex-wrap gap-1.5">
            {cabecalho.map((h) => {
              const on = f.pessoais.includes(h);
              return (
                <button key={h} type="button" aria-pressed={on} onClick={() => set({ pessoais: on ? f.pessoais.filter((x) => x !== h) : [...f.pessoais, h] })}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>
                  {on && <EyeOff className="h-3 w-3" />}{h}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Indicadores */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Indicadores</p>
          <div className="flex flex-wrap gap-1.5">
            {atalhos.map((a) => <Button key={a.rotulo} size="sm" variant="outline" className="h-7 text-xs" onClick={() => adicionar(a.novo())} disabled={f.indicadores.length >= 20}><Plus className="h-3 w-3" />{a.rotulo}</Button>)}
          </div>
        </div>
        {f.indicadores.length === 0 && <p className="text-sm text-muted-foreground">Nenhum indicador. Use um dos atalhos acima.</p>}
        <ul className="divide-y rounded-md border">
          {f.indicadores.map((d, k) => {
            const r = res?.indicadores.find((x) => x.id === d.id);
            return (
              <li key={d.id}>
                <div className="flex items-center gap-2 px-3 py-2">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setAberto(aberto === d.id ? null : d.id)} aria-expanded={aberto === d.id}>
                    <Calculator className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className={`block text-sm font-medium ${d.oculto ? "text-muted-foreground" : ""}`}>{d.nome || "Sem nome"}</span>
                      <span className="block truncate text-xs text-muted-foreground">{descricao(d)} · {destino(d)}</span>
                    </span>
                  </button>
                  {r && !r.grupos && <span className="shrink-0 text-sm font-semibold tabular-nums">{formatarIndicador(r.atual, r.formato)}</span>}
                  <button type="button" onClick={() => set({ indicadores: f.indicadores.filter((_, j) => j !== k) })} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label={`Remover ${d.nome}`}><Trash2 className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => setAberto(aberto === d.id ? null : d.id)} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label={aberto === d.id ? "Recolher" : "Editar"}>
                    {aberto === d.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
                {aberto === d.id && (
                  <EditorIndicador d={d} cabecalho={cabecalho} pessoais={f.pessoais} valores={valores} termos={termosDe(d)} destinos={destinos}
                    onChange={(x) => set({ indicadores: f.indicadores.map((y, j) => (j === k ? x : y)) })} />
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* 4. Prévia */}
      <div className="space-y-2 rounded-md border bg-muted/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Prévia com os números reais</p>
          <div className="flex items-center gap-2">
            {previa?.leitura?.meses.length ? (
              <select className={campoP} value={mes} aria-label="Mês da prévia" onChange={(e) => { setMes(e.target.value); ler(e.target.value); }}>
                {previa.leitura.meses.slice(0, 24).map((m) => <option key={m} value={m}>{m.split("-").reverse().join("/")}</option>)}
              </select>
            ) : null}
            <Button size="sm" onClick={() => ler(mes)} disabled={lendo || !f.sheetId || !f.aba}>{lendo ? <Loader2 className="animate-spin" /> : <Calculator />}Calcular</Button>
          </div>
        </div>
        {!res ? <p className="text-xs text-muted-foreground">Calcula os indicadores no mês escolhido e compara com o mês anterior, do jeito que vão aparecer no fechamento.</p> : (
          <div className="space-y-3">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1 font-medium">Indicador</th><th className="py-1 text-right font-medium">{mes.split("-").reverse().join("/")}</th><th className="py-1 text-right font-medium">Mês anterior</th><th className="py-1 text-right font-medium">Variação</th></tr></thead>
              <tbody>
                {res.indicadores.map((d) => {
                  const v = variacaoIndicador(d.atual, d.anterior, d.formato, d.melhor);
                  return (
                    <tr key={d.id} className="border-t align-top">
                      <td className="py-1.5 pr-2">
                        {d.nome}
                        {d.grupos && <span className="block text-xs text-muted-foreground">{d.grupos.slice(0, 5).map((g) => `${g.nome}: ${formatarIndicador(g.valor, d.formato)}`).join(" · ") || "sem linhas no mês"}</span>}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{d.grupos ? "—" : formatarIndicador(d.atual, d.formato)}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">{d.grupos ? "—" : formatarIndicador(d.anterior, d.formato)}</td>
                      <td className={`py-1.5 text-right tabular-nums ${v?.tom === "bom" ? "text-emerald-600" : v?.tom === "ruim" ? "text-red-600" : "text-muted-foreground"}`}>{v?.texto ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {previa?.leitura && previa.leitura.amostra.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">Últimas linhas lidas (só as colunas usadas, sem dado pessoal)</summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full">
                    <thead className="text-left text-muted-foreground"><tr><th className="py-1 pr-3 font-medium">Data</th>{Object.keys(previa.leitura.amostra[0].c).map((k) => <th key={k} className="pr-3 font-medium">{rotuloRef(k)}</th>)}</tr></thead>
                    <tbody>{previa.leitura.amostra.map((x, n) => <tr key={n} className="border-t"><td className="py-1 pr-3">{x.data.split("-").reverse().join("/")}</td>{Object.values(x.c).map((v, j) => <td key={j} className="pr-3">{v}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">Comparável entre clientes (benchmarking futuro)
          <select className={`${campo} w-60 text-foreground`} value={f.comparavel ?? ""} onChange={(e) => set({ comparavel: e.target.value })}>
            {CATALOGO_COMPARAVEL.map((c) => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
          </select>
        </label>
        <Button size="sm" variant="ghost" onClick={onRemover}><Trash2 />Remover fonte</Button>
      </div>
    </div>
  );
}
