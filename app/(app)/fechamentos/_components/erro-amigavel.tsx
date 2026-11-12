import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { explicarErro } from "@/lib/fechamentos/erros";

/** Caixa de erro com o que fazer; o texto técnico fica recolhido em "ver detalhes". */
export function ErroAmigavel({ erro, voltar, tom = "erro" }: { erro: unknown; voltar?: { href: string; rotulo: string }; tom?: "erro" | "aviso" }) {
  const x = explicarErro(erro);
  const cor = tom === "erro" ? "border-destructive/40 bg-destructive/5" : "border-amber-400/60 bg-amber-50 dark:bg-amber-950/30";
  return (
    <div className={`rounded-lg border p-4 text-sm ${cor}`} role="alert">
      <p className="flex items-start gap-2 font-medium"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{x.titulo}</p>
      <p className="mt-1 pl-6 text-muted-foreground">{x.acao}</p>
      {x.detalhe && (
        <details className="mt-2 pl-6 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Ver detalhes</summary>
          <code className="mt-1 block whitespace-pre-wrap break-words">{x.detalhe}</code>
        </details>
      )}
      {voltar && <Link href={voltar.href} className="mt-3 inline-block pl-6 text-sm font-medium text-primary hover:underline">{voltar.rotulo}</Link>}
    </div>
  );
}
