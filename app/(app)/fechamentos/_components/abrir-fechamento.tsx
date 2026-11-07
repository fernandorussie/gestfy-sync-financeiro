"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { criarFechamento } from "../actions";

/** Botão do painel do mês: abre (ou cria) o fechamento daquele cliente, tipo e mês. */
export function AbrirFechamento({ clinicaId, tipo, mes, rotulo }: { clinicaId: string; tipo: "mensal" | "quinzenal"; mes: string; rotulo?: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const abrir = () => iniciar(async () => {
    const r = await criarFechamento({ clinicaId, tipo, mes });
    if (!r.ok) { toast.error(r.erro); return; }
    router.push(`/fechamentos/${r.dados.id}`);
  });
  return (
    <button type="button" onClick={abrir} disabled={pendente}
      className="inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-1 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50">
      {pendente ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}{rotulo ?? "Abrir"}
    </button>
  );
}
