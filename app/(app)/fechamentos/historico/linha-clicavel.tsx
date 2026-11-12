"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/** Linha de tabela que abre o fechamento ao clicar (links e menus dentro dela continuam funcionando). */
export function LinhaClicavel({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <tr className={`cursor-pointer ${className ?? ""}`}
      onClick={(e) => { if (!(e.target as HTMLElement).closest("a, button, summary, details, input, select")) router.push(href); }}>
      {children}
    </tr>
  );
}
