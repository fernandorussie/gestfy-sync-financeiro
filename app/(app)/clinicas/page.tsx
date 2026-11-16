import { redirect } from "next/navigation";

/** Endereço antigo: o cadastro de clientes agora fica em /clientes. */
export default function ClinicasAntigo() {
  redirect("/clientes");
}
