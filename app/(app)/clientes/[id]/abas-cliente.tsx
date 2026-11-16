"use client";

import { useState, type ReactNode } from "react";

import { ABAS_CLIENTE, type AbaCliente } from "./abas";

/**
 * Abas do cadastro do cliente. Todas ficam montadas (só escondidas), para não
 * perder o que foi editado e não salvo ao trocar de aba. A aba aberta vai para
 * o endereço (?aba=), então um link pode abrir direto nela.
 */
export function AbasCliente({ inicial, paineis }: { inicial: AbaCliente; paineis: Record<AbaCliente, ReactNode> }) {
  const [aba, setAba] = useState<AbaCliente>(inicial);
  const trocar = (a: AbaCliente) => {
    setAba(a);
    const url = new URL(window.location.href);
    url.searchParams.set("aba", a);
    window.history.replaceState(null, "", url);
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-x-1 border-b" role="tablist" aria-label="Cadastro do cliente">
        {ABAS_CLIENTE.map((a) => (
          <button key={a.id} type="button" role="tab" id={`aba-${a.id}`} aria-selected={aba === a.id} aria-controls={`painel-${a.id}`} onClick={() => trocar(a.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${aba === a.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {a.rotulo}
          </button>
        ))}
      </div>
      {ABAS_CLIENTE.map((a) => (
        <div key={a.id} role="tabpanel" id={`painel-${a.id}`} aria-labelledby={`aba-${a.id}`} hidden={aba !== a.id} className="space-y-6">{paineis[a.id]}</div>
      ))}
    </div>
  );
}
