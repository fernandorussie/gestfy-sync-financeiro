"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  ClipboardCheck, Loader2, AlertTriangle, CheckCircle2, CircleAlert,
  Settings2, PencilLine, CalendarClock, Image as ImageIcon, Download, ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { CopyButton } from "@/components/copy-button";
import { withConcurrency } from "@/lib/concorrencia";
import { SelecaoClinicas } from "@/components/selecao-clinicas-periodo";
import { montarTextoCheckpoint, resumoStatus } from "@/lib/checkpoint/montar-texto";
import { rodarCheckpointClinica } from "../actions";
import type { ResultadoCheckpointClinica, ResultadoIndicador } from "../actions";
import type { StatusCheckpoint } from "@/lib/checkpoint/avaliar";
import type { Clinica } from "@/lib/supabase/types";

/** Linha da tela: a sugestão do sistema mais o que o usuário editou por cima. */
interface LinhaIndicador extends ResultadoIndicador {
  editado: boolean;
}

interface LinhaClinica extends Omit<ResultadoCheckpointClinica, "indicadores"> {
  indicadores: LinhaIndicador[];
}

// ─── Botão de status (✅ / ⚠️), sempre editável ───────────────────────────────
function StatusToggle({
  status, onChange,
}: {
  status: StatusCheckpoint;
  onChange: (s: StatusCheckpoint) => void;
}) {
  const opcoes: { valor: Exclude<StatusCheckpoint, null>; label: string; icone: typeof CheckCircle2 }[] = [
    { valor: "ok",      label: "OK",      icone: CheckCircle2 },
    { valor: "atencao", label: "Atenção", icone: CircleAlert  },
  ];

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {opcoes.map(({ valor, label, icone: Icone }) => {
        const ativo = status === valor;
        const cor = valor === "ok"
          ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-400";
        return (
          <button
            key={valor}
            type="button"
            onClick={() => onChange(ativo ? null : valor)}
            aria-pressed={ativo}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              ativo ? cor : "text-muted-foreground hover:bg-muted/60"
            }`}
          >
            <Icone className="h-3.5 w-3.5 shrink-0" />{label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Card de uma clínica ──────────────────────────────────────────────────────
function ClinicaCheckpointCard({
  linha, onUpdate,
}: {
  linha: LinhaClinica;
  onUpdate: (l: LinhaClinica) => void;
}) {
  function atualizar(i: number, patch: Partial<LinhaIndicador>) {
    const indicadores = linha.indicadores.map((ind, j) =>
      j === i ? { ...ind, ...patch, editado: true } : ind
    );
    onUpdate({ ...linha, indicadores });
  }

  const totalAtencao = linha.indicadores.filter(i => i.status === "atencao").length;
  const totalBranco  = linha.indicadores.filter(i => i.status === null).length;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base">{linha.clinicaNome || "Cliente"}</CardTitle>
          {linha.indicadores.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {totalAtencao > 0
                ? `${totalAtencao} ponto${totalAtencao !== 1 ? "s" : ""} de atenção`
                : totalBranco > 0
                  ? `${totalBranco} a confirmar`
                  : "tudo em dia"}
            </span>
          )}
        </div>
        {linha.erros.map((e, i) => (
          <div key={i} className="flex items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:border-yellow-800/50 dark:bg-yellow-900/20 dark:text-yellow-400 mt-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{e}
          </div>
        ))}
      </CardHeader>

      <CardContent>
        {linha.semIndicadores ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Nenhum indicador ativo para este cliente.
            </p>
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <Link href={`/clientes/${linha.clinicaId}?aba=fontes#checkpoint`}>
                <Settings2 className="h-3.5 w-3.5" />Configurar indicadores
              </Link>
            </Button>
          </div>
        ) : linha.indicadores.length === 0 ? (
          <p className="text-sm text-destructive">Não foi possível rodar o checkpoint.</p>
        ) : (
          <div className="divide-y rounded-md border">
            {linha.indicadores.map((ind, i) => (
              <div key={ind.indicador} className="px-4 py-3 space-y-2">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      {ind.label}
                      {ind.automatico ? (
                        <span
                          title={ind.cadencia === "diaria"
                            ? "Lançamento diário — alerta com mais de 2 dias úteis sem nada"
                            : "Basta um lançamento na semana — alerta com mais de 5 dias úteis sem nada"}
                          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          <CalendarClock className="h-3 w-3" />
                          {ind.cadencia === "diaria" ? "diário" : "semanal"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <PencilLine className="h-3 w-3" />manual
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{ind.detalhe}</p>
                  </div>
                  <StatusToggle
                    status={ind.status}
                    onChange={s => atualizar(i, { status: s })}
                  />
                </div>
                <Input
                  value={ind.observacao}
                  onChange={e => atualizar(i, { observacao: e.target.value })}
                  placeholder={ind.automatico ? "Observação (opcional)" : "Preencher manualmente"}
                  className="text-sm"
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Tela ─────────────────────────────────────────────────────────────────────
export function CheckpointClient({ clinicas }: { clinicas: Clinica[] }) {
  const [clinicasSel, setClinicasSel] = useState<Set<string>>(new Set());

  const [rodando, setRodando]     = useState(false);
  const [progresso, setProgresso] = useState<{ done: number; total: number } | null>(null);
  const [linhas, setLinhas]       = useState<LinhaClinica[]>([]);
  const [rodadoEm, setRodadoEm]   = useState<Date | null>(null);

  const [gerandoImagem, setGerandoImagem] = useState(false);
  const [imagemUrl, setImagemUrl]         = useState<string | null>(null);
  const [erroImagem, setErroImagem]       = useState<string | null>(null);

  function toggleClinica(id: string) {
    setClinicasSel(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleTodas() {
    setClinicasSel(
      clinicasSel.size === clinicas.length ? new Set() : new Set(clinicas.map(c => c.id))
    );
  }

  /** A imagem antiga deixa de valer assim que algo muda na tela. */
  function invalidarImagem() {
    setImagemUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setErroImagem(null);
  }

  async function handleRodar() {
    const ids = clinicas.filter(c => clinicasSel.has(c.id)).map(c => c.id);
    if (!ids.length) return;

    setRodando(true);
    setLinhas([]);
    invalidarImagem();
    setRodadoEm(new Date());

    let done = 0;
    setProgresso({ done: 0, total: ids.length });

    const tasks = ids.map(id => async (): Promise<LinhaClinica> => {
      const nome = clinicas.find(c => c.id === id)?.nome ?? "";
      try {
        const r = await rodarCheckpointClinica({ clinicaId: id });
        return {
          ...r,
          clinicaNome: r.clinicaNome || nome,
          indicadores: r.indicadores.map(i => ({ ...i, editado: false })),
        };
      } catch (e) {
        return {
          clinicaId: id,
          clinicaNome: nome,
          indicadores: [],
          semIndicadores: false,
          erros: [`Erro ao rodar o checkpoint: ${e instanceof Error ? e.message : String(e)}`],
        };
      }
    });

    await withConcurrency(tasks, 3, result => {
      done++;
      setLinhas(prev => [...prev, result]);
      setProgresso({ done, total: ids.length });
    });

    setRodando(false);
    setProgresso(null);
  }

  // Mantém a ordem da lista de clínicas, não a de chegada das respostas
  const linhasOrdenadas = clinicas
    .map(c => linhas.find(l => l.clinicaId === c.id))
    .filter((l): l is LinhaClinica => l !== undefined);

  const dataRef = rodadoEm ?? new Date();
  const texto   = linhasOrdenadas.length > 0
    ? montarTextoCheckpoint(linhasOrdenadas, dataRef)
    : "";
  const resumo  = resumoStatus(linhasOrdenadas);

  async function handleGerarImagem() {
    setGerandoImagem(true);
    setErroImagem(null);
    try {
      const corpo = {
        data: format(dataRef, "dd/MM/yyyy"),
        clinicas: linhasOrdenadas.map(l => ({
          clinicaNome: l.clinicaNome,
          semIndicadores: l.semIndicadores,
          indicadores: l.indicadores.map(i => ({
            label: i.label,
            status: i.status,
            observacao: i.observacao,
          })),
        })),
      };

      const res = await fetch("/api/checkpoint-imagem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });

      if (!res.ok) {
        setErroImagem(await res.text());
        return;
      }

      const blob = await res.blob();
      setImagemUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch (e) {
      setErroImagem(e instanceof Error ? e.message : "Erro ao gerar a imagem.");
    } finally {
      setGerandoImagem(false);
    }
  }

  const podeRodar = clinicasSel.size > 0 && !rodando;
  const hojeBR    = format(new Date(), "dd/MM/yyyy");
  const temResultado = linhasOrdenadas.length > 0;

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold font-heading">Checkpoint</h1>
        <p className="text-sm text-muted-foreground">
          Confira se as planilhas estão em dia antes de gerar os reports.
        </p>
      </div>

      {/* ── Configurações ── */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Configurações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <SelecaoClinicas
            clinicas={clinicas}
            selecionadas={clinicasSel}
            onToggle={toggleClinica}
            onToggleTodas={toggleTodas}
          />

          <p className="text-xs text-muted-foreground">
            O checkpoint sempre olha de hoje ({hojeBR}) para trás, em dias úteis, descontando
            feriados — até 2 dias úteis para faturamento e despesas (lançamento diário) e até 5
            para leads, fechamentos e NPS (basta um na semana). A conferência de categoria cobre
            o mês corrente.
          </p>

          <Separator />

          <div className="flex items-center gap-4">
            <Button onClick={handleRodar} disabled={!podeRodar} className="gap-2">
              {rodando
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <ClipboardCheck className="h-4 w-4" />}
              {rodando
                ? (progresso ? `Conferindo ${progresso.done + 1} de ${progresso.total}…` : "Conferindo…")
                : `Rodar checkpoint${clinicasSel.size > 1 ? ` (${clinicasSel.size})` : ""}`}
            </Button>
            {!rodando && clinicasSel.size === 0 && (
              <p className="text-sm text-muted-foreground">Selecione ao menos um cliente.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Resultados ── */}
      {(temResultado || rodando) && (
        <div className="space-y-4">
          {rodando && progresso && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <span>
                {progresso.done === 0
                  ? `Lendo as planilhas de ${progresso.total} cliente${progresso.total !== 1 ? "s" : ""}…`
                  : `${progresso.done} de ${progresso.total} concluído${progresso.done !== 1 ? "s" : ""}`}
              </span>
            </div>
          )}

          {linhasOrdenadas.map(l => (
            <ClinicaCheckpointCard
              key={l.clinicaId}
              linha={l}
              onUpdate={upd => {
                invalidarImagem();
                setLinhas(prev => prev.map(x => x.clinicaId === upd.clinicaId ? upd : x));
              }}
            />
          ))}

          {/* ── Saídas: texto e imagem ── */}
          {temResultado && !rodando && (
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base">Enviar</CardTitle>
                  <span className="text-xs text-muted-foreground">
                    {resumo.ok} em dia · {resumo.atencao} atenção
                    {resumo.branco > 0 ? ` · ${resumo.branco} a confirmar` : ""}
                  </span>
                </div>
              </CardHeader>

              <CardContent className="space-y-5">
                {/* Texto para WhatsApp */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-medium">Texto para WhatsApp</span>
                    <CopyButton text={texto} label="Copiar texto" />
                  </div>
                  <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed bg-muted/50 rounded-md p-4 max-h-80 overflow-y-auto">
                    {texto}
                  </pre>
                </div>

                <Separator />

                {/* Infográfico */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-medium">Infográfico</span>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={handleGerarImagem}
                        disabled={gerandoImagem}
                        variant={imagemUrl ? "outline" : "default"}
                        size="sm"
                        className="gap-1.5"
                      >
                        {gerandoImagem
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <ImageIcon className="h-3.5 w-3.5" />}
                        {gerandoImagem ? "Gerando…" : imagemUrl ? "Gerar de novo" : "Gerar infográfico"}
                      </Button>
                      {imagemUrl && (<>
                        <Button variant="outline" size="sm" asChild className="gap-1.5">
                          <a href={imagemUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />Abrir
                          </a>
                        </Button>
                        <Button variant="outline" size="sm" asChild className="gap-1.5">
                          <a href={imagemUrl} download={`checkpoint_${format(dataRef, "dd-MM-yyyy")}.png`}>
                            <Download className="h-3.5 w-3.5" />Baixar PNG
                          </a>
                        </Button>
                      </>)}
                    </div>
                  </div>

                  {erroImagem && (
                    <p className="flex items-start gap-1.5 text-sm text-destructive">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{erroImagem}
                    </p>
                  )}

                  {imagemUrl ? (
                    <div className="rounded-lg overflow-hidden border bg-muted/30">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imagemUrl} alt="Infográfico do checkpoint"
                        className="w-full max-w-sm mx-auto block" />
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Uma imagem com todos os clientes conferidos, no visual Gestfy. Editou algum
                      status acima? Gere de novo para a imagem acompanhar.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
