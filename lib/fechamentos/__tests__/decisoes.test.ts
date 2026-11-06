import { describe, it, expect } from "vitest";
import { conferir } from "../conferencia";
import { calcularIndicadores } from "../indicadores";
import { ajustesDasDecisoes, decidir, decisoesVazias, desfazer, gravesPendentes, metaEscolhida } from "../decisoes";
import { carregarClaros, OUTUBRO } from "./carregar-fixture";
import { periodoAnterior, periodoDe } from "../periodo";

const { dados, leituras } = carregarClaros();
const metas = [{ origem: "Meta mensal (GestfySync)", valor: 188000 }, { origem: "Meta ajustada do fechamento", valor: 150000 }];

describe("decisões da conferência", () => {
  it("fluxo completo da Claros: decidir os graves libera a análise e muda os números", () => {
    let d = decisoesVazias();
    let alertas = conferir({ dados, periodo: OUTUBRO, leituras, metas });
    expect(gravesPendentes(alertas, d).length).toBe(3); // rescisão, férias, metas

    for (const a of alertas.filter((x) => x.regra === "despesa-grupo-errado" && x.gravidade === "grave")) d = decidir(d, a, "aplicar");
    const meta = alertas.find((a) => a.regra === "metas-diferentes")!;
    d = decidir(d, meta, "aplicar", { meta: 150000 });

    const ajustes = ajustesDasDecisoes(d);
    expect(Object.values(ajustes.reclassificarDespesa ?? {}).sort()).toEqual(["Férias", "Rescisões"]);
    expect(metaEscolhida(d)).toBe(150000);

    alertas = conferir({ dados, periodo: OUTUBRO, leituras, ajustes, metas: [{ origem: "Meta escolhida", valor: 150000 }] });
    expect(gravesPendentes(alertas, d)).toEqual([]);
    const ind = calcularIndicadores(dados, OUTUBRO, { ajustes, meta: 150000 });
    expect(ind.despesas!.porGrupo.find((g) => g.nome === "Pessoal")!.valor).toBe(24969.39);
    expect(ind.meta!.atingimento).toBeCloseTo(0.7843, 4);
  });

  it("manter também libera um alerta grave, sem gerar ajuste", () => {
    const alertas = conferir({ dados, periodo: OUTUBRO, leituras, metas });
    const grave = alertas.find((a) => a.gravidade === "grave")!;
    const d = decidir(decisoesVazias(), grave, "manter");
    expect(gravesPendentes(alertas, d).map((a) => a.chave)).not.toContain(grave.chave);
    expect(ajustesDasDecisoes(d).reclassificarDespesa).toEqual({});
  });

  it("unificar entra nos ajustes e desfazer tira", () => {
    const alertas = conferir({ dados, periodo: OUTUBRO, leituras });
    const nomes = alertas.find((a) => a.regra === "nomes-parecidos")!;
    let d = decidir(decisoesVazias(), nomes, "aplicar");
    expect(ajustesDasDecisoes(d).unificar).toEqual({ profissional: { "Dra. Bia": "Dra. Bia Clara" } });
    d = desfazer(d, nomes.chave);
    expect(d.registro).toEqual([]);
  });

  it("decidir de novo o mesmo alerta substitui a decisão anterior", () => {
    const [a] = conferir({ dados, periodo: OUTUBRO, leituras, metas });
    let d = decidir(decisoesVazias(), a, "manter");
    d = decidir(d, a, "aplicar");
    expect(d.registro).toHaveLength(1);
    expect(d.registro[0].acao).toBe("aplicar");
  });
});

describe("períodos", () => {
  it("mensal e quinzenas", () => {
    expect(periodoDe("2026-10", "mensal")).toEqual({ inicio: "2026-10-01", fim: "2026-10-31" });
    expect(periodoDe("2026-02", "mensal")).toEqual({ inicio: "2026-02-01", fim: "2026-02-28" });
    expect(periodoDe("2026-10", "quinzenal", 2)).toEqual({ inicio: "2026-10-16", fim: "2026-10-31" });
  });
  it("período anterior: mês anterior e mesma quinzena do mês anterior, virando o ano", () => {
    expect(periodoAnterior({ inicio: "2026-10-01", fim: "2026-10-31" }, "mensal")).toEqual({ inicio: "2026-09-01", fim: "2026-09-30" });
    expect(periodoAnterior({ inicio: "2026-01-16", fim: "2026-01-31" }, "quinzenal")).toEqual({ inicio: "2025-12-16", fim: "2025-12-31" });
  });
});
