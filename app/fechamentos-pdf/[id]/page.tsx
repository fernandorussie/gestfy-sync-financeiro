export const revalidate = 0;
export const maxDuration = 60;

import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { calcularFechamento, type ResultadoFechamento } from "@/lib/fechamentos/servidor";
import { nomePeriodo } from "../../(app)/fechamentos/_components/formato";
import { CSS, Relatorio } from "./relatorio";
import { BotaoImprimir } from "./imprimir";

const carregar = cache((id: string) => calcularFechamento(id));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  try {
    const r = await carregar((await params).id);
    const f = r.fechamento;
    // O título vira o nome sugerido do arquivo ao salvar o PDF.
    return { title: `${r.clinicaNome} - Fechamento ${nomePeriodo(f.tipo, f.inicio, f.fim).replace("/", " ")}` };
  } catch {
    return { title: "Fechamento - Gestfy" };
  }
}

export default async function FechamentoPdfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let r: ResultadoFechamento | null = null;
  let erro = "";
  try {
    r = await carregar(id);
  } catch (e) {
    erro = e instanceof Error ? e.message : "Erro inesperado.";
  }

  if (!r) {
    return (
      <div className="mx-auto max-w-xl space-y-3 p-10">
        <h1 className="text-lg font-semibold">Não foi possível montar o relatório</h1>
        <p className="text-sm">{erro}</p>
        <Link href="/fechamentos" className="text-sm font-medium underline">Voltar aos fechamentos</Link>
      </div>
    );
  }

  const f = r.fechamento;
  return (
    <div className="pdf py-6 font-sans text-[#1d1b22]">
      <style>{CSS}</style>
      <div className="pdf-sem-impressao mx-auto mb-5 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-2">
        <div className="text-sm">
          <Link href={`/fechamentos/${f.id}`} className="font-medium underline">Voltar ao fechamento</Link>
          <span className="ml-2 text-[#6B6577]">{r.congelado ? `Versão ${f.versao} concluída` : "Prévia: o fechamento ainda não foi concluído"}</span>
        </div>
        <BotaoImprimir />
      </div>
      <Relatorio r={r} />
    </div>
  );
}
