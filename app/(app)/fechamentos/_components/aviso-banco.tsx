import { DatabaseZap } from "lucide-react";
import type { Migracao } from "@/lib/fechamentos/banco";

/** Aviso de atualização do banco pendente, com o arquivo a rodar no Supabase. */
export function AvisoBanco({ pendentes }: { pendentes: Migracao[] }) {
  if (!pendentes.length) return null;
  return (
    <div className="rounded-md border border-amber-400/60 bg-amber-50 p-4 text-sm dark:bg-amber-950/30" role="alert">
      <p className="flex items-center gap-2 font-medium"><DatabaseZap className="h-4 w-4 text-amber-600" />Falta atualizar o banco de dados</p>
      <p className="mt-1 text-muted-foreground">Rode no Supabase (SQL Editor), nesta ordem, o conteúdo de cada arquivo da pasta <code>supabase/migrations</code>:</p>
      <ul className="mt-2 space-y-0.5">
        {pendentes.map((m) => <li key={m.arquivo}><code className="font-medium">{m.arquivo}</code> <span className="text-muted-foreground">— {m.oQueFaz}</span></li>)}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">Os arquivos só acrescentam colunas e tabelas; nada existente é apagado. Até lá, as partes ligadas a eles ficam indisponíveis.</p>
    </div>
  );
}
