"use client";

import { FileDown } from "lucide-react";

export function BotaoImprimir() {
  return (
    <button type="button" onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-md bg-[#7B099C] px-4 py-2 text-sm font-semibold text-white shadow hover:bg-[#65077f]">
      <FileDown className="h-4 w-4" />Salvar PDF
    </button>
  );
}
