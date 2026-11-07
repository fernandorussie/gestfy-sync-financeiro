"use client";

import { useState, type ReactNode } from "react";

export type AbaConfig = "fontes" | "estrutura" | "perfil";

const ABAS: { id: AbaConfig; rotulo: string }[] = [
  { id: "fontes", rotulo: "Fontes de dados" },
  { id: "estrutura", rotulo: "Estrutura do relatório" },
  { id: "perfil", rotulo: "Perfil do cliente" },
];

/**
 * Abas da configuração. As três ficam montadas (só escondidas), para não
 * perder o que foi editado e não salvo ao trocar de aba. A aba aberta vai
 * para o endereço (?aba=), então um link pode abrir direto nela.
 */
export function AbasConfig({ inicial, fontes, estrutura, perfil }: { inicial: AbaConfig; fontes: ReactNode; estrutura: ReactNode; perfil: ReactNode }) {
  const [aba, setAba] = useState<AbaConfig>(inicial);
  const trocar = (a: AbaConfig) => {
    setAba(a);
    const url = new URL(window.location.href);
    url.searchParams.set("aba", a);
    window.history.replaceState(null, "", url);
  };
  const paineis: Record<AbaConfig, ReactNode> = { fontes, estrutura, perfil };
  return (
    <div className="space-y-5">
      <div className="flex gap-1 overflow-x-auto border-b" role="tablist" aria-label="Configuração do cliente">
        {ABAS.map((a) => (
          <button key={a.id} type="button" role="tab" id={`aba-${a.id}`} aria-selected={aba === a.id} aria-controls={`painel-${a.id}`} onClick={() => trocar(a.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${aba === a.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {a.rotulo}
          </button>
        ))}
      </div>
      {ABAS.map((a) => (
        <div key={a.id} role="tabpanel" id={`painel-${a.id}`} aria-labelledby={`aba-${a.id}`} hidden={aba !== a.id}>{paineis[a.id]}</div>
      ))}
    </div>
  );
}
