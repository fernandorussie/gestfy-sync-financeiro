/**
 * Paridade com a planilha-mãe da Claros Clinic (outubro/2026).
 * Os valores esperados são os do relatório mensal da planilha e do report
 * enviado ao cliente. Onde o motor diverge de propósito, o teste explica.
 */
import { describe, it, expect } from "vitest";
import { calcularIndicadores, resumoAnual, variacao } from "../indicadores";
import { carregarClaros, OUTUBRO } from "./carregar-fixture";

const { dados, leituras } = carregarClaros();
const ind = calcularIndicadores(dados, OUTUBRO, { meta: 150000 });

describe("leitura da fixture", () => {
  it("encontra todas as colunas obrigatórias", () => {
    for (const l of Object.values(leituras)) expect(l.colunas.faltando).toEqual([]);
  });
  it("lê as 260 vendas, 75 despesas, 16 orçamentos, 100 leads, 50 respostas de NPS e 18 avaliações", () => {
    expect(dados.vendas).toHaveLength(260);
    expect(dados.despesas).toHaveLength(75);
    expect(dados.orcamentos).toHaveLength(16);
    expect(dados.leads).toHaveLength(100);
    expect(dados.nps).toHaveLength(50);
    expect(dados.avaliacoes).toHaveLength(18);
  });
  it("usa a coluna R indicada no mapa para a unidade", () => {
    expect(leituras.vendas.colunas.origem.unidade).toMatchObject({ letra: "R", como: "indicado" });
  });
});

describe("resultado do mês", () => {
  it("faturamento R$ 117.650 (o Quinzenal da planilha mostrava R$ 116.750 por esquecer Endocrinologia)", () => {
    expect(ind.faturamento?.total).toBe(117650);
  });
  it("despesas pagas R$ 110.850,14 e resultado de caixa R$ 6.799,86", () => {
    expect(ind.despesas?.total).toBe(110850.14);
    expect(ind.caixa?.resultado).toBe(6799.86);
  });
  it("136 pacientes, ticket médio R$ 865,07", () => {
    expect(ind.pacientes?.atendidos).toBe(136);
    expect(ind.pacientes?.ticketMedio).toBe(865.07);
  });
  it("33 pacientes novos, ticket dos novos R$ 474,24", () => {
    expect(ind.pacientes?.novos).toBe(33);
    expect(ind.pacientes?.ticketNovos).toBe(474.24);
  });
  it("meta ajustada: 78,4% de R$ 150.000, faltaram R$ 32.350", () => {
    expect(ind.meta?.atingimento).toBeCloseTo(0.7843, 4);
    expect(ind.meta?.falta).toBe(32350);
  });
});

describe("receitas detalhadas", () => {
  const grupo = (n: string) => ind.faturamento?.porGrupo.find((g) => g.nome === n);
  it("bate valor, quantidade e ticket por grupo com a planilha", () => {
    expect(grupo("Plano de Acompanhamento")).toMatchObject({ valor: 28200, quantidade: 42, ticket: 671.43 });
    expect(grupo("Implante")).toMatchObject({ valor: 25800, quantidade: 7, ticket: 3685.71 });
    expect(grupo("Consulta Ginecologia")).toMatchObject({ valor: 15650, quantidade: 70 });
    expect(grupo("Tirzepatida")).toMatchObject({ valor: 12000, quantidade: 37 });
    expect(grupo("Consulta Endocrinologia")).toMatchObject({ valor: 900, quantidade: 4 });
    expect(grupo("T-Sculptor")).toMatchObject({ valor: 0, quantidade: 3 });
  });
  it("soma dos grupos = faturamento total, 260 lançamentos", () => {
    const soma = ind.faturamento!.porGrupo.reduce((s, g) => s + g.valor, 0);
    expect(soma).toBeCloseTo(117650, 2);
    expect(ind.faturamento!.porGrupo.reduce((s, g) => s + g.quantidade, 0)).toBe(260);
  });
  it("111 lançamentos sem valor (104 com R$ 0 e 7 em branco)", () => {
    expect(ind.faturamento?.semValor).toBe(111);
  });
  it("une grafias da unidade: Bangu R$ 92.400, Freguesia R$ 24.150, sem unidade R$ 1.100", () => {
    const u = Object.fromEntries(ind.faturamento!.porUnidade.map((x) => [x.nome, x.valor]));
    expect(u).toEqual({ Bangu: 92400, Freguesia: 24150, "Não informado": 1100 });
  });
  it("meio de pagamento junta parcelamentos: crédito R$ 55.300, PIX R$ 35.000", () => {
    const m = Object.fromEntries(ind.faturamento!.porPagamento.map((x) => [x.nome.toUpperCase(), x.valor]));
    expect(m).toMatchObject({ CREDITO: 55300, PIX: 35000, DINHEIRO: 16450, "DÉBITO": 7500, "NÃO INFORMADO": 3400 });
  });
  it("profissional principal com 90,3% da receita", () => {
    const p = ind.faturamento!.porProfissional[0];
    expect(p.valor).toBe(106200);
    expect(p.pct).toBeCloseTo(0.9027, 4);
  });
  it("unificação decidida na conferência junta dois nomes", () => {
    const r = calcularIndicadores(dados, OUTUBRO, { ajustes: { unificar: { profissional: { "Dra. Bia": "Dra. Bia Clara" } } } });
    expect(r.faturamento!.porProfissional.find((p) => p.nome === "Dra. Bia Clara")?.valor).toBe(10050);
  });
});

