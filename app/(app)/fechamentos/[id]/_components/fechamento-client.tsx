"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Lock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ResultadoFechamento } from "@/lib/fechamentos/servidor";
import type { AcaoDecisao, Decisao } from "@/lib/fechamentos/decisoes";
import { concluir, decidirAlerta, desfazerDecisao, marcarEnviado, reabrir, recalcular, salvarAnalise, salvarMetaAjustada } from "../../actions";
import { StatusFechamento } from "../../_components/status";
import { brl0, dataBR, nomePeriodo } from "../../_components/formato";
import { Conferencia } from "./conferencia";
import { PainelIndicadores } from "./indicadores";
import { Analise, type EstadoAnalise } from "./analise";
import { Entrega } from "./entrega";

const NOME_FONTE: Record<string, string> = { vendas: "Vendas", despesas: "Despesas", orcamentos: "Orçamentos", leads: "Leads", nps: "NPS", avaliacoes: "Avaliações" };

export type Decidir = (chave: string, acao: AcaoDecisao, escolha?: Decisao["escolha"]) => void;
type Aba = "conferencia" | "indicadores" | "analise" | "entrega";
type Salvamento = "salvo" | "pendente" | "salvando" | "erro";

const ABAS_VALIDAS: Aba[] = ["conferencia", "indicadores", "analise", "entrega"];

