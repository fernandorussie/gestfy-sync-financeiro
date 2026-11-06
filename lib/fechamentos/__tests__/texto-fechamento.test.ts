import { describe, it, expect } from "vitest";
import { conferir } from "../conferencia";
import { decidir, decisoesVazias } from "../decisoes";
import { calcularIndicadores, type DadosFechamento } from "../indicadores";
import { rascunho, textoVazio, textoWhatsApp, type Acao } from "../texto-fechamento";
import { carregarClaros, OUTUBRO } from "./carregar-fixture";

const { dados, leituras } = carregarClaros();

// Setembro sintético: as mesmas vendas um mês antes, com valores 30% maiores (ticket maior, mesmo volume).
const setembro: DadosFechamento = {
  ...dados,
  vendas: dados.vendas!.map((v) => ({ ...v, data: v.data.replace("2026-10", "2026-09"), valor: v.valor === null ? null : v.valor * 1.3 })),
  despesas: dados.despesas!.map((d) => ({ ...d, dataPagamento: d.dataPagamento?.replace("2026-10", "2026-09") ?? null, valor: d.valor * 0.66 })),
};
const juntos: DadosFechamento = { ...dados, vendas: [...dados.vendas!, ...setembro.vendas!], despesas: [...dados.despesas!, ...setembro.despesas!] };
const indicadores = calcularIndicadores(juntos, OUTUBRO, { meta: 150000 });
const anterior = calcularIndicadores(juntos, { inicio: "2026-09-01", fim: "2026-09-30" });
const alertas = conferir({ dados, periodo: OUTUBRO, leituras });
const pontuais = alertas.find((a) => a.regra === "pagamentos-pontuais")!;
const decisoes = decidir(decisoesVazias(), pontuais, "aplicar");

describe("rascunho do texto", () => {
  const r = rascunho({ clinica: "Claros Clinic", tipo: "mensal", indicadores, anterior, alertas, decisoes });

  it("observação no formato dos reports: queda, meta e volume × ticket", () => {
    expect(r.observacao).toContain("Fala, Drs.! Segue o fechamento mensal de outubro da Claros Clinic.");
    expect(r.observacao).toContain("O faturamento caiu de R$ 152.945,00 em setembro para R$ 117.650,00 em outubro, uma redução de 23,1%.");
    expect(r.observacao).toContain("Atingimos 78,4% da meta de R$ 150.000,00, ficando R$ 32.350,00 abaixo do objetivo.");
    expect(r.observacao).toContain("Tivemos um período de atenção.");
    expect(r.observacao).toContain("O principal ponto é que o volume de pacientes se manteve em 136.");
    expect(r.observacao).toContain("ticket médio caiu 23,1%");
  });

  it("cita pagamentos pontuais só quando o consultor escolheu citar", () => {
    expect(r.observacao).toContain("outubro concentrou pagamentos de IRPJ, CSLL e despesas relacionadas a desligamento de colaborador, que somaram aproximadamente R$ 47,7 mil.");
    expect(r.observacao).toContain("contra R$ 73.161,09 em setembro");
    const sem = rascunho({ clinica: "Claros Clinic", tipo: "mensal", indicadores, anterior, alertas, decisoes: decisoesVazias() });
    expect(sem.observacao).not.toContain("concentrou pagamentos");
  });

  it("destaques, comercial e pontos de atenção com números do motor", () => {
    expect(r.destaques).toContain("- Plano de Acompanhamento: foi a principal categoria de outubro, com R$ 28.200,00, queda de 23,1% em relação a setembro.");
    expect(r.destaques).toMatch(/Somando .+ e .+, tivemos R\$ [\d.,]+ a menos em faturamento\./);
    expect(r.comercial).toContain("- Leads e agendamentos: tivemos 100 leads e 25 agendamentos, com conversão de 25%.");
    expect(r.comercial).toContain("R$ 66.400,00 prescritos e R$ 40.500,00 em vendas registradas, com conversão de 61% em valor");
    expect(r.comercial).toContain("52 foram registrados como vindos de Redes Sociais Clínica, além de 5 identificados como Google/Site");
    expect(r.comercial).toContain("NPS de 96 em 50 respostas e 18 avaliações no Google, todas com 5 estrelas");
    expect(r.atencao).toContain("- Faturamento e ticket: a queda de 23,1% no ticket médio impactou diretamente a receita, mesmo com praticamente o mesmo volume de pacientes atendidos.");
    expect(r.atencao).toContain("- Concentração de receita: Dr. Alfa ainda representa 90,3% do faturamento total.");
  });
});

describe("texto do WhatsApp", () => {
  const acoes: Acao[] = [{ id: "1", titulo: "Follow-up dos orçamentos em aberto", descricao: "Ligar para os 3 orçamentos em negociação.", responsaveis: ["Recepção", "Gestfy"], prazo: "2026-11-20", indicador: "" }];
  const t = textoWhatsApp({ clinica: "Claros Clinic", tipo: "mensal", periodoNome: "outubro/2026", indicadores, anterior, texto: { ...textoVazio(), observacao: "Texto da observação." }, acoes });

  it("cabeçalho com faturamento, ticket, meta, saídas e saldo", () => {
    expect(t.startsWith("Relatório Mensal de Resultados - Outubro/2026 (Claros Clinic)")).toBe(true);
    expect(t).toContain("Total da clínica: R$ 117.650,00 (−23,1% vs. setembro/R$ 152.945,00)");
    expect(t).toContain("🎯 Meta: R$ 150.000,00 | Atingimento: 78,4%");
    expect(t).toContain("💳 Saídas no período: R$ 110.850,14");
    expect(t).toContain("💵 Saldo de caixa no período: R$ 6.799,86");
  });

  it("seções vazias não aparecem; plano de ação com responsáveis e prazo", () => {
    expect(t).toContain("Observação:\n\nTexto da observação.");
    expect(t).not.toContain("Principais destaques");
    expect(t).toContain("🎯 Plano de Ação para Novembro");
    expect(t).toContain("1. Follow-up dos orçamentos em aberto\n- Responsável: Recepção + Gestfy · até 20/11\n> Ação: Ligar para os 3 orçamentos em negociação.");
  });
});
