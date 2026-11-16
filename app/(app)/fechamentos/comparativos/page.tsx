export const revalidate = 0;
export const maxDuration = 60;

import Link from "next/link";
import { History } from "lucide-react";
import { explicarErro } from "@/lib/fechamentos/erros";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { anoDoCliente, comparativoDoCliente, type PontoComparativo } from "@/lib/fechamentos/servidor";
import { situacaoCliente } from "@/lib/fechamentos/historico";
import { PORTES, limparFicha, type FichaClinica } from "@/lib/fechamentos/ficha";
import { SEGMENTOS } from "@/lib/fechamentos/vocabulario";
import { cap, vocabularioDe } from "@/lib/fechamentos/vocabulario";
import {
  agruparDoEndereco, anoAnteriorDe, anteriorDe, diasDe, fatiar, intervaloDe, selecaoDoEndereco,
  type SelecaoPeriodo,
} from "@/lib/fechamentos/comparativos";
import { ComparativosView, SeletorCliente, type ModoComparativo } from "./comparativos-view";

type Busca = { cliente?: string; modo?: string; periodo?: string; ref?: string; atual?: string; agrupar?: string; comp?: string; bref?: string; clientes?: string };

/**
 * Comparativos: Evolução (padrão), Entre períodos e Entre clientes.
 * A escolha fica no endereço; trocar qualquer filtro recalcula no servidor.
 */
export default async function ComparativosPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const sp = await searchParams;
  const modo: ModoComparativo = sp.modo === "periodos" ? "periodos" : sp.modo === "clientes" ? "clientes" : "evolucao";
  const db = getSupabaseAdmin();
  // Clientes com vendas configuradas (os dados vêm das planilhas) ou com algum fechamento mensal.
  const [{ data: todos }, { data: comFechamento }, { data: configs }] = await Promise.all([
    db.from("clinicas").select("id, nome").eq("ativa", true).order("nome"),
    db.from("fechamentos").select("clinica_id").eq("tipo", "mensal").limit(2000),
    db.from("fechamento_config").select("clinica_id, fontes, ficha"),
  ]);
  const ids = new Set([
    ...(comFechamento ?? []).map((x) => x.clinica_id),
    ...(configs ?? []).filter((c) => situacaoCliente(c.fontes).situacao !== "nao_configurado").map((c) => c.clinica_id),
  ]);
  const clientes = (todos ?? []).filter((c) => ids.has(c.id));
  const clinica = clientes.find((c) => c.id === sp.cliente) ?? (clientes.length === 1 ? clientes[0] : undefined);

  const cabecalho = (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">Relatórios Financeiros</p>
      <h1 className="text-2xl font-semibold">Comparativos{clinica && modo !== "clientes" ? ` · ${clinica.nome}` : ""}</h1>
      <p className="max-w-3xl text-sm text-muted-foreground">Calculados das planilhas do cliente, com as mesmas regras dos fechamentos. Períodos com fechamento concluído usam os números entregues.</p>
    </div>
  );
  if (!clinica) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
        {cabecalho}
        <div className="rounded-lg border bg-card p-5">
          {clientes.length ? <SeletorCliente clientes={clientes} atual="" /> : <p className="text-sm text-muted-foreground">Nenhum cliente com planilhas configuradas. Configure em <Link href="/clientes" className="underline">Clientes</Link>.</p>}
        </div>
      </div>
    );
  }

  const sel: SelecaoPeriodo = selecaoDoEndereco(sp);
  const agrupar = agruparDoEndereco(sp.agrupar);
  const intv = intervaloDe(sel);
  const cfg = (configs ?? []).find((c) => c.clinica_id === clinica.id);
  const vocab = vocabularioDe(limparFicha(((cfg as { ficha?: unknown } | undefined)?.ficha ?? {}) as Partial<FichaClinica>));
  const rotulos = { atendidos: `${cap(vocab.clientes)} atendidos`, novos: `${cap(vocab.clientes)} novos` };

  let pontos: PontoComparativo[] = [];
  let erro: string | null = null;
  let ano: Awaited<ReturnType<typeof anoDoCliente>> = null;
  let periodoB: { sel: SelecaoPeriodo; intv: ReturnType<typeof intervaloDe> } | null = null;
  const comp = sp.comp === "ano" ? "ano" : sp.comp === "outro" && sp.bref ? "outro" : "anterior";
  try {
    if (modo === "clientes") {
      // Os números de cada cliente chegam um a um na própria tela (ver actions.ts).
    } else if (modo === "evolucao") {
      [{ pontos, erro }, ano] = await Promise.all([
        comparativoDoCliente(clinica.id, fatiar(intv, agrupar).map((f) => ({ ...f }))),
        anoDoCliente(clinica.id, intv.fim),
      ]);
    } else {
      const bSel: SelecaoPeriodo = comp === "ano" ? anoAnteriorDe(sel) : comp === "outro" ? { tipo: sel.tipo, ref: sp.bref } : anteriorDe(sel);
      periodoB = { sel: bSel, intv: intervaloDe(bSel) };
      const lista = [{ ...periodoB.intv, chave: "B" }, { ...intv, chave: "A" }].sort((x, y) => x.inicio.localeCompare(y.inicio));
      ({ pontos, erro } = await comparativoDoCliente(clinica.id, lista));
    }
  } catch (e) {
    const x = explicarErro(e);
    erro = `${x.titulo} ${x.acao}`;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {cabecalho}
        {modo !== "clientes" && <Link href={`/fechamentos/historico?cliente=${clinica.id}`} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"><History className="h-4 w-4" />Histórico deste cliente</Link>}
      </div>
      <ComparativosView
        key={clinica.id}
        clientes={clientes}
        clienteId={clinica.id}
        modo={modo}
        selecao={sel}
        agrupar={agrupar}
        intervalo={intv}
        comp={comp}
        bref={sp.bref ?? ""}
        periodoB={periodoB?.intv ?? null}
        tamanhosDiferentes={!!periodoB && Math.abs(diasDe(periodoB.intv) - diasDe(intv)) > 0.1 * Math.max(diasDe(periodoB.intv), diasDe(intv))}
        pontos={pontos}
        erro={erro}
        ano={ano}
        rotulos={rotulos}
        carteira={clientes.map((c) => {
          const f = limparFicha(((configs ?? []).find((x) => x.clinica_id === c.id) as { ficha?: unknown } | undefined)?.ficha as Partial<FichaClinica> ?? {});
          return { id: c.id, nome: c.nome, porte: f.porte ? PORTES[f.porte] : null, segmento: SEGMENTOS.find((x) => x.id === f.segmentoTipo)?.rotulo ?? null, uf: f.uf || null };
        })}
        selecionados={(sp.clientes ?? clinica.id).split(",").filter((x) => clientes.some((c) => c.id === x)).slice(0, 6)}
      />
    </div>
  );
}
