export const revalidate = 0;
// Leitura de até 6 planilhas na primeira abertura.
export const maxDuration = 60;

import Link from "next/link";
import { calcularFechamento, type ResultadoFechamento } from "@/lib/fechamentos/servidor";
import { FechamentoClient } from "./_components/fechamento-client";

export default async function FechamentoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ etapa?: string }> }) {
  const [{ id }, { etapa }] = await Promise.all([params, searchParams]);
  let resultado: ResultadoFechamento | null = null;
  let erro = "";
  try {
    resultado = await calcularFechamento(id);
  } catch (e) {
    erro = e instanceof Error ? e.message : "Erro inesperado.";
  }
  if (resultado) return <FechamentoClient inicial={resultado} etapaInicial={etapa} />;
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-8">
      <h1 className="text-xl font-semibold">Não foi possível abrir o fechamento</h1>
      <p className="text-sm text-muted-foreground">{erro}</p>
      <Link href="/fechamentos" className="text-sm font-medium text-primary hover:underline">Voltar aos fechamentos</Link>
    </div>
  );
}
