const ROTULOS = {
  conferencia: ["Em conferência", "bg-amber-500/10 text-amber-700 dark:text-amber-400"],
  analise: ["Em análise", "bg-primary/10 text-primary"],
  concluido: ["Concluído", "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"],
  enviado: ["Enviado", "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"],
} as const;

export function StatusFechamento({ status }: { status: keyof typeof ROTULOS }) {
  const [rotulo, cor] = ROTULOS[status] ?? ROTULOS.conferencia;
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cor}`}>{rotulo}</span>;
}
