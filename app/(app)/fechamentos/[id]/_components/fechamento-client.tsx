"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ResultadoFechamento } from "@/lib/fechamentos/servidor";
import type { AcaoDecisao, Decisao } from "@/lib/fechamentos/decisoes";
import { decidirAlerta, desfazerDecisao, recalcular, salvarMetaAjustada } from "../../actions";
import { StatusFechamento } from "../../_components/status";
import { brl0, dataBR, nomePeriodo } from "../../_components/formato";
import { Conferencia } from "./conferencia";
import { PainelIndicadores } from "./indicadores";

const NOME_FONTE: Record<string, string> = { vendas: "Vendas", despesas: "Despesas", orcamentos: "Orçamentos", leads: "Leads", nps: "NPS", avaliacoes: "Avaliações" };

export type Decidir = (chave: string, acao: AcaoDecisao, escolha?: Decisao["escolha"]) => void;

export function FechamentoClient({ inicial }: { inicial: ResultadoFechamento }) {
  const [r, setR] = useState(inicial);
  const [aba, setAba] = useState<"conferencia" | "indicadores">(inicial.pendentesGraves ? "conferencia" : "indicadores");
  const [ocupado, iniciar] = useTransition();
  const [meta, setMeta] = useState(inicial.fechamento.meta_ajustada ? String(inicial.fechamento.meta_ajustada) : "");
  const f = r.fechamento;

  const executar = (fn: () => Promise<{ ok: true; dados: ResultadoFechamento } | { ok: false; erro: string }>, sucesso?: string) =>
    iniciar(async () => {
      const res = await fn();
      if (!res.ok) { toast.error(res.erro); return; }
      setR(res.dados);
      if (sucesso) toast.success(sucesso);
    });

  const decidir: Decidir = (chave, acao, escolha) => executar(() => decidirAlerta({ id: f.id, chave, acao, escolha }));
  const desfazer = (chave: string) => executar(() => desfazerDecisao({ id: f.id, chave }));
  const lerDeNovo = () => executar(() => recalcular(f.id, true), "Planilhas lidas de novo.");
  const salvarMeta = () => {
    const v = Number(meta.replace(/\./g, "").replace(",", "."));
    executar(() => salvarMetaAjustada({ id: f.id, valor: meta.trim() ? v : null }), "Meta ajustada salva.");
  };

  const bloqueado = r.pendentesGraves > 0;
  const comErro = r.fontes.filter((x) => x.erro);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground"><Link href="/fechamentos" className="hover:underline">Fechamentos</Link> / {r.clinicaNome}</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{r.clinicaNome} · {f.tipo === "mensal" ? "Mensal" : "Quinzenal"} de {nomePeriodo(f.tipo, f.inicio, f.fim)}</h1>
            <StatusFechamento status={f.status} />
            {f.versao > 1 && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">v{f.versao}</span>}
          </div>
          <p className="text-sm text-muted-foreground">
            {dataBR(f.inicio)} a {dataBR(f.fim)} · regime de caixa · planilhas lidas às {new Date(r.lidoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Meta ajustada (opcional)
            <span className="flex gap-1.5">
              <input value={meta} onChange={(e) => setMeta(e.target.value)} inputMode="decimal" placeholder={r.metaMensal ? `mensal: ${brl0(r.metaMensal)}` : "R$"}
                className="h-8 w-40 rounded-md border border-input bg-background px-2 text-sm text-foreground" aria-label="Meta ajustada" />
              <Button size="sm" variant="outline" onClick={salvarMeta} disabled={ocupado}>Salvar</Button>
            </span>
          </label>
          <Button size="sm" variant="outline" onClick={lerDeNovo} disabled={ocupado}>
            {ocupado ? <Loader2 className="animate-spin" /> : <RefreshCw />}Ler de novo
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {r.fontes.map((x) => (
          <span key={x.fonte} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${x.erro ? "border-destructive/40 text-destructive" : ""}`} title={x.erro}>
            {x.erro ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
            {NOME_FONTE[x.fonte] ?? x.fonte}: {x.erro ? "não lida" : `${x.linhas} linhas`}
          </span>
        ))}
      </div>
      {comErro.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          {comErro.map((x) => <p key={x.fonte}><b>{NOME_FONTE[x.fonte]}:</b> {x.erro}</p>)}
        </div>
      )}

      <div className="grid grid-cols-2 overflow-hidden rounded-lg border">
        <button type="button" onClick={() => setAba("conferencia")} className={`px-4 py-3 text-left ${aba === "conferencia" ? "bg-secondary" : "hover:bg-muted/60"}`}>
          <span className="block text-sm font-semibold">1. Conferência</span>
          <span className="block text-xs text-muted-foreground">{bloqueado ? `${r.pendentesGraves} alerta${r.pendentesGraves > 1 ? "s" : ""} grave${r.pendentesGraves > 1 ? "s" : ""} pendente${r.pendentesGraves > 1 ? "s" : ""}` : "sem pendências graves"}</span>
        </button>
        <button type="button" onClick={() => !bloqueado && setAba("indicadores")} disabled={bloqueado}
          className={`border-l px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-50 ${aba === "indicadores" ? "bg-secondary" : "hover:bg-muted/60"}`}>
          <span className="block text-sm font-semibold">2. Indicadores</span>
          <span className="block text-xs text-muted-foreground">{bloqueado ? "liberados após a conferência" : "calculados e comparados"}</span>
        </button>
      </div>

      <div className={ocupado ? "pointer-events-none opacity-60 transition-opacity" : "transition-opacity"} aria-busy={ocupado}>
        {aba === "conferencia" || bloqueado
          ? <Conferencia r={r} decidir={decidir} desfazer={desfazer} irParaIndicadores={() => setAba("indicadores")} />
          : <PainelIndicadores r={r} />}
      </div>
    </div>
  );
}
