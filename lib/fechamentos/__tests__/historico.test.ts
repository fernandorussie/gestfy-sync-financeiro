import { describe, it, expect } from "vitest";
import { agruparPeriodos, evolucaoMensal, indicadoresDe, type LinhaFechamento } from "../historico";

const ind = (fat: number) => ({ faturamento: { total: fat }, despesas: { total: fat / 2 }, caixa: { resultado: fat / 2 }, meta: { valor: 100, atingimento: fat / 100, falta: 0 }, pacientes: { atendidos: 10, ticketMedio: fat / 10, novos: 2 }, leads: null, orcamentos: null, nps: null });
const linha = (p: Partial<LinhaFechamento>): LinhaFechamento => ({
  id: "x", tipo: "mensal", inicio: "2026-10-01", fim: "2026-10-31", status: "analise", versao: 1, indicadores: null, snapshot: null, concluido_em: null, enviado_em: null, ...p,
});

describe("histórico", () => {
  const linhas = [
    linha({ id: "out-v1", versao: 1, status: "concluido", indicadores: ind(999), snapshot: { indicadores: ind(100) }, concluido_em: "2026-11-05" }),
    linha({ id: "out-v2", versao: 2, status: "analise", indicadores: ind(120) }),
    linha({ id: "set", inicio: "2026-09-01", fim: "2026-09-30", status: "enviado", snapshot: { indicadores: ind(150) } }),
    linha({ id: "q-nov", tipo: "quinzenal", inicio: "2026-11-01", fim: "2026-11-15", indicadores: ind(50) }),
  ];
  const periodos = agruparPeriodos(linhas);

  it("agrupa versões do mesmo período, mais nova primeiro, períodos do mais recente", () => {
    expect(periodos.map((p) => p.atual.id)).toEqual(["q-nov", "out-v2", "set"]);
    expect(periodos[1].anteriores.map((v) => v.id)).toEqual(["out-v1"]);
  });

  it("concluído usa o retrato congelado; em andamento usa o último cálculo", () => {
    expect(indicadoresDe(linhas[0])?.faturamento?.total).toBe(100);
    expect(indicadoresDe(linhas[1])?.faturamento?.total).toBe(120);
  });

  it("evolução só com mensais, em ordem cronológica, marcando o que é definitivo", () => {
    const e = evolucaoMensal(periodos);
    expect(e.map((p) => [p.mes, p.faturamento, p.definitivo])).toEqual([["2026-09", 150, true], ["2026-10", 120, false]]);
  });
});
