import { describe, it, expect } from "vitest";
import { lerDespesas, lerEntradas } from "../leitores";
import { calcularIndicadores, regimesAnuais, resumoAnual, rotuloResultado, type DadosFechamento } from "../indicadores";
import { grupoDaEntrada, sugerirGrupoEntrada } from "../entradas";
import { conferir } from "../conferencia";
import { metricasDoFechamento } from "../metricas";
import { lerSituacao } from "../texto";

const vazio: DadosFechamento = { vendas: null, despesas: null, orcamentos: null, leads: null, nps: null, avaliacoes: null };
const out = { inicio: "2026-10-01", fim: "2026-10-31" };

// Estrutura exportada de sistema financeiro (como a do Núcleo VIV): situação, valor recebido, categoria.
const sistema = [
  ["Data de competência", "Data do último pagamento", "Situação", "Valor original da parcela (R$)", "Valor total recebido da parcela (R$)", "Categoria 1", "Descrição"],
  ["01/10/2026", "05/10/2026", "Quitado", "1.000,00", "1.000,00", "Receitas de Serviços", "Consulta"],
  ["01/10/2026", "06/10/2026", "Quitado", "200,00", "200,00", "Rendimentos de Aplicações", "CDB"],
  ["01/10/2026", "07/10/2026", "Quitado", "5.000,00", "5.000,00", "Transferência entre contas", "Itaú > BB"],
  ["01/10/2026", "08/10/2026", "Em aberto", "700,00", "700,00", "Receitas de Serviços", "Pacote"],
  ["01/10/2026", "09/10/2026", "Quitado", "300,00", "300,00", "Receitas de Serviços", "Consulta"],
  ["01/10/2026", "09/10/2026", "Quitado", "300,00", "300,00", "Receitas de Serviços", "Consulta"],
];
// Planilha manual (como a do Gustavo Gurgel).
const manual = [
  ["Data Receb.", "Categoria", "Vl. Receb. R$", "Status Recebido", "Forma Receb."],
  ["10/10/2026", "CIRURGIA HOSPITALAR", "R$ 8.000,00", "Sim", "PIX"],
  ["11/10/2026", "APORTE CAPITAL", "R$ 20.000,00", "Sim", "TED"],
  ["", "SALDO INICIAL", "", "", ""],
];

describe("Entradas: leitura", () => {
  it("lê exportação de sistema financeiro e planilha manual", () => {
    const a = lerEntradas(sistema);
    expect(a.colunas.faltando).toEqual([]);
    expect(a.registros).toHaveLength(6);
    expect(a.registros[0]).toMatchObject({ data: "2026-10-05", valor: 1000, recebido: true, categoria: "Receitas de Serviços" });
    expect(a.registros[3].recebido).toBe(false);
    const b = lerEntradas(manual);
    expect(b.registros).toHaveLength(2); // linha de saldo em branco é ignorada sem erro
    expect(b.registros[0]).toMatchObject({ data: "2026-10-10", valor: 8000, recebido: true, forma: "PIX" });
    expect(b.avisos).toHaveLength(0);
  });
  it("situação: pago/quitado/sim = sim; em aberto/não = não", () => {
    expect(lerSituacao("Quitado")).toBe(true);
    expect(lerSituacao("Não")).toBe(false);
    expect(lerSituacao("Em aberto")).toBe(false);
    expect(lerSituacao("")).toBe(null);
  });
  it("sugestão de grupo pelo nome; escolha do consultor vence", () => {
    expect(sugerirGrupoEntrada("Transferência entre contas")).toBe("fora");
    expect(sugerirGrupoEntrada("Empréstimos")).toBe("fora");
    expect(sugerirGrupoEntrada("APORTE CAPITAL")).toBe("fora");
    expect(sugerirGrupoEntrada("Rendimentos de Aplicações")).toBe("nao_operacional");
    expect(sugerirGrupoEntrada("Reembolso")).toBe("nao_operacional");
    expect(sugerirGrupoEntrada("Receitas de Serviços")).toBe("operacional");
    expect(sugerirGrupoEntrada("ENTRADAS CARTÃO")).toBe("operacional");
    expect(sugerirGrupoEntrada("REPASSE PARCEIROS")).toBe(null);
    expect(grupoDaEntrada("Repasse parceiros", { "repasse parceiros": "fora" })).toEqual({ grupo: "fora", confirmado: true, sugerido: "fora" });
  });
});

