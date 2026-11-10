import { describe, it, expect } from "vitest";
import { lerLeads, lerOrcamentos } from "../leitores";
import { calcularIndicadores, type DadosFechamento } from "../indicadores";
import { estruturaPadrao, limparEstrutura } from "../estrutura";

const vazio: DadosFechamento = { vendas: null, despesas: null, orcamentos: null, leads: null, nps: null, avaliacoes: null };
const out = { inicio: "2026-10-01", fim: "2026-10-31" };

describe("Etapa A", () => {
  const orc = lerOrcamentos([
    ["Data", "Status", "Valor orçado", "Valor da venda", "Motivo"],
    ["05/10/2026", "Fechado", "1.000,00", "1.000,00", ""],
    ["06/10/2026", "Não fechou", "2.000,00", "", "Preço"],
    ["07/10/2026", "Cancelado", "5.000,00", "", "Desistiu da cirurgia"],
    ["08/10/2026", "Em negociação", "1.000,00", "", ""],
  ]).registros;
  const leads = lerLeads([
    ["Data", "Canal", "Agendou?", "Objeção (caso não agende)"],
    ["01/10/2026", "Whats", "Sim", ""],
    ["02/10/2026", "Ligação", "Não", "Parou de responder"],
  ]).registros;

  it("orçamentos: motivos vêm da própria fonte; cancelados fora da conversão", () => {
    const i = calcularIndicadores({ ...vazio, orcamentos: orc, leads }, out);
    const o = i.orcamentos!;
    expect(o).toMatchObject({ total: 4, fechados: 1, naoFechou: 1, cancelados: 1, emAberto: 1, valorGerado: 9000, valorCancelado: 5000 });
    expect(o.conversaoQuantidade).toBeCloseTo(1 / 3);
    expect(o.conversaoValor).toBeCloseTo(1000 / 4000);
    expect(o.porObjecao?.map((x) => x.nome)).toEqual(expect.arrayContaining(["Preço", "Desistiu da cirurgia"]));
    expect(o.porObjecao?.some((x) => x.nome === "Parou de responder")).toBe(false);
  });

  it("leads: canal de entrada e objeção do lead separada", () => {
    const i = calcularIndicadores({ ...vazio, leads }, out);
    expect(i.leads?.porCanal?.map((x) => x.nome).sort()).toEqual(["Ligação", "Whats"]);
    expect(i.leads?.porObjecao.some((x) => x.nome === "Parou de responder")).toBe(true);
  });

  it("estrutura: Entradas detalhadas ligada e distribuição desligada no padrão; mínimo Gestfy fixo", () => {
    const p = estruturaPadrao("mensal");
    expect(p.find((s) => s.id === "entradas")).toMatchObject({ ativa: true, nivel: "categorias" });
    expect(p.find((s) => s.id === "distribuicao")?.ativa).toBe(false);
    // Estrutura salva antiga ganha as seções novas sem perder a ordem.
    const antiga = limparEstrutura({ mensal: [{ id: "despesas", ativa: true }, { id: "resultado", ativa: false }] });
    expect(antiga.mensal!.find((s) => s.id === "resultado")?.ativa).toBe(true);
    expect(antiga.mensal!.some((s) => s.id === "entradas")).toBe(true);
  });
});
