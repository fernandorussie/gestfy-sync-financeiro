import fixture from "./fixtures/claros-2026-10.json";
import { lerAvaliacoes, lerDespesas, lerLeads, lerNps, lerOrcamentos, lerVendas } from "../leitores";
import type { DadosFechamento } from "../indicadores";
import type { Celula } from "../texto";

type Bruto = Celula[][];

/** Lê a fixture da Claros (out/26) com o mapa da clínica: a unidade fica na coluna R, sem cabeçalho. */
export function carregarClaros() {
  const f = fixture as unknown as Record<string, Bruto>;
  const leituras = {
    vendas: lerVendas(f.vendas, { colunas: { unidade: "R" } }),
    despesas: lerDespesas(f.despesas),
    orcamentos: lerOrcamentos(f.orcamentos),
    leads: lerLeads(f.leads),
    nps: lerNps(f.nps),
    avaliacoes: lerAvaliacoes(f.google),
  };
  const dados: DadosFechamento = {
    vendas: leituras.vendas.registros,
    despesas: leituras.despesas.registros,
    orcamentos: leituras.orcamentos.registros,
    leads: leituras.leads.registros,
    nps: leituras.nps.registros,
    avaliacoes: leituras.avaliacoes.registros,
  };
  return { leituras, dados, preConsulta: f.preConsulta };
}

export const OUTUBRO = { inicio: "2026-10-01", fim: "2026-10-31" };