describe("Despesas: só as pagas", () => {
  const planilha = [
    ["Data Pgto", "Categoria", "Valor R$", "Pago?", "Mês_Comp"],
    ["05/10/2026", "Aluguel", "3.000,00", "Sim", "09/2026"],
    ["06/10/2026", "Energia", "500,00", "Não", "10/2026"],
    ["07/10/2026", "Material", "1.000,00", "", "10/2026"],
  ];
  it("'Pago? Não' com data fica fora do total e vira alerta", () => {
    const d = lerDespesas(planilha).registros;
    const i = calcularIndicadores({ ...vazio, despesas: d }, out);
    expect(i.despesas?.total).toBe(4000);
    expect(i.despesas?.naoPagas).toEqual({ quantidade: 1, valor: 500 });
    const al = conferir({ dados: { ...vazio, despesas: d }, periodo: out });
    expect(al.find((a) => a.regra === "despesa-nao-paga")?.total).toBe(500);
  });
  it("competência também só com pagas", () => {
    const d = lerDespesas(planilha).registros;
    const anual = resumoAnual({ vendas: [], despesas: d }, 2026, 10);
    expect(anual.find((l) => l.mes === "2026-09")?.saidasCompetencia).toBe(3000);
    expect(anual.find((l) => l.mes === "2026-10")?.saidasCompetencia).toBe(1000);
    expect(anual.find((l) => l.mes === "2026-10")?.saidasCaixa).toBe(4000);
    expect(anual.every((l) => l.recebido === null)).toBe(true);
  });
});

describe("Resultado de caixa x Faturamento x Despesas", () => {
  const despesas = lerDespesas([["Data Pgto", "Categoria", "Valor"], ["05/10/2026", "Aluguel", "1.000,00"]]).registros;
  const entradas = lerEntradas(sistema).registros;

  it("sem Entradas: Faturamento x Despesas, nunca 'de caixa'", () => {
    const vendas = [{ linha: 2, data: "2026-10-03", paciente: "x", primeiraVez: null, valor: 9000, categoria: "Consulta", grupo: "", profissional: "", pagamento: "", unidade: "", descricao: "" }] as DadosFechamento["vendas"];
    const i = calcularIndicadores({ ...vazio, vendas, despesas }, out);
    expect(i.caixa).toMatchObject({ entradas: 9000, resultado: 8000, real: false });
    expect(rotuloResultado(i.caixa)).toBe("Faturamento x Despesas");
    expect(metricasDoFechamento(i).find((m) => m.indicador === "resultadoCaixa")).toBeUndefined();
  });

  it("com Entradas: operacional + não operacional − saídas; transferência fica fora; em aberto não entra", () => {
    const i = calcularIndicadores({ ...vazio, despesas, entradas }, out);
    expect(i.entradas).toMatchObject({ total: 1800, operacionais: 1600, naoOperacionais: 200, foraDoResultado: 5000, emAberto: { quantidade: 1, valor: 700 } });
    expect(i.caixa).toMatchObject({ entradas: 1800, saidas: 1000, resultado: 800, real: true });
    expect(rotuloResultado(i.caixa)).toBe("Resultado de caixa");
    const m = metricasDoFechamento(i);
    expect(m.find((x) => x.indicador === "resultadoCaixa")?.valor).toBe(800);
    expect(m.find((x) => x.indicador === "entradas")?.valor).toBe(1800);
  });

  it("conferência: categorias para classificar (com sugestão) e possível duplicidade", () => {
    const al = conferir({ dados: { ...vazio, despesas, entradas }, periodo: out });
    const cls = al.find((a) => a.regra === "entrada-sem-grupo")!;
    expect(cls.gravidade).toBe("grave");
    expect(cls.sugestao).toMatchObject({ tipo: "classificar-entradas", sugeridas: { "Receitas de Serviços": "operacional", "Transferência entre contas": "fora" } });
    expect(al.find((a) => a.regra === "entrada-duplicada")?.evidencias).toHaveLength(2);
    // Depois de classificar, o alerta some.
    const regras = { categoriasEntrada: { "receitas de servicos": "operacional", "rendimentos de aplicacoes": "nao_operacional", "transferencia entre contas": "fora" } as const };
    expect(conferir({ dados: { ...vazio, despesas, entradas }, periodo: out, regras }).find((a) => a.regra === "entrada-sem-grupo")).toBeUndefined();
  });

  it("tabela anual: recebido sem 'fora'; competência usa faturamento", () => {
    const vendas = [{ linha: 2, data: "2026-10-03", paciente: "x", primeiraVez: null, valor: 9000, categoria: "Consulta", grupo: "", profissional: "", pagamento: "", unidade: "", descricao: "" }] as DadosFechamento["vendas"];
    const anual = resumoAnual({ vendas, despesas, entradas }, 2026, 10);
    const reg = regimesAnuais(anual);
    expect(reg.real).toBe(true);
    const out10 = reg.linhas.find((l) => l.mes === "2026-10")!;
    expect(out10).toMatchObject({ faturamento: 9000, entradas: 1800, saidasCaixa: 1000, resultadoCaixa: 800, resultadoCompetencia: 8000 });
    // Fechamento antigo (sem "recebido"): resultado é faturamento − saídas.
    expect(regimesAnuais([{ mes: "2026-10", entradas: 9000, saidasCaixa: 1000, saidasCompetencia: 1000 }])).toMatchObject({ real: false, linhas: [{ resultadoCaixa: 8000, entradas: null }] });
  });
});
