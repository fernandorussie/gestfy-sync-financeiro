/**
 * Métricas padronizadas de um fechamento: o mesmo conjunto de números para
 * todos os clientes, guardado na tabela fechamento_metricas ao concluir.
 * Alimenta os comparativos e prepara o benchmarking entre clientes (que vai
 * cruzar com região, segmento, área de atuação e porte do perfil do cliente).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Indicadores } from "./indicadores";
import type { Formato, Melhor, ResultadoPersonalizado } from "./fonte-personalizada";

export interface DefMetrica { id: string; rotulo: string; formato: Formato; melhor: Melhor; ler: (i: Indicadores) => number | null | undefined }

const x100 = (v: number | null | undefined) => (v == null ? null : Math.round(v * 1000) / 10);

/** Métricas padrão, iguais para todos os clientes (base do benchmarking). */
export const METRICAS_PADRAO: DefMetrica[] = [
  { id: "faturamento", rotulo: "Faturamento", formato: "moeda", melhor: "maior", ler: (i) => i.faturamento?.total },
  { id: "despesas", rotulo: "Despesas", formato: "moeda", melhor: "menor", ler: (i) => i.despesas?.total },
  { id: "resultado", rotulo: "Resultado de caixa", formato: "moeda", melhor: "maior", ler: (i) => i.caixa?.resultado },
  { id: "margem", rotulo: "Margem de caixa", formato: "percentual", melhor: "maior", ler: (i) => x100(i.caixa?.margem) },
  { id: "atingimento", rotulo: "Atingimento da meta", formato: "percentual", melhor: "maior", ler: (i) => x100(i.meta?.atingimento) },
  { id: "atendidos", rotulo: "Atendidos", formato: "numero", melhor: "maior", ler: (i) => i.pacientes?.atendidos },
  { id: "novos", rotulo: "Novos", formato: "numero", melhor: "maior", ler: (i) => i.pacientes?.novos },
  { id: "ticket", rotulo: "Ticket médio", formato: "moeda", melhor: "maior", ler: (i) => i.pacientes?.ticketMedio },
  { id: "leads", rotulo: "Leads", formato: "numero", melhor: "maior", ler: (i) => i.leads?.total },
  { id: "conversaoLeads", rotulo: "Conversão de leads", formato: "percentual", melhor: "maior", ler: (i) => x100(i.leads?.conversao) },
  { id: "conversaoOrcamentos", rotulo: "Conversão de orçamentos (valor)", formato: "percentual", melhor: "maior", ler: (i) => x100(i.orcamentos?.conversaoValor) },
  { id: "nps", rotulo: "NPS", formato: "numero", melhor: "maior", ler: (i) => i.nps?.nps },
];

export interface Metrica { indicador: string; rotulo: string; valor: number; formato: Formato; melhor: Melhor; comparavel: string | null }

export const idPersonalizada = (fonte: string, indicador: string) => `pers:${fonte}:${indicador}`;

/** Todas as métricas de um fechamento: padrão + indicadores personalizados sem agrupamento. */
export function metricasDoFechamento(i: Indicadores | null | undefined, personalizadas: ResultadoPersonalizado[] = []): Metrica[] {
  const out: Metrica[] = [];
  if (i) {
    for (const m of METRICAS_PADRAO) {
      const v = m.ler(i);
      if (v != null && Number.isFinite(v)) out.push({ indicador: m.id, rotulo: m.rotulo, valor: v, formato: m.formato, melhor: m.melhor, comparavel: m.id });
    }
  }
  for (const f of personalizadas) {
    if (f.erro) continue;
    for (const d of f.indicadores) {
      if (d.grupos || d.atual == null || !Number.isFinite(d.atual)) continue;
      out.push({ indicador: idPersonalizada(f.id, d.id), rotulo: `${d.nome} · ${f.nome}`, valor: d.atual, formato: d.formato, melhor: d.melhor, comparavel: f.comparavel ? `${f.comparavel}:${d.nome.toLowerCase()}` : null });
    }
  }
  return out;
}

/**
 * Grava (ou regrava) as métricas de um fechamento concluído. Sem a tabela
 * (atualização 010 não rodada), não faz nada: o fechamento conclui do mesmo jeito.
 */
export async function gravarMetricas(
  db: SupabaseClient<Database>,
  f: { id: string; clinica_id: string; tipo: "mensal" | "quinzenal"; inicio: string; fim: string; versao: number },
  metricas: Metrica[],
): Promise<boolean> {
  if (!metricas.length) return true;
  const { error } = await db.from("fechamento_metricas").upsert(metricas.map((m) => ({
    fechamento_id: f.id, clinica_id: f.clinica_id, tipo: f.tipo, inicio: f.inicio, fim: f.fim, versao: f.versao,
    indicador: m.indicador, valor: m.valor, comparavel: m.comparavel, formato: m.formato,
  })));
  return !error;
}
