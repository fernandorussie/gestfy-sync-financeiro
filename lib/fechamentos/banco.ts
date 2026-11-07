/**
 * Verifica se as atualizações do banco (supabase/migrations) do módulo
 * Fechamentos já foram aplicadas, testando uma coluna de cada uma.
 * Usado para avisar na tela em vez de quebrar com "column does not exist".
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Migracao { arquivo: string; tabela: string; coluna: string; oQueFaz: string }

export const MIGRACOES: Migracao[] = [
  { arquivo: "004_fechamentos.sql", tabela: "fechamentos", coluna: "id", oQueFaz: "tabelas do módulo" },
  { arquivo: "006_analise_entrega.sql", tabela: "fechamentos", coluna: "snapshot", oQueFaz: "análise, conclusão e histórico" },
  { arquivo: "007_ficha_clinica.sql", tabela: "fechamento_config", coluna: "ficha", oQueFaz: "perfil do cliente" },
  { arquivo: "008_estrutura_relatorio.sql", tabela: "fechamento_config", coluna: "relatorio", oQueFaz: "estrutura do relatório" },
  { arquivo: "009_fontes_personalizadas.sql", tabela: "fechamento_config", coluna: "fontes_extras", oQueFaz: "fontes personalizadas" },
  { arquivo: "010_metricas_fechamento.sql", tabela: "fechamento_metricas", coluna: "valor", oQueFaz: "base de comparativos" },
];

let cache: { em: number; pendentes: Migracao[] } | null = null;

/** Lista as migrações que faltam. Resultado "tudo certo" fica guardado por 5 minutos. */
export async function migracoesPendentes(db: SupabaseClient): Promise<Migracao[]> {
  if (cache && !cache.pendentes.length && Date.now() - cache.em < 5 * 60_000) return [];
  const res = await Promise.all(MIGRACOES.map(async (m) => {
    const { error } = await db.from(m.tabela).select(m.coluna).limit(1);
    return error && faltaColunaOuTabela(error) ? m : null;
  }));
  const pendentes = res.filter((m): m is Migracao => !!m);
  cache = { em: Date.now(), pendentes };
  return pendentes;
}

/** Erro do Postgres/PostgREST de coluna ou tabela inexistente. */
export function faltaColunaOuTabela(e: { message?: string; code?: string } | null | undefined): boolean {
  if (!e) return false;
  return e.code === "42703" || e.code === "42P01" || e.code === "PGRST204" || e.code === "PGRST205" || /does not exist|could not find/i.test(e.message ?? "");
}
