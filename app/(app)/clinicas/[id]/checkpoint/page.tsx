import { redirect } from "next/navigation";

/** Endereço antigo: os indicadores do Checkpoint ficam na aba Fontes de dados do cliente. */
export default async function CheckpointAntigo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/clientes/${id}?aba=fontes#checkpoint`);
}
