import { describe, it, expect } from "vitest";
import type { DadosFechamento } from "../indicadores";
import { lerDespesas } from "../leitores";
import { calcularRitmo, notaProvisao } from "../ritmo";

// Cabeçalho no formato da exportação do Conta Azul (aba SAIDAS), linhas fictícias.
const CAB = ["Data de competência", "Data de vencimento", "Descrição", "Situação", "Valor original da parcela (R$)", "Valor pago da parcela (R$)",
  "Valor total pago da parcela (R$)", "Valor da parcela em aberto (R$)", "Valor total da parcela em aberto (R$)", "Data do último pagamento", "Categoria 1", "Categoria Gestfy"];
const L = (venc: string, desc: string, sit: string, original: number, pago: number, aberto: number, dataPg: string, cat = "Aluguel") =>
  [venc, venc, desc, sit, original, pago, pago, aberto, aberto, dataPg, cat + " CA", cat];
const planilha = [
  CAB,
  // meses anteriores (histórico da média): 10.000 por mês
  L("05/08/2026", "Aluguel", "Quitado", 10000, 10000, 0, "05/08/2026"),
  L("05/09/2026", "Aluguel", "Quitado", 10000, 10000, 0, "05/09/2026"),
  L("05/10/2026", "Aluguel", "Quitado", 10000, 10000, 0, "05/10/2026"),
  L("20/10/2026", "Energia outubro", "Atrasado", 700, 0, 700, ""), // vencida em mês anterior: fora
  // novembro
  L("05/11/2026", "Aluguel", "Quitado", 10000, 10000, 0, "05/11/2026"), // pago na quinzena
  L("10/11/2026", "Fornecedor A", "Atrasado", 1200, 0, 1200, ""), // vencida no mês, não paga: entra
  L("12/11/2026", "Fornecedor B", "Quitado", 800, 800, 0, "18/11/2026"), // paga depois do dia 15: entra (800)
  L("20/11/2026", "Sistema", "Em aberto", 300, 0, 300, ""), // a vencer: entra
  L("25/11/2026", "Parcelamento", "Parcial", 1000, 400, 600, "14/11/2026"), // parcial: entra 600; 400 já pago
  L("28/11/2026", "Assinatura", "Cancelado", 500, 0, 500, ""), // cancelada: fora
  L("05/12/2026", "Aluguel dezembro", "Em aberto", 10000, 0, 10000, ""), // mês seguinte: fora
];
const leitura = lerDespesas(planilha);
const dados: DadosFechamento = { vendas: [], despesas: leitura.registros, entradas: null, orcamentos: null, leads: null, nps: null, avaliacoes: null, preConsulta: null };
const periodo = { inicio: "2026-11-01", fim: "2026-11-15" };
const colunas = { vencimento: true, situacao: true, valorAberto: true };

describe("leitura da exportação do Conta Azul", () => {
  it("usa Categoria Gestfy, vencimento, situação e valor em aberto", () => {
    const ix = leitura.colunas.indices;
    expect(ix.categoria).toBe(11);
    expect(ix.dataVencimento).toBe(1);
    expect(ix.pago).toBe(3);
    expect(ix.valorAberto).toBe(8);
    expect(ix.valor).toBe(6);
    const cancel = leitura.registros.find((d) => d.descricao === "Assinatura")!;
    expect(cancel.cancelada).toBe(true);
    expect(cancel.categoria).toBe("Aluguel");
  });
});

describe("provisionamento", () => {
  it("média histórica continua igual (padrão)", () => {
    const r = calcularRitmo({ dados, periodo, feriados: [], meta: null });
    expect(r.metodoProvisao).toBe("media");
    expect(r.mediaDespesas).toBe(10000);
    expect(r.despesasPagas).toBe(10400); // aluguel 10.000 + 400 da parcial
    expect(r.provisionado).toBe(0);
    expect(notaProvisao(r)).toContain("média");
  });

  it("contas em aberto: só vencimentos do mês ainda a pagar no dia 15", () => {
    const r = calcularRitmo({ dados, periodo, feriados: [], meta: null, provisao: { metodo: "contas", colunas } });
    // 1.200 (atrasada no mês) + 800 (paga em 18/11) + 300 (a vencer) + 600 (saldo da parcial)
    expect(r.provisionado).toBe(2900);
    expect(r.contasAbertas).toMatchObject({ lancamentos: 4, parciais: 1, pagasDepois: 1, ate: "2026-11-30" });
    expect(r.saldoProjetado).toBe(r.projecaoMes - (10400 + 2900));
    expect(notaProvisao(r)).toBe("contas em aberto até 30/11 (4 lançamentos)");
  });

  it("sem as colunas necessárias fica pendente e não usa a média no lugar", () => {
    const r = calcularRitmo({ dados, periodo, feriados: [], meta: null, provisao: { metodo: "contas", colunas: { vencimento: false, situacao: true, valorAberto: false } } });
    expect(r.provisionado).toBeNull();
    expect(r.saldoProjetado).toBeNull();
    expect(r.provisaoPendencia).toMatch(/Data de vencimento/);
  });

  it("planilha manual (Pago? Não, sem valor em aberto): usa o valor das não pagas", () => {
    const manual = lerDespesas([
      ["Data Pgto.", "Data de vencimento", "Descrição", "Categoria", "Valor R$", "Pago?"],
      ["10/11/2026", "10/11/2026", "Luz", "Energia", "350", "Não"],
      ["03/11/2026", "03/11/2026", "Aluguel", "Aluguel", "5000", "Sim"],
    ]);
    const d: DadosFechamento = { ...dados, despesas: manual.registros };
    const r = calcularRitmo({ dados: d, periodo, feriados: [], meta: null, provisao: { metodo: "contas", colunas: { vencimento: true, situacao: true, valorAberto: false } } });
    expect(r.provisionado).toBe(350);
  });
});
