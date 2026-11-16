export const revalidate = 0;
export const maxDuration = 30;

import Link from "next/link";
import { notFound } from "next/navigation";
import { Trophy } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { diasUteisDoMes, diasUteisDecorridos } from "@/lib/dias-uteis";
import { resolverAtivos } from "@/lib/checkpoint/indicadores";
import type { FontesFechamento } from "@/lib/fechamentos/coleta";
import { limparFicha, type FichaClinica } from "@/lib/fechamentos/ficha";
import { limparFontePersonalizada, type FontePersonalizada } from "@/lib/fechamentos/fonte-personalizada";
import { CATALOGO, SECOES_DESTINO, extrasDe, limparEstrutura, type EstruturaRelatorio } from "@/lib/fechamentos/estrutura";
import { migracoesPendentes } from "@/lib/fechamentos/banco";
import { indisponiveis } from "@/lib/fechamentos/blocos";
import type { Indicadores } from "@/lib/fechamentos/indicadores";
import type { FonteDados, Meta, TipoFonte, TipoMeta } from "@/lib/supabase/types";
import { nomePeriodo } from "../../fechamentos/_components/formato";
import { AvisoBanco } from "../../fechamentos/_components/aviso-banco";
import { FontesDados } from "../../fechamentos/configurar/[clinicaId]/fontes-dados";
import { EstruturaRelatorioCard } from "../../fechamentos/configurar/[clinicaId]/estrutura-relatorio";
import { FichaClinicaCard } from "../../fechamentos/configurar/[clinicaId]/ficha-clinica";
import { FonteSection } from "../../clinicas/[id]/fontes/_components/fonte-section";
import { IndicadoresForm } from "../../clinicas/[id]/checkpoint/_components/indicadores-form";
import { MetasClient } from "../../clinicas/[id]/metas/_components/metas-client";
import { historicoDoCliente } from "../../clinicas/actions";
import { CadastroForm } from "../_components/cadastro-form";
import { SituacaoCliente } from "../_components/situacao-cliente";
import { AbasCliente } from "./abas-cliente";
import { abaDoEndereco } from "./abas";
import { PlanilhasCliente } from "./planilhas-cliente";

type MetaComTipo = Meta & { tipos_meta: TipoMeta };

const FONTES_SEMANAL: { tipo: TipoFonte; titulo: string; descricao: string }[] = [
  { tipo: "faturamento", titulo: "Faturamento", descricao: "Lançamentos de receita (data, categoria, valor pago, profissional)." },
  { tipo: "despesa", titulo: "Despesas", descricao: "Lançamentos de despesas (data, categoria, valor pago)." },
  { tipo: "leads", titulo: "Leads", descricao: "Pipeline de leads: cada linha é um lead, com a coluna de conversão." },
  { tipo: "nps", titulo: "NPS", descricao: "Respostas da pesquisa de satisfação depois do atendimento." },
  { tipo: "pre_consulta", titulo: "Pré-consulta", descricao: "Respostas da pesquisa feita antes do atendimento." },
];

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

  const [{ data: cliente }, { data: config }, pendentes, { data: recentes }, { data: fontesSemanal }, { data: linhasCheckpoint }, { data: rawMetas }, { data: tiposMeta }, { data: feriados }, historico] = await Promise.all([
    db.from("clinicas").select("id, nome, slug, tag_curta, google_place_id, ativa").eq("id", id).maybeSingle(),
    db.from("fechamento_config").select("*").eq("clinica_id", id).maybeSingle(),
    migracoesPendentes(db),
    db.from("fechamentos").select("id, tipo, inicio, fim, indicadores").eq("clinica_id", id).order("inicio", { ascending: false }).order("versao", { ascending: false }).limit(12),
    db.from("fontes_dados").select("*").eq("clinica_id", id),
    db.from("checkpoint_indicadores").select("indicador, ativo").eq("clinica_id", id),
    db.from("metas").select("*, tipos_meta(*)").eq("clinica_id", id).eq("mes", mes).eq("ano", ano).order("tipos_meta(ordem_exibicao)", { ascending: true }),
    db.from("tipos_meta").select("*").order("ordem_exibicao", { ascending: true }),
    db.from("feriados").select("data"),
    historicoDoCliente(id),
  ]);
  if (!cliente) notFound();

  /* ---------- Relatórios Financeiros (fontes, estrutura, perfil) ---------- */
  const cfg = (config ?? {}) as { fontes?: unknown; fontes_extras?: unknown; relatorio?: unknown; ficha?: unknown };
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

  /* ---------- Report Semanal e Checkpoint ---------- */
  const semanal = (fontesSemanal ?? []) as FonteDados[];
  const tiposFonte = semanal.map((f) => f.tipo as TipoFonte);
  const ativosCheckpoint = resolverAtivos(linhasCheckpoint ?? [], tiposFonte);

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
            {prontoFin ? "Pronto para os fechamentos" : "Fechamentos: faltam vendas e despesas"}
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
              <PlanilhasCliente semanal={semanal} financeiro={fontesFin} extras={extras.map((x) => ({ nome: x.nome, aba: x.aba }))} checkpoint={new Set(ativosCheckpoint)} />
              {secao("Relatórios Quinzenal e Mensal", "Planilhas lidas nos fechamentos. Vendas e despesas são obrigatórias; as outras ligam seções extras do relatório.",
                <FontesDados clinicaId={cliente.id} padraoInicial={fontesFin} extrasIniciais={extras} destinos={destinos} />)}
              {secao("Report Semanal", "Planilhas lidas na geração do Report Semanal e na conferência do Checkpoint.",
                <div className="space-y-4">
                  {FONTES_SEMANAL.map((f) => (
                    <FonteSection key={f.tipo} tipo={f.tipo} title={f.titulo} description={f.descricao} clinicaId={cliente.id} fonte={semanal.find((x) => x.tipo === f.tipo) ?? null} />
                  ))}
                </div>)}
              {secao("Checkpoint", "O que o Checkpoint confere toda semana para este cliente.",
                <IndicadoresForm clinicaId={cliente.id} ativosIniciais={ativosCheckpoint} tiposFonte={tiposFonte} jaSalvo={(linhasCheckpoint ?? []).length > 0} />, "checkpoint")}
            </>
          ),
          estrutura: (
            <>
              <EstruturaRelatorioCard key={JSON.stringify(extrasDe(extras))} clinicaId={cliente.id} extrasFontes={extrasDe(extras)} inicial={estrutura} porSecao={porSecao} indisponiveis={semDados} exemplos={exemplos} pronto={prontoFin} />
              <section className="space-y-1 rounded-lg border border-dashed bg-card p-5">
                <h2 className="font-semibold">Report Semanal</h2>
                <p className="text-sm text-muted-foreground">Hoje o Report Semanal usa o modelo fixo da Gestfy, igual para todos os clientes. A edição da estrutura, como no Quinzenal e no Mensal, é a próxima etapa.</p>
              </section>
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
