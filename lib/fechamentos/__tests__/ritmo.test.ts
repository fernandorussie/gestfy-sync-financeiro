import { describe, it, expect } from "vitest";
import type { DadosFechamento } from "../indicadores";
import { calcularRitmo, diasUteis } from "../ritmo";
import { carregarClaros } from "./carregar-fixture";

const { dados } = carregarClaros();

describe("dias úteis", () => {
  it("conta segunda a sexta e tira feriados", () => {
    // Outubro/2026: 22 dias úteis; 12/10 (segunda) é feriado.
    expect(diasUteis("2026-10-01", "2026-10-31", [])).toBe(22);
    expect(diasUteis("2026-10-01", "2026-10-31", ["2026-10-12"])).toBe(21);
    expect(diasUteis("2026-10-01", "2026-10-15", ["2026-10-12"])).toBe(10);
  });
});

describe("ritmo da 1ª quinzena", () => {
  // Outubro da fixture vira julho, agosto e setembro (histórico) e a 1ª quinzena de novembro é outubro até o dia 15 movido.
  const mover = (de: string, para: string, k = 1): Pick<DadosFechamento, "vendas" | "despesas"> => ({
    vendas: dados.vendas!.map((v) => ({ ...v, data: v.data.replace(de, para), valor: v.valor === null ? null : v.valor * k })),
    despesas: dados.despesas!.map((d) => ({ ...d, dataPagamento: d.dataPagamento?.replace(de, para) ?? null, valor: d.valor * k })),
  });
  const hist = [mover("2026-10", "2026-08", 0.9), mover("2026-10", "2026-09", 1.1)];
  const juntos: DadosFechamento = {
    ...dados,
    vendas: [...dados.vendas!, ...hist.flatMap((h) => h.vendas!)].map((v) => ({ ...v, data: v.data.replace("2026-10", "2026-11") })),
    despesas: [...dados.despesas!, ...hist.flatMap((h) => h.despesas!)].map((d) => ({ ...d, dataPagamento: d.dataPagamento?.replace("2026-10", "2026-11") ?? null })),
  };
  const r = calcularRitmo({ dados: juntos, periodo: { inicio: "2026-11-01", fim: "2026-11-15" }, feriados: ["2026-11-02", "2026-11-15", "2026-11-20"], meta: 150000 });

  it("dias úteis do mês e decorridos com feriados", () => {
    // Novembro/2026: 21 dias úteis; tirando 02/11 e 20/11 (15/11 é domingo) = 19. Até o dia 15: 10 − 1 = 9.
    expect(r.diasUteisMes).toBe(19);
    expect(r.diasUteisDecorridos).toBe(9);
    expect(r.diasUteisRestantes).toBe(10);
  });

  it("faturamento por dia, projeção e meta", () => {
    expect(r.faturamentoPorDia).toBeCloseTo(r.faturamento / 9, 1);
    expect(r.projecaoMes).toBeCloseTo(r.faturamentoPorDia * 19, 1);
    expect(r.faltaMeta).toBeCloseTo(150000 - r.faturamento, 1);
    expect(r.necessarioPorDia).toBeCloseTo((150000 - r.faturamento) / 10, 1);
  });

  it("média de despesas só com os meses que têm lançamento (ago e set; outubro vazio)", () => {
    expect(r.mesesMedia).toEqual(["2026-08", "2026-09"]);
    expect(r.mediaDespesas).toBeCloseTo(110850.14, 0); // (0,9 + 1,1) / 2 = 1,0 × outubro
    expect(r.provisionado).toBeCloseTo(Math.max(0, r.mediaDespesas! - r.despesasPagas), 1);
    expect(r.saldoPeriodo).toBeCloseTo(r.faturamento - r.despesasPagas, 1);
  });
});

import { calcularIndicadores } from "../indicadores";
import { rascunho, textoVazio, textoWhatsApp } from "../texto-fechamento";
import { decisoesVazias } from "../decisoes";

describe("catálogo de categorias e ordem", () => {
  // Fixture só tem outubro: num período de novembro, tudo aparece zerado.
  const nov = { inicio: "2026-11-01", fim: "2026-11-15" };
  const ind = calcularIndicadores(dados, nov, { catalogoDesde: "2025-11-01" });
  const sem = calcularIndicadores(dados, nov);

  it("mantém zeradas as categorias com lançamento nos últimos 12 meses", () => {
    expect(ind.faturamento!.porGrupo.length).toBeGreaterThanOrEqual(sem.faturamento!.porGrupo.length);
    const zeradas = ind.faturamento!.porGrupo.filter((g) => g.valor === 0 && g.quantidade === 0);
    expect(zeradas.length).toBe(ind.faturamento!.porGrupo.length - sem.faturamento!.porGrupo.length);
    const catsCom = ind.despesas!.porGrupo.flatMap((g) => g.categorias).length;
    const catsSem = sem.despesas!.porGrupo.flatMap((g) => g.categorias).length;
    expect(catsCom).toBeGreaterThan(catsSem);
    expect(ind.despesas!.total).toBe(sem.despesas!.total);
  });

  it("receitas em ordem alfabética, com Outros no fim", () => {
    const nomes = ind.faturamento!.porGrupo.map((g) => g.nome);
    const semOutros = nomes.filter((n) => n !== "Outros");
    expect(semOutros).toEqual([...semOutros].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" })));
    if (nomes.includes("Outros")) expect(nomes.at(-1)).toBe("Outros");
  });
});

describe("texto do quinzenal", () => {
  const periodo = { inicio: "2026-10-01", fim: "2026-10-15" };
  const ind = calcularIndicadores(dados, periodo, { meta: 188000 });
  const ant = calcularIndicadores(dados, { inicio: "2026-09-01", fim: "2026-09-15" });
  const ritmo = calcularRitmo({ dados, periodo, feriados: ["2026-10-12"], meta: 188000 });
  const r = rascunho({ clinica: "Claros Clinic", tipo: "quinzenal", indicadores: ind, anterior: ant, alertas: [], decisoes: decisoesVazias(), ritmo });

  it("abre como parcial e traz ritmo e projeção", () => {
    expect(r.observacao).toContain("Segue o parcial da 1ª quinzena de outubro.");
    expect(r.observacao).toContain(`No ritmo atual, de`);
    expect(r.observacao).toContain("(10 de 21 dias úteis)");
    expect(r.observacao).toContain("por dia útil nos 11 dias úteis restantes");
    expect(r.observacao).not.toContain("Atingimos");
  });

  it("WhatsApp com projeção e plano para a 2ª quinzena", () => {
    const t = textoWhatsApp({ clinica: "Claros Clinic", tipo: "quinzenal", periodoNome: "1ª quinzena de outubro/2026", indicadores: ind, anterior: ant, texto: { ...textoVazio(), observacao: "x" }, ritmo,
      acoes: [{ id: "1", titulo: "Ação", descricao: "", responsaveis: [], prazo: null, indicador: "" }] });
    expect(t.startsWith("Relatório Quinzenal de Resultados - 1ª quinzena de outubro/2026 (Claros Clinic)")).toBe(true);
    expect(t).toContain("Até o dia 15: R$");
    expect(t).toContain("📈 Projeção do mês:");
    expect(t).toContain("🎯 Plano de Ação para a 2ª quinzena");
  });
});
