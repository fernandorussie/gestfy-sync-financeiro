"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { clinicaSchema, type ClinicaFormValues } from "../../clinicas/_schemas";
import { createClinica, updateClinica } from "../../clinicas/actions";
import { toSlug } from "@/lib/utils";

export interface CadastroCliente {
  id: string;
  nome: string;
  slug: string;
  tag_curta: string | null;
  google_place_id: string | null;
  ativa: boolean;
}

/**
 * Campos do cadastro do cliente. Serve para criar (no diálogo "Novo cliente")
 * e para editar (aba Dados gerais). A situação (ativo/inativo) não fica aqui:
 * ela tem botão próprio, com confirmação.
 */
export function CadastroForm({ cliente, onSalvo, onCancelar }: { cliente: CadastroCliente | null; onSalvo?: (id: string) => void; onCancelar?: () => void }) {
  const editar = !!cliente;
  const [salvando, setSalvando] = useState(false);
  const slugMexido = useRef(editar);
  const form = useForm<ClinicaFormValues>({
    resolver: zodResolver(clinicaSchema),
    defaultValues: {
      nome: cliente?.nome ?? "",
      slug: cliente?.slug ?? "",
      tag_curta: cliente?.tag_curta ?? "",
      google_place_id: cliente?.google_place_id ?? "",
      ativa: cliente?.ativa ?? true,
    },
  });
  const nome = form.watch("nome");
  useEffect(() => {
    if (!editar && !slugMexido.current && nome) form.setValue("slug", toSlug(nome), { shouldValidate: false });
  }, [nome, editar, form]);

  async function salvar(data: ClinicaFormValues) {
    setSalvando(true);
    const r = editar ? await updateClinica(cliente.id, { ...data, ativa: cliente.ativa }) : await createClinica(data);
    setSalvando(false);
    if ("error" in r) { toast.error(r.error); return; }
    toast.success(editar ? "Dados do cliente salvos." : "Cliente criado.");
    form.reset({ ...data, ativa: cliente?.ativa ?? true });
    const id: string = "id" in r && typeof r.id === "string" ? r.id : cliente!.id;
    onSalvo?.(id);
  }

  const e = form.formState.errors;
  const mudou = form.formState.isDirty;
  return (
    <form onSubmit={form.handleSubmit(salvar)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="nome">Nome do cliente</Label>
          <Input id="nome" {...form.register("nome")} placeholder="Clínica Exemplo" autoFocus={!editar} />
          {e.nome && <p className="text-xs text-destructive">{e.nome.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="slug">Identificador</Label>
          <Input id="slug" {...form.register("slug")} placeholder="clinica-exemplo" className="font-mono text-sm"
            onChange={(ev) => { slugMexido.current = true; form.setValue("slug", ev.target.value, { shouldValidate: true, shouldDirty: true }); }} />
          <p className="text-xs text-muted-foreground">Só letras minúsculas, números e hífens. Não aparece para o cliente.</p>
          {e.slug && <p className="text-xs text-destructive">{e.slug.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tag_curta">Sigla</Label>
          <Input id="tag_curta" {...form.register("tag_curta")} placeholder="EXEMPLO" maxLength={10}
            onChange={(ev) => form.setValue("tag_curta", ev.target.value.toUpperCase(), { shouldDirty: true })} />
          <p className="text-xs text-muted-foreground">Aparece no cabeçalho do Report Semanal. Sem sigla, usa o identificador.</p>
          {e.tag_curta && <p className="text-xs text-destructive">{e.tag_curta.message}</p>}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="google_place_id">Google Place ID</Label>
          <Input id="google_place_id" {...form.register("google_place_id")} placeholder="ChIJ…" />
          <p className="text-xs text-muted-foreground">Opcional. Usado para buscar a nota e as avaliações do Google no Report Semanal.</p>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {onCancelar && <Button type="button" variant="outline" onClick={onCancelar}>Cancelar</Button>}
        <Button type="submit" disabled={salvando || (editar && !mudou)}>{salvando ? "Salvando…" : editar ? "Salvar dados" : "Criar cliente"}</Button>
      </div>
    </form>
  );
}

/** Botão "Novo cliente": cria e abre o cadastro do cliente para seguir configurando. */
export function NovoCliente() {
  const [aberto, setAberto] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button onClick={() => setAberto(true)} className="gap-2"><Plus className="h-4 w-4" />Novo cliente</Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo cliente</DialogTitle>
            <DialogDescription>Depois de criar, você segue para as metas, as fontes de dados e a estrutura dos relatórios.</DialogDescription>
          </DialogHeader>
          {aberto && <CadastroForm cliente={null} onCancelar={() => setAberto(false)} onSalvo={(id) => { setAberto(false); router.push(`/clientes/${id}`); }} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
