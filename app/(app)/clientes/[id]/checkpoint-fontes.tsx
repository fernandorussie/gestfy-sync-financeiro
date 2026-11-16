"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { CadenciaEscolha } from "@/lib/checkpoint/fontes";
import { salvarCadenciaCheckpoint } from "../actions";

/**
 * O que o Checkpoint confere: todas as fontes configuradas do cliente, cada
 * uma com a sua régua de atraso. Muda e salva na hora.
 */
export function CheckpointFontes({ clinicaId, fontes }: { clinicaId: string; fontes: { id: string; rotulo: string; cadencia: CadenciaEscolha }[] }) {
  const [valores, setValores] = useState(() => Object.fromEntries(fontes.map((f) => [f.id, f.cadencia])) as Record<string, CadenciaEscolha>);
  const [salvando, iniciar] = useTransition();
  const mudar = (id: string, cadencia: CadenciaEscolha) => {
    const antes = valores[id];
    setValores((v) => ({ ...v, [id]: cadencia }));
    iniciar(async () => {
      const r = await salvarCadenciaCheckpoint({ clinicaId, fonte: id, cadencia });
      if ("error" in r) { toast.error(r.error); setValores((v) => ({ ...v, [id]: antes })); }
      else toast.success("Checkpoint atualizado.");
    });
  };
  return (
    <section id="checkpoint" className="space-y-3 rounded-lg border bg-card p-5">
      <div className="space-y-1">
        <h2 className="font-semibold">Checkpoint</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Toda semana o Checkpoint confere se cada planilha deste cliente está em dia: quando foi o último lançamento e, em vendas, despesas e entradas, se há lançamento sem categoria. Diária = alerta com mais de 2 dias úteis sem lançamento; semanal = mais de 5.
        </p>
      </div>
      {fontes.length === 0
        ? <p className="text-sm text-muted-foreground">Nenhuma fonte configurada ainda. As fontes que você configurar acima aparecem aqui.</p>
        : (
          <ul className="divide-y rounded-md border">
            {fontes.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="text-sm font-medium">{f.rotulo}</span>
                <select aria-label={`Checkpoint de ${f.rotulo}`} disabled={salvando} value={valores[f.id]} onChange={(e) => mudar(f.id, e.target.value as CadenciaEscolha)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm">
                  <option value="diaria">Conferir: diária (2 dias úteis)</option>
                  <option value="semanal">Conferir: semanal (5 dias úteis)</option>
                  <option value="nao">Não conferir</option>
                </select>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
