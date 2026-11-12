import { Loader2 } from "lucide-react";

/** Tela de carregamento do módulo: esqueleto da página e o que está acontecendo. */
export function Carregando({ mensagem, cards = 4, linhas = 6 }: { mensagem: string; cards?: number; linhas?: number }) {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-7 w-72 max-w-full animate-pulse rounded bg-muted" />
      </div>
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{mensagem}</p>
      {cards > 0 && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: cards }, (_, k) => <div key={k} className="h-24 animate-pulse rounded-lg border bg-muted/40" />)}</div>}
      <div className="space-y-2 rounded-lg border p-4">{Array.from({ length: linhas }, (_, k) => <div key={k} className="h-5 animate-pulse rounded bg-muted/60" style={{ width: `${90 - (k % 3) * 15}%` }} />)}</div>
    </div>
  );
}
