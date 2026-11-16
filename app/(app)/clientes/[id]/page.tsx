export const revalidate = 0;
export const maxDuration = 30;

import Link from "next/link";
import { notFound } from "next/navigation";
import { Trophy } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { diasUteisDoMes, diasUteisDecorridos } from "@/lib/dias-uteis";
import { FONTES_CHECKPOINT, cadenciaDa, idPersonalizadaCheckpoint } from "@/lib/checkpoint/fontes";
import { garantirFontesUnicas } from "@/lib/clientes/fontes-unicas";
import type { RegrasClinica } from "@/lib/fechamentos/indicadores";
import type { FontesFechamento } from "@/lib/fechamentos/coleta";
import { limparFicha, type FichaClinica } from "@/lib/fechamentos/ficha";
import { limparFontePersonalizada, type FontePersonalizada } from "@/lib/fechamentos/fonte-personalizada";
import { CATALOGO, SECOES_DESTINO, extrasDe, limparEstrutura, type EstruturaRelatorio } from "@/lib/fechamentos/estrutura";
import { migracoesPendentes } from "@/lib/fechamentos/banco";
import { indisponiveis } from "@/lib/fechamentos/blocos";
import type { Indicadores } from "@/lib/fechamentos/indicadores";
import type { Meta, TipoMeta } from "@/lib/supabase/types";
import { nomePeriodo } from "../../fechamentos/_components/formato";
import { AvisoBanco } from "../../fechamentos/_components/aviso-banco";
import { FontesDados } from "../../fechamentos/configurar/[clinicaId]/fontes-dados";
import { kpiPersonalizado } from "@/lib/relatorio/estrutura-semanal";
import { EstruturaRelatorioCard } from "../../fechamentos/configurar/[clinicaId]/estrutura-relatorio";
import { FichaClinicaCard } from "../../fechamentos/configurar/[clinicaId]/ficha-clinica";
import { MetasClient } from "../../clinicas/[id]/metas/_components/metas-client";
import { historicoDoCliente } from "../../clinicas/actions";
import { CadastroForm } from "../_components/cadastro-form";
import { SituacaoCliente } from "../_components/situacao-cliente";
import { AbasCliente } from "./abas-cliente";
import { abaDoEndereco } from "./abas";
import { CheckpointFontes } from "./checkpoint-fontes";

type MetaComTipo = Meta & { tipos_meta: TipoMeta };

/** O aviso das fontes trazidas do Report Semanal fica na tela por 30 dias. */
function recente(iso: string | undefined): boolean {
  return !!iso && Date.now() - Date.parse(iso) < 30 * 864e5;
}

/**
 * Cadastro único do cliente: tudo o que os módulos do GestfySync precisam,
 * em abas. Os dados continuam nas mesmas tabelas e com o mesmo ID de sempre;
 * esta página só reúne as telas que antes ficavam em Clínicas e em
 * Relatórios Financeiros → Clientes e configurações.
 */
