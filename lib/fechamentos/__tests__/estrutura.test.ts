import { describe, it, expect } from "vitest";
import { estruturaPadrao, limparEstrutura, normalizarEstrutura, paginar } from "../estrutura";

describe("estrutura do relatório", () => {
  it("padrão mensal reproduz o relatório de sempre: 4 páginas, análise desligada", () => {
    const p = paginar(estruturaPadrao("mensal"), "mensal");
    expect(p.map((x) => [x.titulo, x.secoes.map((s) => s.id)])).toEqual([
      ["Resultado do mês", ["resultado", "grafico", "funilLeads", "funilOrcamentos", "experiencia"]],
      ["Receitas detalhadas", ["receitas"]],
      ["Despesas detalhadas", ["despesas"]],
      ["Caixa e competência no ano", ["regimes"]],
    ]);
  });

  it("padrão quinzenal: parcial do mês + receitas; funis em resumo", () => {
    const e = estruturaPadrao("quinzenal");
    expect(paginar(e, "quinzenal").map((x) => x.secoes.map((s) => s.id))).toEqual([["resultado", "ritmo", "caixaMes", "funilLeads", "funilOrcamentos"], ["receitas"]]);
    expect(e.find((s) => s.id === "funilLeads")!.nivel).toBe("resumo");
  });

  it("normaliza: mantém a ordem salva, liga as fixas, corrige nível e inclui seções que faltam", () => {
    const n = normalizarEstrutura([
      { id: "receitas", ativa: false, nivel: "xyz" },
      { id: "resultado", ativa: false },
      { id: "experiencia", ativa: false },
      { id: "inexistente", ativa: true },
      { id: "ritmo", ativa: true },
    ], "mensal");
    // Seções ausentes entram depois da vizinha anterior no padrão (despesas depois de receitas).
    expect(n.map((s) => s.id)).toEqual(["receitas", "despesas", "regimes", "analise", "resultado", "grafico", "funilLeads", "funilOrcamentos", "experiencia"]);
    expect(n.find((s) => s.id === "receitas")).toEqual({ id: "receitas", ativa: true, nivel: "todas" });
    expect(n.find((s) => s.id === "resultado")!.ativa).toBe(true);
    expect(n.find((s) => s.id === "experiencia")!.ativa).toBe(false);
  });

  it("seção pequena depois de uma grande abre página própria com seu título", () => {
    const e = normalizarEstrutura([{ id: "resultado" }, { id: "grafico" }, { id: "receitas" }, { id: "despesas" }, { id: "regimes" }, { id: "funilLeads" }, { id: "funilOrcamentos" }, { id: "experiencia" }, { id: "analise", ativa: true }], "mensal");
    const p = paginar(e, "mensal");
    expect(p.map((x) => x.titulo)).toEqual(["Resultado do mês", "Receitas detalhadas", "Despesas detalhadas", "Caixa e competência no ano", "Funil de leads", "Análise e plano de ação"]);
    expect(p[4].secoes.map((s) => s.id)).toEqual(["funilLeads", "funilOrcamentos", "experiencia"]);
  });

  it("limpa a estrutura vinda da tela para os dois tipos", () => {
    const l = limparEstrutura({ mensal: [{ id: "grafico", ativa: false }], quinzenal: "lixo" });
    expect(l.mensal!.find((s) => s.id === "grafico")!.ativa).toBe(false);
    expect(l.quinzenal).toEqual(estruturaPadrao("quinzenal"));
  });
});
