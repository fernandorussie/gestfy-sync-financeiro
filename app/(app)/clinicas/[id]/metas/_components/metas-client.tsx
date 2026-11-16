"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, RefreshCw, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatValor } from "@/lib/format";
import { calcularMetaPeriodo, calcularPercentualMeta, descreverPerformance } from "@/lib/metas";
import { deletarMeta, copiarMetasMesAnterior } from "../actions";
import { MetaFormDialog } from "./meta-form-dialog";
import { AtualizarRealizadosDialog, type MetaComTipo } from "./atualizar-realizados-dialog";
import type { Meta, TipoMeta } from "@/lib/supabase/types";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

interface Props {
  clinicaId: string;
  clinicaNome: string;
  mes: number;
  ano: number;
  metas: MetaComTipo[];
  tiposMeta: TipoMeta[];
  diasTotal: number;
  diasDecorridos: number;
}

export function MetasClient({
  clinicaId,
  clinicaNome,
  mes,
  ano,
  metas,
  tiposMeta,
  diasTotal,
  diasDecorridos,
}: Props) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [editando, setEditando] = useState<Meta | null>(null);
  const [atualizarOpen, setAtualizarOpen] = useState(false);
  const [deleting, setDeleting] = useState<MetaComTipo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [copiarDialogOpen, setCopiarDialogOpen] = useState(false);
  const [existentesCount, setExistentesCount] = useState(0);

  function navigate(delta: number) {
    let newMes = mes + delta;
    let newAno = ano;
    if (newMes > 12) { newMes = 1; newAno++; }
    if (newMes < 1) { newMes = 12; newAno--; }
    router.push(`/clientes/${clinicaId}?aba=metas&mes=${newMes}&ano=${newAno}`, { scroll: false });
  }

  async function handleCopiar(forcar = false) {
    setIsCopying(true);
    const result = await copiarMetasMesAnterior(clinicaId, mes, ano, forcar);
    setIsCopying(false);

    if ("erro" in result) {
      toast.error(result.erro);
    } else if ("aviso" in result) {
      setExistentesCount(result.aviso.existentes);
      setCopiarDialogOpen(true);
    } else {
      setCopiarDialogOpen(false);
      if (result.copiadas === 0) {
        toast.info("Todas as metas do mês anterior já existem neste mês.");
      } else {
        toast.success(`${result.copiadas} meta(s) copiada(s) com sucesso.`);
      }
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setIsDeleting(true);
    const result = await deletarMeta(deleting.id, clinicaId);
    setIsDeleting(false);
    if (result.error) toast.error(result.error);
    else { toast.success("Meta excluída."); setDeleting(null); }
  }

  const tipoEditando = editando
    ? metas.find((m) => m.id === editando.id)?.tipos_meta ?? null
    : null;

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h2 className="font-semibold">Metas de {clinicaNome}</h2>
          <p className="text-sm text-muted-foreground">Usadas no Report Semanal (meta proporcional) e nos fechamentos (atingimento da meta de faturamento).</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => handleCopiar(false)} disabled={isCopying}>
            {isCopying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
            Copiar mês anterior
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setAtualizarOpen(true)}>
            <RefreshCw className="h-4 w-4" />
            Atualizar realizados
          </Button>
          <Button className="gap-2" onClick={() => { setEditando(null); setAddOpen(true); }}>
            <Plus className="h-4 w-4" />
            Adicionar meta
          </Button>
        </div>
      </div>

      {/* Month nav */}
      <div className="flex items-center gap-2 mb-5">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold w-40 text-center">
          {MESES[mes - 1]} {ano}
        </span>
        <Button variant="ghost" size="icon" onClick={() => navigate(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        {diasTotal > 0 && (
          <span className="text-xs text-muted-foreground ml-2">
            {diasDecorridos}/{diasTotal} dias úteis decorridos
          </span>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Meta mensal</TableHead>
              <TableHead className="text-right">Acumulado</TableHead>
              <TableHead className="text-right">Meta do período</TableHead>
              <TableHead className="text-center w-28">% período</TableHead>
              <TableHead className="text-center w-28">% meta</TableHead>
              <TableHead className="text-center w-28">Atualizado</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {metas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  Nenhuma meta para este mês. Clique em "Adicionar meta".
                </TableCell>
              </TableRow>
            ) : (
              metas.map((meta) => {
                const tipo = meta.tipos_meta;
                const comportamento = tipo.comportamento ?? "acumulativa";
                const isMedia = comportamento === "media";

                const metaPeriodo = calcularMetaPeriodo(
                  meta.valor_meta_mensal, diasDecorridos, diasTotal, comportamento
                );

                // Para acumulativa: exige diasDecorridos > 0; para média: exibe sempre que há realizado.
                const temRealizado = meta.valor_realizado > 0;
                const podeMostrarPerf = temRealizado && (isMedia || diasDecorridos > 0);

                const perf = podeMostrarPerf
                  ? descreverPerformance(
                      meta.valor_realizado, metaPeriodo, meta.valor_meta_mensal, comportamento
                    )
                  : null;

                const pctMensal = temRealizado && meta.valor_meta_mensal > 0
                  ? calcularPercentualMeta(meta.valor_realizado, meta.valor_meta_mensal)
                  : null;

                return (
                  <TableRow key={meta.id}>
                    <TableCell className="font-medium">{tipo.nome}</TableCell>

                    {/* Meta mensal */}
                    <TableCell className="text-right font-mono text-sm">
                      {formatValor(meta.valor_meta_mensal, tipo.formato)}
                    </TableCell>

                    {/* Acumulado */}
                    <TableCell className="text-right font-mono text-sm">
                      {formatValor(meta.valor_realizado, tipo.formato)}
                    </TableCell>

                    {/* Meta do período — "—" para métricas de média */}
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {isMedia
                        ? "—"
                        : diasDecorridos > 0
                          ? formatValor(metaPeriodo, tipo.formato)
                          : "—"}
                    </TableCell>

                    {/* % do período — oculto para tipos de média (sem proporcionalidade por dias) */}
                    <TableCell className="text-center">
                      {!isMedia && perf ? (
                        <Badge
                          className={cn(
                            "text-xs font-mono",
                            perf.acima_meta_periodo
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                              : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                          )}
                          variant="outline"
                        >
                          {perf.acima_meta_periodo ? "▲" : "▼"} {perf.pct_periodo.toFixed(0)}%
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* % da meta mensal */}
                    <TableCell className="text-center text-xs font-mono text-muted-foreground">
                      {pctMensal !== null ? `${pctMensal.toFixed(0)}%` : "—"}
                    </TableCell>

                    {/* Data de atualização */}
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {meta.data_referencia
                        ? meta.data_referencia.slice(8, 10) + "/" + meta.data_referencia.slice(5, 7)
                        : "—"}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => { setEditando(meta); setAddOpen(true); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleting(meta)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Dialogs */}
      <MetaFormDialog
        open={addOpen}
        onOpenChange={(v) => { setAddOpen(v); if (!v) setEditando(null); }}
        clinicaId={clinicaId}
        mes={mes}
        ano={ano}
        tiposMeta={tiposMeta}
        tiposJaAdicionados={metas.map((m) => m.tipo_meta_id)}
        editando={editando}
        tipoEditando={tipoEditando}
      />

      <AtualizarRealizadosDialog
        key={`${mes}-${ano}`}
        open={atualizarOpen}
        onOpenChange={setAtualizarOpen}
        clinicaId={clinicaId}
        metas={metas}
      />

      <AlertDialog open={copiarDialogOpen} onOpenChange={(v) => !v && setCopiarDialogOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Este mês já tem {existentesCount} meta(s)</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja continuar? Metas existentes do mesmo tipo serão mantidas — apenas os tipos
              que ainda não existem neste mês serão copiados do mês anterior.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleCopiar(true)} disabled={isCopying}>
              {isCopying ? "Copiando…" : "Continuar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir meta?</AlertDialogTitle>
            <AlertDialogDescription>
              A meta de "{deleting?.tipos_meta.nome}" para {MESES[mes - 1]}/{ano} será removida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