/** etapaInicial vem do endereço (?etapa=analise), para o histórico abrir direto na parte pedida. */
export function FechamentoClient({ inicial, etapaInicial }: { inicial: ResultadoFechamento; etapaInicial?: string }) {
  const router = useRouter();
  const [r, setR] = useState(inicial);
  const pedida = ABAS_VALIDAS.find((x) => x === etapaInicial);
  const [aba, setAba] = useState<Aba>(pedida ?? (inicial.congelado ? "entrega" : inicial.pendentesGraves ? "conferencia" : "indicadores"));
  const [ocupado, iniciar] = useTransition();
  const [meta, setMeta] = useState(inicial.fechamento.meta_ajustada ? String(inicial.fechamento.meta_ajustada) : "");
  const [analise, setAnalise] = useState<EstadoAnalise>({ texto: inicial.texto, acoes: inicial.acoes, acompanhamento: inicial.acompanhamento });
  const [salvamento, setSalvamento] = useState<Salvamento>("salvo");
  const [salvoEm, setSalvoEm] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const f = r.fechamento;
  const congelado = r.congelado;

  const executar = (fn: () => Promise<{ ok: true; dados: ResultadoFechamento } | { ok: false; erro: string }>, sucesso?: string) =>
    iniciar(async () => {
      const res = await fn();
      if (!res.ok) { toast.error(res.erro); return; }
      setR(res.dados);
      if (sucesso) toast.success(sucesso);
    });

  /* Análise: salva sozinho 1,2 s depois da última alteração. */
  const salvarAgora = async (e: EstadoAnalise) => {
    setSalvamento("salvando");
    const res = await salvarAnalise({ id: f.id, ...e });
    setSalvamento(res.ok ? "salvo" : "erro");
    if (res.ok) setSalvoEm(new Date());
    if (!res.ok) toast.error(res.erro);
    return res.ok;
  };
  const mudarAnalise = (e: EstadoAnalise) => {
    setAnalise(e);
    setSalvamento("pendente");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void salvarAgora(e); }, 1200);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    const aviso = (ev: BeforeUnloadEvent) => { if (salvamento === "pendente" || salvamento === "salvando") ev.preventDefault(); };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [salvamento]);

  const decidir: Decidir = (chave, acao, escolha) => executar(() => decidirAlerta({ id: f.id, chave, acao, escolha }));
  const desfazer = (chave: string) => executar(() => desfazerDecisao({ id: f.id, chave }));
  const lerDeNovo = () => executar(() => recalcular(f.id, true), "Planilhas lidas de novo.");
  const salvarMeta = () => {
    const v = Number(meta.replace(/\./g, "").replace(",", "."));
    executar(() => salvarMetaAjustada({ id: f.id, valor: meta.trim() ? v : null }), "Meta ajustada salva.");
  };
  const concluirAgora = () => iniciar(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (salvamento !== "salvo" && !(await salvarAgora(analise))) return;
    const res = await concluir({ id: f.id });
    if (!res.ok) { toast.error(res.erro); return; }
    setR(res.dados);
    toast.success("Fechamento concluído e congelado.");
  });
  const enviado = () => executar(() => marcarEnviado({ id: f.id }), "Marcado como enviado.");
  const reabrirAgora = () => iniciar(async () => {
    const res = await reabrir({ id: f.id });
    if (!res.ok) { toast.error(res.erro); return; }
    toast.success("Nova versão aberta. A anterior continua no histórico.");
    router.push(`/fechamentos/${res.dados.id}`);
  });

  const bloqueado = r.pendentesGraves > 0;
  const comErro = r.fontes.filter((x) => x.erro);
  const abas: { k: Aba; titulo: string; sub: string; trava?: boolean }[] = [
    { k: "conferencia", titulo: "1. Conferência", sub: bloqueado ? `${r.pendentesGraves} grave${r.pendentesGraves > 1 ? "s" : ""} pendente${r.pendentesGraves > 1 ? "s" : ""}` : "sem pendências graves" },
    { k: "indicadores", titulo: "2. Indicadores", sub: bloqueado ? "liberados após a conferência" : "calculados e comparados", trava: bloqueado },
    { k: "analise", titulo: "3. Análise", sub: analise.texto.observacao.trim() ? `${analise.acoes.length} ${analise.acoes.length === 1 ? "ação" : "ações"} no plano` : "texto e plano de ação", trava: bloqueado },
    { k: "entrega", titulo: "4. Entrega", sub: congelado ? (f.status === "enviado" ? "enviado" : "concluído") : "WhatsApp, PDF e concluir", trava: bloqueado },
  ];
  const atual = bloqueado ? "conferencia" : aba;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            <Link href={`/fechamentos?mes=${f.inicio.slice(0, 7)}`} className="hover:underline">Fechamentos do mês</Link> / <Link href={`/fechamentos/historico?cliente=${f.clinica_id}`} className="hover:underline" title="Histórico deste cliente">{r.clinicaNome}</Link>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{r.clinicaNome} · {f.tipo === "mensal" ? "Mensal de " : "Quinzenal · "}{nomePeriodo(f.tipo, f.inicio, f.fim)}</h1>
            <StatusFechamento status={f.status} />
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">v{f.versao}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {dataBR(f.inicio)} a {dataBR(f.fim)} · regime de caixa · {congelado ? "números congelados na conclusão" : `planilhas lidas às ${new Date(r.lidoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
          </p>
        </div>
        {congelado ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-muted-foreground"><Lock className="h-4 w-4" />Somente leitura</span>
        ) : (
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
        )}
      </div>

      {!congelado && (
        <div className="flex flex-wrap gap-2 text-xs">
          {r.fontes.map((x) => (
            <span key={x.fonte} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${x.erro ? "border-destructive/40 text-destructive" : ""}`} title={x.erro}>
              {x.erro ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
              {NOME_FONTE[x.fonte] ?? x.fonte}: {x.erro ? "não lida" : `${x.linhas} linhas`}
            </span>
          ))}
        </div>
      )}
      {comErro.length > 0 && !congelado && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          {comErro.map((x) => <p key={x.fonte}><b>{NOME_FONTE[x.fonte]}:</b> {x.erro}</p>)}
        </div>
      )}

      <nav className="grid grid-cols-2 overflow-hidden rounded-lg border md:grid-cols-4" aria-label="Etapas do fechamento">
        {abas.map((a, n) => (
          <button key={a.k} type="button" onClick={() => !a.trava && setAba(a.k)} disabled={a.trava} aria-current={atual === a.k ? "step" : undefined}
            className={`border-b px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-50 md:border-b-0 ${n > 0 ? "md:border-l" : ""} ${n % 2 ? "border-l" : ""} ${atual === a.k ? "bg-secondary" : "hover:bg-muted/60"}`}>
            <span className="block text-sm font-semibold">{a.titulo}</span>
            <span className="block truncate text-xs text-muted-foreground">{a.sub}</span>
          </button>
        ))}
      </nav>

      {(atual === "analise" || atual === "entrega") && !congelado && (
        <p className="text-right text-xs text-muted-foreground" aria-live="polite">
          {salvamento === "salvo" ? (salvoEm ? `Tudo salvo às ${salvoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Tudo salvo") : salvamento === "salvando" ? "Salvando…" : salvamento === "pendente" ? "Alterações não salvas" : "Erro ao salvar"}
        </p>
      )}

      <div className={ocupado ? "pointer-events-none opacity-60 transition-opacity" : "transition-opacity"} aria-busy={ocupado}>
        {atual === "conferencia" && <Conferencia r={r} decidir={decidir} desfazer={desfazer} irParaIndicadores={() => setAba("indicadores")} somenteLeitura={congelado} />}
        {atual === "indicadores" && <PainelIndicadores r={r} />}
        {atual === "analise" && <Analise r={r} estado={analise} mudar={mudarAnalise} desabilitado={congelado} />}
        {atual === "entrega" && <Entrega r={r} estado={analise} onConcluir={concluirAgora} onEnviado={enviado} onReabrir={reabrirAgora} ocupado={ocupado} />}
      </div>
    </div>
  );
}
