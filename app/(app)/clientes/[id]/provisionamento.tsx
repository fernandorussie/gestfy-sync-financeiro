"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { METODOS_PROVISAO, type MetodoProvisao } from "@/lib/fechamentos/ritmo";
import { salvarProvisionamento } from "../actions";

/**
 * Como o Quinzenal calcula o "Provisionado a pagar" deste cliente. O consultor
 * escolhe; o sistema nunca troca sozinho. Vale para os próximos cálculos
 * (fechamentos concluídos ficam como foram entregues).
 */
export function ProvisionamentoCliente({ clinicaId, inicial }: { clinicaId: string; inicial: MetodoProvisao }) {
  const [metodo, setMetodo] = useState<MetodoProvisao>(inicial);
  const [salvando, iniciar] = useTransition();
  const mudar = (m: MetodoProvisao) => {
    const antes = metodo;
    setMetodo(m);
    iniciar(async () => {
      const r = await salvarProvisionamento({ clinicaId, metodo: m });
      if ("error" in r) { toast.error(r.error); setMetodo(antes); }
      else toast.success("Método do provisionamento salvo. Recalcule o quinzenal em andamento para aplicar.");
    });
  };
  return (
    <section id="provisionamento" className="space-y-3 rounded-lg border bg-card p-5">
      <div className="space-y-1">
        <h2 className="font-semibold">Provisionado a pagar (Quinzenal)</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">Como o relatório quinzenal estima o que ainda falta pagar no mês. O método aparece no relatório.</p>
      </div>
      <div role="radiogroup" aria-label="Método do provisionamento" className="grid gap-2 sm:grid-cols-2">
        {METODOS_PROVISAO.map((m) => (
          <label key={m.id} className={`flex cursor-pointer gap-3 rounded-md border p-3 text-sm ${metodo === m.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
            <input type="radio" name="provisionamento" className="mt-1" checked={metodo === m.id} disabled={salvando} onChange={() => mudar(m.id)} />
            <span><span className="font-medium">{m.rotulo}</span><span className="block text-xs text-muted-foreground">{m.descricao}</span></span>
          </label>
        ))}
      </div>
      {metodo === "contas" && (
        <p className="text-xs text-muted-foreground">
          A planilha de Despesas precisa ter <b>Data de vencimento</b> e <b>Situação</b> (Quitado / Em aberto / Atrasado) ou <b>Valor em aberto</b>. Entram os lançamentos com vencimento no mês ainda não pagos no fim da quinzena (parciais pelo saldo); vencidos de meses anteriores e cancelados ficam fora. Se faltar alguma coluna, o relatório mostra o provisionado como pendente e a conferência avisa.
        </p>
      )}
    </section>
  );
}