export default async function ClientePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string; mes?: string; ano?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const hoje = new Date();
  const mes = Number(sp.mes) || hoje.getMonth() + 1;
  const ano = Number(sp.ano) || hoje.getFullYear();
  const db = getSupabaseAdmin();
  // Na primeira abertura, traz para a fonte única o que só estava configurado no Report Semanal.
  await garantirFontesUnicas(id).catch(() => undefined);

  const [{ data: cliente }, { data: config }, pendentes, { data: recentes }, { data: rawMetas }, { data: tiposMeta }, { data: feriados }, historico] = await Promise.all([
    db.from("clinicas").select("id, nome, slug, tag_curta, google_place_id, ativa").eq("id", id).maybeSingle(),
    db.from("fechamento_config").select("*").eq("clinica_id", id).maybeSingle(),
    migracoesPendentes(db),
    db.from("fechamentos").select("id, tipo, inicio, fim, indicadores").eq("clinica_id", id).order("inicio", { ascending: false }).order("versao", { ascending: false }).limit(12),
    db.from("metas").select("*, tipos_meta(*)").eq("clinica_id", id).eq("mes", mes).eq("ano", ano).order("tipos_meta(ordem_exibicao)", { ascending: true }),
    db.from("tipos_meta").select("*").order("ordem_exibicao", { ascending: true }),
    db.from("feriados").select("data"),
    historicoDoCliente(id),
  ]);
  const { count: antigasSemanal } = await db.from("fontes_dados").select("id", { count: "exact", head: true }).eq("clinica_id", id);
  if (!cliente) notFound();

  /* ---------- Relatórios Financeiros (fontes, estrutura, perfil) ---------- */
  const cfg = (config ?? {}) as { fontes?: unknown; fontes_extras?: unknown; relatorio?: unknown; ficha?: unknown; regras?: unknown };
  const regras = (cfg.regras ?? {}) as RegrasClinica;
  const extras: FontePersonalizada[] = (Array.isArray(cfg.fontes_extras) ? cfg.fontes_extras : []).map((x) => limparFontePersonalizada(x as Partial<FontePersonalizada>));
  const estrutura = limparEstrutura(cfg.relatorio, extrasDe(extras)) as Required<EstruturaRelatorio>;
  const soDe = (sid: string) => { const d = CATALOGO.find((s) => s.id === sid)!; return d.tipos.length === 1 ? ` (só ${d.tipos[0]})` : ""; };
  const destinos = [
    { id: "fonte", rotulo: "Seção da própria fonte" },
    ...SECOES_DESTINO.map((sid) => ({ id: sid, rotulo: `Dentro de: ${CATALOGO.find((s) => s.id === sid)!.titulo}${soDe(sid)}` })),
    ...estrutura.secoes.map((s) => ({ id: `sec:${s.id}`, rotulo: `Seção nova: ${s.titulo}` })),
  ];
  const porSecao: Record<string, string[]> = {};
  for (const f of extras) for (const d of f.indicadores.filter((x) => !x.oculto)) {
    const k = d.secao === "fonte" ? `fonte:${f.id}` : d.secao;
    (porSecao[k] ??= []).push(d.secao === "fonte" ? d.nome : `${d.nome} (${f.nome})`);
  }
  type Recente = { id: string; tipo: "mensal" | "quinzenal"; inicio: string; fim: string; indicadores: unknown };
  const lista = (recentes ?? []) as Recente[];
  const exemplos = Object.fromEntries((["mensal", "quinzenal"] as const).flatMap((t) => {
    const f = lista.find((x) => x.tipo === t);
    return f ? [[t, { id: f.id, rotulo: `${t === "mensal" ? "Mensal" : "Quinzenal"} · ${nomePeriodo(f.tipo, f.inicio, f.fim)}` }]] : [];
  }));
  const ultimoMensal = lista.find((x) => x.tipo === "mensal" && x.indicadores) ?? lista.find((x) => x.indicadores);
  const semDados = indisponiveis((ultimoMensal?.indicadores ?? null) as Indicadores | null);
  const fontesFin = (cfg.fontes ?? {}) as FontesFechamento;
  const prontoFin = !!(fontesFin.vendas && fontesFin.despesas);

  /* ---------- Checkpoint: todas as fontes configuradas ---------- */
  const fontesCheckpoint = [
    ...FONTES_CHECKPOINT.filter((f) => fontesFin[f.id]).map((f) => ({ id: f.id as string, rotulo: f.rotulo, cadencia: cadenciaDa(f.id, regras, f.padrao) })),
    ...extras.filter((x) => x.sheetId && x.aba && x.modo !== "posicao").map((x) => ({ id: idPersonalizadaCheckpoint(x.id), rotulo: `${x.nome} (personalizada)`, cadencia: cadenciaDa(idPersonalizadaCheckpoint(x.id), regras) })),
  ];

  /* ---------- Metas ---------- */
  const metas = (rawMetas ?? []) as unknown as MetaComTipo[];
  const feriadosDatas = (feriados ?? []).map((f) => f.data);
  const diasTotal = diasUteisDoMes(mes, ano, feriadosDatas);
  const mesAtual = hoje.getMonth() + 1, anoAtual = hoje.getFullYear();
  const diasDecorridos = ano < anoAtual || (ano === anoAtual && mes < mesAtual) ? diasTotal
    : ano === anoAtual && mes === mesAtual ? diasUteisDecorridos(hoje, feriadosDatas) : 0;

  const secao = (titulo: string, texto: string, filhos: React.ReactNode, id?: string) => (
    <div className="space-y-3" id={id}>
      <div className="space-y-0.5">
        <h2 className="text-lg font-semibold">{titulo}</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">{texto}</p>
      </div>
      {filhos}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground"><Link href="/clientes" className="hover:underline">Clientes</Link> / {cliente.nome}</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{cliente.nome}</h1>
          {!cliente.ativa && <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">Inativo</span>}
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${prontoFin ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"}`}>
            {prontoFin ? "Pronto para os relatórios" : "Faltam as planilhas de vendas e despesas"}
          </span>
        </div>
      </div>
      <AvisoBanco pendentes={pendentes} />
      <AbasCliente
        inicial={abaDoEndereco(sp.aba)}
        paineis={{
          dados: (
            <>
              <section className="space-y-4 rounded-lg border bg-card p-5">
                <div className="space-y-1">
                  <h2 className="font-semibold">Cadastro</h2>
                  <p className="text-sm text-muted-foreground">Dados básicos do cliente, usados em todos os módulos do GestfySync.</p>
                </div>
                <CadastroForm key={`${cliente.nome}|${cliente.slug}|${cliente.tag_curta}|${cliente.google_place_id}`} cliente={cliente} />
              </section>
              <FichaClinicaCard clinicaId={cliente.id} clinicaNome={cliente.nome} inicial={limparFicha((cfg.ficha ?? {}) as Partial<FichaClinica>)} />
              <SituacaoCliente id={cliente.id} nome={cliente.nome} ativa={cliente.ativa} historico={historico} />
            </>
          ),
          metas: (
            <section className="rounded-lg border bg-card p-5">
              <MetasClient clinicaId={cliente.id} clinicaNome={cliente.nome} mes={mes} ano={ano} metas={metas} tiposMeta={tiposMeta ?? []} diasTotal={diasTotal} diasDecorridos={diasDecorridos} />
            </section>
          ),
          fontes: (
            <>
              {regras.fontesUnicasNotas?.length && recente(regras.fontesUnicasEm) ? (
                <div className="rounded-lg border border-amber-400/60 bg-amber-50 p-4 text-sm dark:bg-amber-950/30" role="status">
                  <b className="font-medium">Fontes trazidas da configuração antiga do Report Semanal</b>
                  <ul className="mt-1 list-disc pl-5 text-muted-foreground">{regras.fontesUnicasNotas.map((n) => <li key={n}>{n}</li>)}</ul>
                </div>
              ) : null}
              {(antigasSemanal ?? 0) > 0 && (
                <p className="text-sm text-muted-foreground">
                  O Report Semanal passou a ler estas planilhas. <Link href={`/clientes/${cliente.id}/conferir-semanal`} className="font-medium text-primary underline-offset-2 hover:underline">Conferir uma semana: configuração antiga x fonte única →</Link>
                </p>
              )}
              {secao("Planilhas do cliente", "A base de dados do cliente. Cada planilha é configurada uma vez e vale para o Report Semanal, o Checkpoint e os relatórios Quinzenal e Mensal. Vendas e despesas são obrigatórias; as outras ligam seções extras dos relatórios.",
                <FontesDados clinicaId={cliente.id} padraoInicial={fontesFin} extrasIniciais={extras} destinos={destinos} />)}
              <CheckpointFontes key={fontesCheckpoint.map((f) => f.id).join("|")} clinicaId={cliente.id} fontes={fontesCheckpoint} />
            </>
          ),
          estrutura: (
            <>
              <EstruturaRelatorioCard key={JSON.stringify(extrasDe(extras))} clinicaId={cliente.id} extrasFontes={extrasDe(extras)}
                indicadoresPers={extras.flatMap((f) => f.indicadores.map((d) => ({ id: kpiPersonalizado(f.id, d.id), rotulo: `${d.nome || "Indicador"} · ${f.nome || "Fonte"}` })))} inicial={estrutura} porSecao={porSecao} indisponiveis={semDados} exemplos={exemplos} pronto={prontoFin} />
            </>
          ),
          alvos: (
            <section className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-card p-10 text-center">
              <Trophy className="h-8 w-8 text-muted-foreground" />
              <h2 className="font-semibold">Alvos & Premiações</h2>
              <p className="max-w-md text-sm text-muted-foreground">Este módulo ainda não foi construído. Quando estiver pronto, a configuração de alvos e premiações deste cliente fica aqui.</p>
            </section>
          ),
        }}
      />
    </div>
  );
}
