import { redirect } from "next/navigation";

/** Endereço antigo: a configuração dos Relatórios Financeiros fica no cadastro do cliente. */
export default async function ConfigurarAntigo({ params, searchParams }: { params: Promise<{ clinicaId: string }>; searchParams: Promise<{ aba?: string }> }) {
  const [{ clinicaId }, { aba }] = await Promise.all([params, searchParams]);
  const destino = aba === "estrutura" ? "estrutura" : aba === "perfil" ? "dados" : "fontes";
  redirect(`/clientes/${clinicaId}?aba=${destino}`);
}
