import { redirect } from "next/navigation";

/** Endereço antigo: as fontes do Report Semanal ficam na aba Fontes de dados do cliente. */
export default async function FontesAntigo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/clientes/${id}?aba=fontes`);
}
