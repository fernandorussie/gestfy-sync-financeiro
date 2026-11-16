import { redirect } from "next/navigation";

/** Endereço antigo: as metas ficam na aba Metas do cliente (o mês escolhido vai junto). */
export default async function MetasAntigo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mes?: string; ano?: string }> }) {
  const [{ id }, { mes, ano }] = await Promise.all([params, searchParams]);
  const q = new URLSearchParams({ aba: "metas" });
  if (mes) q.set("mes", mes);
  if (ano) q.set("ano", ano);
  redirect(`/clientes/${id}?${q}`);
}
