"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { tipoMetaSchema, FORMATOS, COMPORTAMENTOS, type TipoMetaFormValues } from "../_schemas";
import { createTipoMeta, updateTipoMeta, deleteTipoMeta } from "../actions";
import type { TipoMeta } from "@/lib/supabase/types";

const FORMATO_LABEL: Record<string, string> = Object.fromEntries(
  FORMATOS.map((f) => [f.value, f.label])
);

const COMPORTAMENTO_LABEL: Record<string, string> = Object.fromEntries(
  COMPORTAMENTOS.map((c) => [c.value, c.label])
);

interface Props {
  tiposMeta: TipoMeta[];
}

export function TiposMetaClient({ tiposMeta }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TipoMeta | null>(null);
  const [deleting, setDeleting] = useState<TipoMeta | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(tipo: TipoMeta) {
    setEditing(tipo);
    setDialogOpen(true);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setIsDeleting(true);
    const result = await deleteTipoMeta(deleting.id);
    setIsDeleting(false);
    if (result.error) toast.error(result.error);
    else { toast.success("Tipo excluído."); setDeleting(null); }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-heading">Tipos de Meta</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Categorias usadas em todos os clientes para definir e acompanhar metas.
          </p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Novo tipo
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 text-center">Ordem</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Formato</TableHead>
              <TableHead>Comportamento</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tiposMeta.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nenhum tipo cadastrado.
                </TableCell>
              </TableRow>
            ) : (
              tiposMeta.map((tipo) => (
                <TableRow key={tipo.id}>
                  <TableCell className="text-center font-mono text-sm text-muted-foreground">
                    {tipo.ordem_exibicao}
                  </TableCell>
                  <TableCell className="font-medium">{tipo.nome}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-sm">{tipo.unidade}</TableCell>
                  <TableCell className="text-sm">{FORMATO_LABEL[tipo.formato] ?? tipo.formato}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {COMPORTAMENTO_LABEL[tipo.comportamento] ?? tipo.comportamento}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(tipo)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleting(tipo)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <TipoMetaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        nextOrdem={tiposMeta.length + 1}
      />

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tipo de meta?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleting?.nome}" será excluído. Metas já cadastradas com este tipo podem ficar órfãs.
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

// ── Dialog ────────────────────────────────────────────────────────────────────

function TipoMetaDialog({
  open,
  onOpenChange,
  editing,
  nextOrdem,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: TipoMeta | null;
  nextOrdem: number;
}) {
  const isEdit = !!editing;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<TipoMetaFormValues>({
    resolver: zodResolver(tipoMetaSchema),
    defaultValues: {
      nome: "",
      unidade: "",
      formato: "numero_inteiro",
      comportamento: "acumulativa",
      ordem_exibicao: String(nextOrdem),
    },
  });

  // Reset when dialog opens
  useState(() => {
    if (open) {
      form.reset({
        nome: editing?.nome ?? "",
        unidade: editing?.unidade ?? "",
        formato: editing?.formato ?? "numero_inteiro",
        comportamento: editing?.comportamento ?? "acumulativa",
        ordem_exibicao: String(editing?.ordem_exibicao ?? nextOrdem),
      });
    }
  });

  const errors = form.formState.errors;

  async function onSubmit(data: TipoMetaFormValues) {
    setIsSubmitting(true);
    const result = isEdit
      ? await updateTipoMeta(editing.id, data)
      : await createTipoMeta(data);
    setIsSubmitting(false);
    if (result.error) toast.error(result.error);
    else { toast.success(isEdit ? "Tipo atualizado." : "Tipo criado."); onOpenChange(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar tipo" : "Novo tipo de meta"}</DialogTitle>
        </DialogHeader>

        <form
          key={editing?.id ?? "new"}
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4 pt-1"
          onReset={() => form.reset({
            nome: editing?.nome ?? "",
            unidade: editing?.unidade ?? "",
            formato: editing?.formato ?? "numero_inteiro",
            comportamento: editing?.comportamento ?? "acumulativa",
            ordem_exibicao: String(editing?.ordem_exibicao ?? nextOrdem),
          })}
        >
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" {...form.register("nome")} placeholder="Faturamento" autoFocus />
            {errors.nome && <p className="text-xs text-destructive">{errors.nome.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="unidade">Unidade</Label>
              <Input id="unidade" {...form.register("unidade")} placeholder="R$" className="font-mono" />
              {errors.unidade && <p className="text-xs text-destructive">{errors.unidade.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ordem_exibicao">Ordem</Label>
              <Input
                id="ordem_exibicao"
                type="number"
                min={1}
                {...form.register("ordem_exibicao")}
                className="font-mono"
              />
              {errors.ordem_exibicao && <p className="text-xs text-destructive">{errors.ordem_exibicao.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Formato</Label>
            <Select
              value={form.watch("formato")}
              onValueChange={(v) => form.setValue("formato", v as TipoMetaFormValues["formato"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMATOS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Comportamento</Label>
            <Select
              value={form.watch("comportamento")}
              onValueChange={(v) => form.setValue("comportamento", v as TipoMetaFormValues["comportamento"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMPORTAMENTOS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Acumulativa: cresce ao longo do mês (ex: faturamento). Média: nota fixa (ex: NPS).
            </p>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando…" : isEdit ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