describe("despesas detalhadas", () => {
  const g = (n: string) => ind.despesas?.porGrupo.find((x) => x.nome === n);
  it("grupos como na planilha", () => {
    expect(g("Impostos, Taxas e afins")?.valor).toBe(40684.72);
    expect(g("Despesas Administrativas")?.valor).toBe(25760.26);
    expect(g("Despesas Operacionais")?.valor).toBe(7310.32);
    expect(g("Infraestrutura")?.valor).toBe(5482.12);
    expect(g("Serviços Terceirizados")?.valor).toBe(2497);
    expect(g("Pessoal")?.valor).toBe(5814.23);
    expect(g("Marketing")?.valor).toBe(22.5);
    expect(g("Imobilizado")?.valor).toBe(5594.1);
    expect(g("Estoque de Mercadorias")?.valor).toBe(17684.89);
  });
  it("categorias dentro do grupo, na ordem do plano de contas", () => {
    expect(g("Impostos, Taxas e afins")?.categorias.map((c) => [c.nome, c.valor])).toEqual([
      ["PIS", 563.82], ["COFINS", 2602.25], ["IRPJ", 19252], ["IRs Diversos", 5864.66], ["CSLL", 9090.59], ["FGTS", 3311.4],
    ]);
  });
  it("todas as despesas têm grupo (nenhuma em 'Sem grupo')", () => {
    expect(g("Sem grupo")).toBeUndefined();
  });
  it("reclassificar rescisão e férias move R$ 19.155,16 de Administrativas para Pessoal", () => {
    const linhas = dados.despesas!.filter((d) => /RECISÃO|FÉRIAS/.test(d.descricao)).map((d) => d.linha);
    expect(linhas).toHaveLength(2);
    const r = calcularIndicadores(dados, OUTUBRO, { ajustes: { reclassificarDespesa: { [linhas[0]]: "Rescisões", [linhas[1]]: "Férias" } } });
    const rg = (n: string) => r.despesas!.porGrupo.find((x) => x.nome === n)!;
    expect(rg("Despesas Administrativas").valor).toBe(6605.1);
    expect(rg("Pessoal").valor).toBe(24969.39);
    expect(r.despesas!.total).toBe(110850.14);
  });
});

describe("funil comercial", () => {
  it("100 leads, 25 agendados, 25% de conversão", () => {
    expect(ind.leads).toMatchObject({ total: 100, agendados: 25, conversao: 0.25 });
  });
  it("origem: 52 de redes sociais da clínica, 33 sem origem", () => {
    const o = Object.fromEntries(ind.leads!.porOrigem.map((x) => [x.nome, x.quantidade]));
    expect(o["Redes Sociais Clínica"]).toBe(52);
    expect(o["Não informado"]).toBe(33);
  });
  it("interesse une Gineco, GINECO e gineco (43)", () => {
    const gineco = ind.leads!.porInteresse.find((x) => x.nome.toLowerCase() === "gineco");
    expect(gineco?.quantidade).toBe(43);
  });
  it("orçamentos: 16 gerados, 13 fechados, 3 em aberto, R$ 66.400 / R$ 40.500 / R$ 18.400", () => {
    expect(ind.orcamentos).toMatchObject({ total: 16, fechados: 13, emAberto: 3, naoFechou: 0, valorGerado: 66400, valorFechado: 40500, valorEmAberto: 18400 });
    expect(ind.orcamentos!.conversaoQuantidade).toBeCloseTo(0.8125, 4);
    expect(ind.orcamentos!.conversaoValor).toBeCloseTo(0.6099, 4);
  });
});

describe("experiência do paciente", () => {
  it("NPS 96 com 50 respostas (48 promotores, 2 neutros, 0 detratores)", () => {
    expect(ind.nps).toMatchObject({ respostas: 50, nps: 96, promotores: 48, neutros: 2, detratores: 0 });
  });
  it("notas por área", () => {
    expect(ind.nps!.notas).toEqual({ profissional: 4.94, recepcao: 5, infraestrutura: 4.98, enfermagem: 4.78 });
  });
  it("18 avaliações no Google, nota 5,0", () => {
    expect(ind.google).toEqual({ avaliacoes: 18, nota: 5 });
  });
});

describe("quinzena e resumo anual", () => {
  it("1ª quinzena de outubro: R$ 57.350 e 75 pacientes", () => {
    const q = calcularIndicadores(dados, { inicio: "2026-10-01", fim: "2026-10-15" });
    expect(q.faturamento?.total).toBe(57350);
    expect(q.pacientes?.atendidos).toBe(75);
  });
  it("outubro no resumo anual: caixa e competência", () => {
    const out = resumoAnual(dados, 2026, 10)[9];
    expect(out.entradas).toBe(117650);
    expect(out.saidasCaixa).toBe(110850.14);
    // Na competência, o que foi pago em outubro com competência de setembro sai de outubro.
    expect(out.saidasCompetencia).toBeLessThan(out.saidasCaixa);
  });
  it("variação", () => {
    expect(variacao(117650, 155550)).toBeCloseTo(-0.2437, 4);
    expect(variacao(10, 0)).toBeNull();
  });
});

describe("fonte não configurada", () => {
  it("devolve null em vez de zero", () => {
    const r = calcularIndicadores({ ...dados, leads: null, nps: null }, OUTUBRO);
    expect(r.leads).toBeNull();
    expect(r.nps).toBeNull();
    expect(r.faturamento).not.toBeNull();
  });
});
