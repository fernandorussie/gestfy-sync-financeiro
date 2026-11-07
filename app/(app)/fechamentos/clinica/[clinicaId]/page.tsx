import { redirect } from "next/navigation";

/** Endereço antigo do histórico do cliente: agora é o Histórico com o filtro do cliente. */
export default async function HistoricoClienteAntigo({ params }: { params: Promise<{ clinicaId: string }> }) {
  const { clinicaId } = await params;
  redirect(`/fechamentos/historico?cliente=${clinicaId}`);
}
