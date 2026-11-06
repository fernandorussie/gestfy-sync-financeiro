"use client";

import { useState } from "react";
import { Plus, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ResultadoFechamento } from "@/lib/fechamentos/servidor";
import { rascunho, type Acao, type Acompanhamento, type SecoesTexto, type StatusAcompanhamento, type TextoFechamento } from "@/lib/fechamentos/texto-fechamento";

export interface EstadoAnalise {
  texto: TextoFechamento;
  acoes: Acao[];
  acompanhamento: Acompanhamento[];
}

const SECOES: { chave: keyof SecoesTexto; titulo: string; ajuda: string; linhas: number }[] = [
  { chave: "observacao", titulo: "Observação", ajuda: "Leitura geral do período, em parágrafos.", linhas: 9 },
  { chave: "destaques", titulo: "Principais destaques", ajuda: "Um item por linha, começando com “- ”.", linhas: 6 },
  { chave: "comercial", titulo: "Indicadores comerciais", ajuda: "Leads, orçamentos, marketing, experiência do paciente.", linhas: 6 },
  { chave: "atencao", titulo: "Pontos de atenção", ajuda: "Um item por linha, sempre com número.", linhas: 5 },
];

const campo = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed disabled:opacity-70";

function Responsaveis({ valor, equipe, onChange, desabilitado, id }: { valor: string[]; equipe: string[]; onChange: (v: string[]) => void; desabilitado: boolean; id: string }) {
  const [novo, setNovo] = useState("");
  const adicionar = (nome: string) => {
    const n = nome.trim();
    if (n && !valor.some((v) => v.toLowerCase() === n.toLowerCase())) onChange([...valor, n]);
    setNovo("");
  };
  const sugestoes = equipe.filter((e) => !valor.includes(e));
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">Responsáveis</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {valor.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
            {v}{!desabilitado && <button type="button" aria-label={`Remover ${v}`} onClick={() => onChange(valor.filter((x) => x !== v))}><X className="h-3 w-3" /></button>}
          </span>
        ))}
        {!desabilitado && (
          <>
            <input list={`equipe-${id}`} value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionar(novo); } }}
              placeholder="Nome e Enter" className="h-7 w-40 rounded-md border border-input bg-background px-2 text-xs" aria-label="Adicionar responsável" />
            <datalist id={`equipe-${id}`}>{sugestoes.map((e) => <option key={e} value={e} />)}</datalist>
            {sugestoes.slice(0, 6).map((e) => (
              <button key={e} type="button" onClick={() => adicionar(e)} className="rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted">+ {e}</button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export function Analise({ r, estado, mudar, desabilitado }: { r: ResultadoFechamento; estado: EstadoAnalise; mudar: (e: EstadoAnalise) => void; desabilitado: boolean }) {
  const [confirmarRascunho, setConfirmarRascunho] = useState(false);
  const { texto, acoes, acompanhamento } = estado;
  const temTexto = SECOES.some((s) => texto[s.chave].trim());
  const equipe = [...new Set([...r.equipe, ...acoes.flatMap((a) => a.responsaveis), ...acompanhamento.flatMap((a) => a.responsaveis)])];

  const gerar = () => {
    const novo = rascunho({ clinica: r.clinicaNome, tipo: r.fechamento.tipo, indicadores: r.indicadores, anterior: r.anterior, alertas: r.alertas, decisoes: r.decisoes, ritmo: r.ritmo });
    mudar({ ...estado, texto: { ...texto, ...novo } });
    setConfirmarRascunho(false);
  };
  const setAcao = (i: number, a: Partial<Acao>) => mudar({ ...estado, acoes: acoes.map((x, j) => (j === i ? { ...x, ...a } : x)) });
  const novaAcao = () => mudar({ ...estado, acoes: [...acoes, { id: crypto.randomUUID(), titulo: "", descricao: "", responsaveis: [], prazo: null, indicador: "" }] });
  const setAcomp = (i: number, a: Partial<Acompanhamento>) => mudar({ ...estado, acompanhamento: acompanhamento.map((x, j) => (j === i ? { ...x, ...a } : x)) });

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="space-y-2 rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold">Contexto do período</h2>
          <p className="text-xs text-muted-foreground">O que as planilhas não mostram: ausências, campanhas, pedidos do cliente. Um tópico por linha. Serve de apoio para escrever o texto.</p>
          <textarea className={campo} rows={6} value={texto.contexto} disabled={desabilitado} aria-label="Contexto do período"
            placeholder={"- Black Week em novembro com foco em estética\n- Recepcionista de férias na segunda quinzena"}
            onChange={(e) => mudar({ ...estado, texto: { ...texto, contexto: e.target.value } })} />
        </section>
        <section className="space-y-3 rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold">Ações do fechamento anterior</h2>
          {acompanhamento.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma ação registrada no fechamento anterior desta clínica.</p>
          ) : acompanhamento.map((a, i) => (
            <div key={a.id} className="space-y-1.5 border-b pb-3 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0"><p className="text-sm font-medium">{a.titulo}</p><p className="text-xs text-muted-foreground">{a.responsaveis.join(" + ")}</p></div>
                <select className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={a.status ?? ""} disabled={desabilitado} aria-label="Andamento"
                  onChange={(e) => setAcomp(i, { status: (e.target.value || null) as StatusAcompanhamento | null })}>
                  <option value="">Andamento?</option><option value="concluida">Concluída</option><option value="andamento">Em andamento</option><option value="nao_feita">Não feita</option>
                </select>
              </div>
              <input className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm" placeholder="O que aconteceu (opcional)" value={a.nota} disabled={desabilitado}
                onChange={(e) => setAcomp(i, { nota: e.target.value })} aria-label="Nota" />
            </div>
          ))}
        </section>
      </div>

      <section className="space-y-4 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="text-sm font-semibold">Texto do fechamento</h2><p className="text-xs text-muted-foreground">Vai para o WhatsApp e para a última página do PDF.</p></div>
          {!desabilitado && (confirmarRascunho ? (
            <span className="flex flex-wrap items-center gap-2 text-sm">Substituir o texto atual pelo rascunho?
              <Button size="sm" onClick={gerar}>Substituir</Button><Button size="sm" variant="outline" onClick={() => setConfirmarRascunho(false)}>Cancelar</Button>
            </span>
          ) : (
            <Button size="sm" variant="outline" onClick={() => (temTexto ? setConfirmarRascunho(true) : gerar())}><Sparkles />Gerar rascunho a partir dos números</Button>
          ))}
        </div>
        {SECOES.map((s) => (
          <label key={s.chave} className="block space-y-1.5">
            <span className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-sm font-semibold">{s.titulo}</span><span className="text-xs text-muted-foreground">{s.ajuda}</span></span>
            <textarea className={campo} rows={s.linhas} value={texto[s.chave]} disabled={desabilitado}
              onChange={(e) => mudar({ ...estado, texto: { ...texto, [s.chave]: e.target.value } })} />
          </label>
        ))}
        <p className="text-xs text-muted-foreground">O rascunho usa só os números do fechamento e as decisões da conferência. A análise com IA entra numa próxima etapa.</p>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Plano de ação</h2>
          {!desabilitado && <Button size="sm" variant="outline" onClick={novaAcao}><Plus />Adicionar ação</Button>}
        </div>
        {acoes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma ação ainda. Os reports da Gestfy costumam ter 4.</p>}
        {acoes.map((a, i) => (
          <div key={a.id} className="grid grid-cols-[28px_1fr] gap-3 border-t pt-4 first:border-0 first:pt-0">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">{i + 1}</span>
            <div className="min-w-0 space-y-3">
              <div className="flex gap-2">
                <input className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-medium" placeholder="Título da ação" value={a.titulo} disabled={desabilitado}
                  onChange={(e) => setAcao(i, { titulo: e.target.value })} aria-label="Título da ação" />
                {!desabilitado && <Button size="sm" variant="ghost" aria-label="Remover ação" onClick={() => mudar({ ...estado, acoes: acoes.filter((_, j) => j !== i) })}><Trash2 /></Button>}
              </div>
              <textarea className={campo} rows={2} placeholder="O que fazer" value={a.descricao} disabled={desabilitado} onChange={(e) => setAcao(i, { descricao: e.target.value })} aria-label="Descrição" />
              <Responsaveis id={a.id} valor={a.responsaveis} equipe={equipe} desabilitado={desabilitado} onChange={(v) => setAcao(i, { responsaveis: v })} />
              <div className="grid gap-3 sm:grid-cols-[1fr_170px]">
                <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">Como saber se funcionou
                  <input className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground" value={a.indicador} disabled={desabilitado} onChange={(e) => setAcao(i, { indicador: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">Prazo
                  <input type="date" className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground" value={a.prazo ?? ""} disabled={desabilitado} onChange={(e) => setAcao(i, { prazo: e.target.value || null })} />
                </label>
              </div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
