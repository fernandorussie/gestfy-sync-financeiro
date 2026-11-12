"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

/**
 * Menu no celular e no tablet (abaixo de 1024 px): barra no topo com o botão ☰
 * e o mesmo conteúdo do menu lateral numa gaveta. Fecha ao navegar, com Esc
 * ou tocando fora.
 */
export function MenuMovel({ marca, children }: { marca: ReactNode; children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const caminho = usePathname();
  // Fecha ao trocar de página (ajuste de estado durante a renderização, sem efeito).
  const [ultimo, setUltimo] = useState(caminho);
  if (ultimo !== caminho) { setUltimo(caminho); setAberto(false); }
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("keydown", esc);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = antes; };
  }, [aberto]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-sidebar-border bg-sidebar px-3 lg:hidden">
        <button type="button" onClick={() => setAberto(true)} aria-label="Abrir menu" aria-expanded={aberto} aria-controls="menu-movel"
          className="rounded-md p-2 text-sidebar-foreground hover:bg-sidebar-accent">
          <Menu className="h-5 w-5" />
        </button>
        {marca}
      </header>
      {aberto && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Fechar menu" onClick={() => setAberto(false)} />
          <div id="menu-movel" className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-sidebar shadow-xl">
            <button type="button" onClick={() => setAberto(false)} aria-label="Fechar menu" className="absolute right-2 top-3 rounded-md p-2 text-sidebar-foreground hover:bg-sidebar-accent">
              <X className="h-5 w-5" />
            </button>
            {children}
          </div>
        </div>
      )}
    </>
  );
}
