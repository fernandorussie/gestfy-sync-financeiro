export const revalidate = 0;
export const maxDuration = 60;

import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { calcularFechamento, type ResultadoFechamento } from "@/lib/fechamentos/servidor";
import { extrasDe, normalizarEstrutura, type ItemSecao } from "@/lib/fechamentos/estrutura";
import { ErroAmigavel } from "../../(app)/fechamentos/_components/erro-amigavel";
import { nomePeriodo } from "../../(app)/fechamentos/_components/formato";
import { CSS, temAnalise } from "./relatorio";
import { RelatorioEstruturado } from "./relatorio-estruturado";
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

export default async function FechamentoPdfPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ analise?: string; previa?: string }> }) {
  const { id } = await params;
  const { analise: pedido, previa } = await searchParams;
  let r: ResultadoFechamento | null = null;
  let erro: unknown = null;
  try {
    r = await carregar(id);
  } catch (e) {
    erro = e;
  }

  if (!r) {
    return (
      <div className="mx-auto max-w-xl space-y-3 p-10">
        <h1 className="text-lg font-semibold">Não foi possível montar o relatório</h1>
        <ErroAmigavel erro={erro} voltar={{ href: "/fechamentos", rotulo: "Voltar aos fechamentos" }} />
      </div>
    );
  }

  const f = r.fechamento;
  // Prévia do editor de Estrutura: usa a estrutura enviada (ainda não salva) só nesta visualização.
  let estruturaBase: ItemSecao[] = r.estrutura;
  if (previa) {
    try { estruturaBase = normalizarEstrutura(JSON.parse(Buffer.from(previa, "base64url").toString("utf8")), f.tipo, extrasDe(r.personalizadas, r.secoes)); } catch { /* endereço inválido: estrutura salva */ }
  }
  // A página de análise segue a estrutura da clínica; o link da barra pode ligar ou tirar só nesta visualização.
  const naEstrutura = estruturaBase.some((s) => s.id === "analise" && s.ativa);
  const comAnalise = pedido === "1" ? true : pedido === "0" ? false : naEstrutura;
  const estrutura = estruturaBase.map((s) => (s.id === "analise" ? { ...s, ativa: comAnalise } : s));
  return (
    <div className="pdf py-6 font-sans text-[#1d1b22]">
      <style>{CSS}</style>
      <div className="pdf-sem-impressao mx-auto mb-5 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-2">
        <div className="text-sm">
          <Link href={`/fechamentos/${f.id}`} className="font-medium underline">Voltar ao fechamento</Link>
          <span className="ml-2 text-[#6B6577]">{previa ? "Exemplo com a estrutura do editor (não salva)" : r.congelado ? `Versão ${f.versao} concluída` : "Prévia: o fechamento ainda não foi concluído"}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {temAnalise(r) && (
            <Link href={`/fechamentos-pdf/${f.id}?analise=${comAnalise ? "0" : "1"}${previa ? `&previa=${previa}` : ""}`} replace className="text-sm font-medium underline">
              {comAnalise ? "Tirar a página de análise" : "Incluir página de análise e plano de ação"}
            </Link>
          )}
          <BotaoImprimir />
        </div>
      </div>
      <RelatorioEstruturado r={r} estrutura={estrutura} />
    </div>
  );
}
