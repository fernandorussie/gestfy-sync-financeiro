"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { alterarSituacaoCliente, deleteClinica } from "../../clinicas/actions";

/**
 * Situação do cliente. Desativar é o caminho normal: nada se perde e dá para
 * reativar. Excluir de vez só aparece para cliente sem histórico nenhum
 * (cadastro feito por engano) e pede o nome digitado.
 */
export function SituacaoCliente({ id, nome, ativa, historico }: { id: string; nome: string; ativa: boolean; historico: { metas: number; reports: number; fechamentos: number } }) {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState<"desativar" | "excluir" | null>(null);
  const [digitado, setDigitado] = useState("");
  const [ocupado, iniciar] = useTransition();
  const temHistorico = historico.metas + historico.reports + historico.fechamentos > 0;

  const mudar = (nova: boolean) => iniciar(async () => {
    const r = await alterarSituacaoCliente(id, nova);
    if ("error" in r) { toast.error(r.error); return; }
    toast.success(nova ? "Cliente reativado." : "Cliente desativado. O histórico continua guardado.");
    setConfirmar(null);
    router.refresh();
  });
  const excluir = () => iniciar(async () => {
    const r = await deleteClinica(id, digitado);
    if ("error" in r) { toast.error(r.error); return; }
    toast.success("Cliente excluído.");
    router.push("/clientes");
  });

  const partes = [
    historico.metas && `${historico.metas} meta${historico.metas > 1 ? "s" : ""}`,
    historico.reports && `${historico.reports} report${historico.reports > 1 ? "s" : ""} semana${historico.reports > 1 ? "is" : "l"}`,
    historico.fechamentos && `${historico.fechamentos} fechamento${historico.fechamentos > 1 ? "s" : ""}`,
  ].filter(Boolean);

  return (
    <section className="space-y-3 rounded-lg border bg-card p-5">
      <div className="space-y-1">
        <h2 className="font-semibold">Situação</h2>
        <p className="text-sm text-muted-foreground">
          {ativa
            ? "Cliente ativo: aparece no Checkpoint, no Report Semanal e nos fechamentos do mês."
            : "Cliente inativo: não aparece nas listas do dia a dia. Todo o histórico continua guardado."}
          {temHistorico && ` Histórico: ${partes.join(", ")}.`}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {ativa
          ? <Button variant="outline" onClick={() => setConfirmar("desativar")} disabled={ocupado}>Desativar cliente</Button>
          : <Button onClick={() => mudar(true)} disabled={ocupado}>Reativar cliente</Button>}
        {!temHistorico && (
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { setDigitado(""); setConfirmar("excluir"); }} disabled={ocupado}>
            Excluir definitivamente
          </Button>
        )}
      </div>

      <AlertDialog open={confirmar === "desativar"} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar {nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              O cliente sai do Checkpoint, do Report Semanal e dos fechamentos do mês. Metas, fontes, reports e fechamentos ficam guardados, e você pode reativar quando quiser.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); mudar(false); }} disabled={ocupado}>{ocupado ? "Desativando…" : "Desativar"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmar === "excluir"} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {nome} definitivamente?</AlertDialogTitle>
            <AlertDialogDescription>
              Use só para um cadastro feito por engano. O cliente e as configurações dele são apagados e não dá para desfazer. Digite o nome do cliente para confirmar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={digitado} onChange={(e) => setDigitado(e.target.value)} placeholder={nome} aria-label="Nome do cliente" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); excluir(); }}
              disabled={ocupado || digitado.trim().toLowerCase() !== nome.trim().toLowerCase()}
              className="bg-destructive text-white hover:bg-destructive/90">
              {ocupado ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
