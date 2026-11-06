"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { criarFechamento } from "../actions";

function mesAnterior(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function NovoFechamento({ clinicas }: { clinicas: { id: string; nome: string }[] }) {
  const router = useRouter();
  const [clinicaId, setClinicaId] = useState(clinicas[0]?.id ?? "");
  const [tipo, setTipo] = useState<"mensal" | "quinzenal">("mensal");
  const [mes, setMes] = useState(mesAnterior());
  const [pendente, iniciar] = useTransition();

  if (!clinicas.length) {
    return (
      <Card><CardContent className="p-6 text-sm text-muted-foreground">Nenhuma clínica com planilhas configuradas. Use “Configurar” na lista de clínicas abaixo.</CardContent></Card>
    );
  }

  const abrir = () => iniciar(async () => {
    const r = await criarFechamento({ clinicaId, tipo, mes });
    if (!r.ok) { toast.error(r.erro); return; }
    router.push(`/fechamentos/${r.dados.id}`);
  });

  const campo = "h-9 rounded-md border border-input bg-background px-3 text-sm";
  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-4 p-5">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1.5 text-sm font-medium">
          Clínica
          <select className={campo} value={clinicaId} onChange={(e) => setClinicaId(e.target.value)}>
            {clinicas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
        <div className="flex flex-col gap-1.5 text-sm font-medium">
          Tipo
          <div className="inline-flex rounded-md border p-0.5" role="group">
            {(["mensal", "quinzenal"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTipo(t)} aria-pressed={tipo === t}
                className={`rounded px-3 py-1.5 text-sm ${tipo === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                {t === "mensal" ? "Mensal" : "Quinzenal"}
              </button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Mês
          <input type="month" className={campo} value={mes} onChange={(e) => setMes(e.target.value)} />
        </label>
        {tipo === "quinzenal" && (
          <p className="text-xs text-muted-foreground">Parcial do dia 1 ao 15, com ritmo e projeção do mês. O fim do mês fica com o fechamento mensal.</p>
        )}
        <Button onClick={abrir} disabled={pendente || !mes}>
          {pendente ? <Loader2 className="animate-spin" /> : <Plus />}Abrir fechamento
        </Button>
      </CardContent>
    </Card>
  );
}
