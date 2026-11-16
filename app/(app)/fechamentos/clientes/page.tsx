import { redirect } from "next/navigation";

/** Endereço antigo: "Clientes e configurações" virou o cadastro único em /clientes. */
export default function ClientesAntigo() {
  redirect("/clientes");
}
