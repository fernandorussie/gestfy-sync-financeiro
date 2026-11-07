import { redirect } from "next/navigation";

/** Endereço antigo dos comparativos: agora é uma página própria no menu. */
export default async function ComparativosAntigo({ params }: { params: Promise<{ clinicaId: string }> }) {
  const { clinicaId } = await params;
  redirect(`/fechamentos/comparativos?cliente=${clinicaId}`);
}
