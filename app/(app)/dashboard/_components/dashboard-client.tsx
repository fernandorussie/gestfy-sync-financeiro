"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Copy, Check, FileText, Trash2, Download, RotateCcw, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import type { RelatorioGerado } from "@/lib/supabase/types";
import { excluirRelatorios } from "../actions";

const FORMATO_LABELS: Record<string, string> = {
  whatsapp_pesquisas: "WhatsApp — Pesquisas",
  whatsapp_metas: "WhatsApp — Metas",
  imagem: "Imagem",
};

export type RelatorioComClinica = RelatorioGerado & { clinicas: { nome: string } };

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className="gap-2">
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {copied ? "Copiado!" : "Copiar"}
    </Button>
  );
}

function fmtPeriodo(ini: string | null, fim: string | null): string {
  if (!ini || !fim) return "—";
  const [iy, im, id] = ini.split("-");
  const [fy, fm, fd] = fim.split("-");
  const iniStr = `${id}/${im}`;
  const fimStr = `${fd}/${fm}`;
  return iy === fy ? `${iniStr} – ${fimStr}` : `${iniStr}/${iy} – ${fimStr}/${fy}`;
}

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ── Conteúdo do dialog de visualização ───────────────────────────────────────

function DialogConteudo({ rel }: { rel: RelatorioComClinica }) {
  // Imagem: renderiza via endpoint usando dados_json salvo
  if (rel.formato === "imagem") {
    const temDados = rel.dados_json !== null && typeof rel.dados_json === "object" && !Array.isArray(rel.dados_json);
    if (!temDados) {
      return (
        <p className="text-sm text-muted-foreground py-4">
          Dados da imagem não disponíveis (dados_json ausente ou corrompido).
        </p>
      );
    }
    const imgUrl = `/api/relatorio-imagem/${rel.id}`;
    const clinicaSlug = slugify(rel.clinicas?.nome ?? "relatorio");
    const fileName = `${clinicaSlug}_${rel.data_inicio ?? rel.id}.png`;
    return (
      <div className="space-y-3">
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <a href={imgUrl} target="_blank" rel="noreferrer">
              <ImageIcon className="h-3.5 w-3.5" />Abrir
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <a href={imgUrl} download={fileName}>
              <Download className="h-3.5 w-3.5" />Baixar PNG
            </a>
          </Button>
        </div>
        <div className="rounded-lg overflow-hidden border bg-muted/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgUrl}
            alt={`Infográfico ${rel.clinicas?.nome ?? ""}`}
            className="w-full max-w-sm mx-auto block"
          />
        </div>
      </div>
    );
  }

  // WhatsApp: mostra markdown
  if (rel.conteudo_markdown) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <CopyButton text={rel.conteudo_markdown} />
        </div>
        <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed rounded-md bg-muted/60 p-4 max-h-[55vh] overflow-y-auto">
          {rel.conteudo_markdown}
        </pre>
      </div>
    );
  }

  return <p className="text-sm text-muted-foreground py-4">Sem conteúdo.</p>;
}

// ── Componente principal ──────────────────────────────────────────────────────

export function DashboardClient({ relatorios }: { relatorios: RelatorioComClinica[] }) {
  const [rows, setRows] = useState<RelatorioComClinica[]>(relatorios);
  const [viewing, setViewing] = useState<RelatorioComClinica | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmPending, setConfirmPending] = useState<{ ids: string[] } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete() {
    if (!confirmPending) return;
    const ids = confirmPending.ids;
    setIsDeleting(true);
    const result = await excluirRelatorios(ids);
    setIsDeleting(false);
    setConfirmPending(null);
    if (result.error) {
      toast.error(result.error);
    } else {
      setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
      setSelected(new Set());
      toast.success(
        ids.length === 1 ? "Relatório excluído." : `${ids.length} relatórios excluídos.`
      );
    }
  }

  return (
    <>
      <div className="p-8 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-heading">Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Histórico dos últimos relatórios gerados.
          </p>
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2.5">
            <span className="text-sm text-destructive font-medium">
              {selected.size} {selected.size === 1 ? "selecionado" : "selecionados"}
            </span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmPending({ ids: Array.from(selected) })}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Excluir selecionados
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-muted-foreground"
              onClick={() => setSelected(new Set())}
            >
              Cancelar seleção
            </Button>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="rounded-md border p-14 text-center">
            <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum relatório gerado ainda.</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 pl-4">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="h-4 w-4 cursor-pointer accent-[#7B099C]"
                      aria-label="Selecionar todos"
                    />
                  </TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Formato</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Gerado em</TableHead>
                  <TableHead className="w-36" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    data-state={selected.has(r.id) ? "selected" : undefined}
                    onClick={() => setViewing(r)}
                  >
                    <TableCell
                      className="pl-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleOne(r.id)}
                        className="h-4 w-4 cursor-pointer accent-[#7B099C]"
                        aria-label="Selecionar relatório"
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.clinicas?.nome ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {FORMATO_LABELS[r.formato] ?? r.formato ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {fmtPeriodo(r.data_inicio, r.data_fim)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.gerado_em
                        ? format(new Date(r.gerado_em), "dd/MM/yyyy HH:mm")
                        : "—"}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setViewing(r)}
                        >
                          Ver
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Reabrir na tela de geração"
                          asChild
                        >
                          <Link href={`/relatorio?relatorio=${r.id}`}>
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setConfirmPending({ ids: [r.id] })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Dialog de visualização */}
      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base leading-snug">
              {viewing?.clinicas?.nome ?? "—"}
              {" — "}
              {FORMATO_LABELS[viewing?.formato ?? ""] ?? viewing?.formato ?? ""}
              {viewing && (
                <span className="text-muted-foreground font-normal">
                  {" "}({fmtPeriodo(viewing.data_inicio, viewing.data_fim)})
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {viewing && <DialogConteudo rel={viewing} />}

          {/* Rodapé do dialog: botão Reabrir */}
          {viewing && (
            <DialogFooter className="pt-2">
              <Button variant="outline" size="sm" asChild className="gap-1.5">
                <Link href={`/relatorio?relatorio=${viewing.id}`}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reabrir na tela de geração
                </Link>
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* AlertDialog de confirmação de exclusão */}
      <AlertDialog
        open={!!confirmPending}
        onOpenChange={(v) => { if (!v && !isDeleting) setConfirmPending(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmPending?.ids.length === 1
                ? "Excluir este relatório?"
                : `Excluir ${confirmPending?.ids.length ?? 0} relatórios?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
