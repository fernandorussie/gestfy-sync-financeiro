export type AbaCliente = "dados" | "metas" | "fontes" | "estrutura" | "alvos";

export const ABAS_CLIENTE: { id: AbaCliente; rotulo: string }[] = [
  { id: "dados", rotulo: "Dados gerais" },
  { id: "metas", rotulo: "Metas" },
  { id: "fontes", rotulo: "Fontes de dados" },
  { id: "estrutura", rotulo: "Estrutura dos relatórios" },
  { id: "alvos", rotulo: "Alvos & Premiações" },
];

/** Aceita também os nomes de aba dos endereços antigos (Clínicas e Clientes e configurações). */
export function abaDoEndereco(aba: string | undefined): AbaCliente {
  if (aba === "perfil") return "dados";
  return ABAS_CLIENTE.some((a) => a.id === aba) ? (aba as AbaCliente) : "dados";
}

