/**
 * Conferência sobre os dados reais (anonimizados) da Claros em outubro/2026.
 * Cada teste corresponde a um problema encontrado na engenharia reversa da
 * planilha-mãe ou nos reports enviados ao cliente.
 */
import { describe, it, expect } from "vitest";
import { conferir, podeSeguirParaAnalise, type Alerta } from "../conferencia";
import { lerVendas } from "../leitores";
import { carregarClaros, OUTUBRO } from "./carregar-fixture";

const { dados, leituras } = carregarClaros();
const base = { dados, periodo: OUTUBRO, leituras, metas: [{ origem: "Meta mensal (GestfySync)", valor: 188000 }, { origem: "Meta ajustada (GestfySync)", valor: 150000 }] };
const alertas = conferir(base);
const por = (regra: string, lista: Alerta[] = alertas) => lista.filter((a) => a.regra === regra);

describe("conferência da Claros, outubro/2026", () => {
  it("rescisão e férias em Despesas Administrativas: alerta grave com sugestão de Pessoal", () => {
    const pessoal = por("despesa-grupo-errado").filter((a) => a.sugestao?.tipo === "reclassificar" && a.sugestao.grupo === "Pessoal");
    expect(pessoal.map((a) => a.gravidade)).toEqual(["grave", "grave"]);
    const total = pessoal.reduce((s, a) => s + (a.total ?? 0), 0);
    expect(total).toBeCloseTo(16424.16 + 2731, 2);
  });

  it("tráfego pago e editor de vídeo fora de Marketing: atenção", () => {
    const mkt = por("despesa-grupo-errado").filter((a) => a.sugestao?.tipo === "reclassificar" && a.sugestao.grupo === "Marketing");
    expect(mkt.map((a) => a.gravidade)).toEqual(["atencao", "atencao"]);
    expect(mkt.map((a) => a.total).sort()).toEqual([1500, 280]);
  });

  it("salários já em Pessoal e FGTS em Impostos não geram alerta", () => {
    const linhas = por("despesa-grupo-errado").flatMap((a) => a.evidencias.map((e) => e.texto));
    expect(linhas.some((t) => /SALÁRIO|FGTS/.test(t))).toBe(false);
  });

  it("pagamentos pontuais: IRPJ, CSLL, rescisão e FGTS da rescisão = R$ 47.738,07", () => {
    const [p] = por("pagamentos-pontuais");
    expect(p.total).toBe(47738.07);
    expect(p.evidencias).toHaveLength(4);
    expect(p.gravidade).toBe("atencao");
  });

  it("duas metas diferentes: grave, com as opções para escolher", () => {
    const [m] = por("metas-diferentes");
    expect(m.gravidade).toBe("grave");
    expect(m.sugestao).toMatchObject({ tipo: "escolher-meta" });
  });

  it("“Dra. Bia” e “Dra. Bia Clara” podem ser a mesma pessoa (R$ 10.050 juntas)", () => {
    const [n] = por("nomes-parecidos");
    expect(n.sugestao).toEqual({ tipo: "unificar", campo: "profissional", de: ["Dra. Bia"], para: "Dra. Bia Clara" });
    expect(n.descricao).toContain("10.050,00");
  });

  it("grafias unidas: Bangu/BANGU/BANgu, PIX/pix e Gineco/GINECO/gineco", () => {
    const [g] = por("grafias-unidas");
    const textos = g.evidencias.map((e) => e.texto).join("\n");
    expect(textos).toMatch(/Unidade:.*BANGU.*→ “Bangu”/);
    expect(textos).toMatch(/Meio de pagamento:.*pix/i);
    expect(textos).toMatch(/Interesse:.*GINECO/);
  });

  it("vendas sem unidade (2, R$ 1.100) e sem meio de pagamento (4, R$ 3.400)", () => {
    const [v] = por("vendas-incompletas");
    expect(v.titulo).toContain("2 vendas sem unidade (R$ 1.100,00)");
    expect(v.titulo).toContain("4 vendas sem meio de pagamento (R$ 3.400,00)");
  });

  it("informativos: 111 sem valor, T-Sculptor sem valor, pré-consulta não entra (fonte não configurada aqui)", () => {
    expect(por("vendas-sem-valor")[0].titulo).toBe("111 de 260 lançamentos sem valor");
    expect(por("grupo-sem-valor").map((a) => a.titulo)).toEqual(["T-Sculptor: 3 atendimentos sem valor"]);
  });

  it("33 de 100 leads sem origem", () => {
    expect(por("leads-sem-origem")[0].titulo).toBe("33 de 100 leads sem origem informada");
  });

  it("nenhuma categoria de despesa fora do plano e nenhuma linha ilegível", () => {
    expect(por("despesa-sem-grupo")).toEqual([]);
    expect(por("linhas-ilegiveis")).toEqual([]);
  });

  it("graves vêm primeiro e bloqueiam a análise até serem decididos", () => {
    expect(alertas[0].gravidade).toBe("grave");
    expect(podeSeguirParaAnalise(alertas)).toBe(false);
    const graves = new Set(alertas.filter((a) => a.gravidade === "grave").map((a) => a.chave));
    expect(podeSeguirParaAnalise(alertas, graves)).toBe(true);
  });
});

describe("decisões resolvem os alertas", () => {
  it("reclassificar e unificar fazem os alertas sumirem; metas iguais também", () => {
    const pessoal = por("despesa-grupo-errado").filter((a) => a.sugestao?.tipo === "reclassificar" && a.sugestao.grupo === "Pessoal");
    const reclassificarDespesa: Record<number, string> = {};
    for (const a of pessoal) if (a.sugestao?.tipo === "reclassificar") for (const l of a.sugestao.linhas) reclassificarDespesa[l] = a.sugestao.categoria;
    const depois = conferir({ ...base, metas: [{ origem: "Meta ajustada", valor: 150000 }], ajustes: { reclassificarDespesa, unificar: { profissional: { "Dra. Bia": "Dra. Bia Clara" } } } });
    expect(por("despesa-grupo-errado", depois).filter((a) => a.gravidade === "grave")).toEqual([]);
    expect(por("nomes-parecidos", depois)).toEqual([]);
    expect(por("metas-diferentes", depois)).toEqual([]);
    expect(podeSeguirParaAnalise(depois)).toBe(true);
  });
});

describe("outras clínicas", () => {
  it("planilha com linha de título, colunas em outra ordem e valores em texto", () => {
    const linhas = [
      ["Controle de Vendas - Clínica X"],
      ["Valor", "Paciente", "Data", "Categoria", "Primeira vez"],
      ["R$ 1.234,56", "Ana", "02/10/2026", "Consulta", "Sim"],
      ["350", "Beto", "2026-10-03", "Consulta", "não"],
      ["abc", "Caio", "03/10/2026", "Exame", ""],
    ];
    const l = lerVendas(linhas);
    expect(l.linhaCabecalho).toBe(2);
    expect(l.colunas.faltando).toEqual([]);
    expect(l.registros.map((r) => r.valor)).toEqual([1234.56, 350, null]);
    expect(l.avisos).toEqual([{ linha: 5, campo: "Valor pago", valor: "abc", motivo: "valor não reconhecido" }]);
    const al = conferir({ dados: { vendas: l.registros, despesas: null, orcamentos: null, leads: null, nps: null, avaliacoes: null }, periodo: OUTUBRO, leituras: { vendas: l } });
    expect(por("linhas-ilegiveis", al)).toHaveLength(1);
  });

  it("planilha sem pacientes novos marcados avisa (caso Pappalardo)", () => {
    const l = lerVendas([["Data", "Paciente", "Valor"], ["02/10/2026", "Ana", 500]]);
    const al = conferir({ dados: { vendas: l.registros, despesas: null, orcamentos: null, leads: null, nps: null, avaliacoes: null }, periodo: OUTUBRO });
    expect(por("novos-sem-informacao", al)).toHaveLength(1);
  });

  it("despesa de categoria desconhecida fica em “Sem grupo” e gera alerta grave", () => {
    const d = [{ linha: 2, dataPagamento: "2026-10-05", dataVencimento: null, descricao: "PLANO ODONTO", categoria: "Convênio odontológico", valor: 300, pago: true, periodicidade: "", competencia: null, centroCusto: "" }];
    const al = conferir({ dados: { vendas: null, despesas: d, orcamentos: null, leads: null, nps: null, avaliacoes: null }, periodo: OUTUBRO });
    const [s] = por("despesa-sem-grupo", al);
    expect(s.gravidade).toBe("grave");
    expect(s.sugestao).toEqual({ tipo: "classificar", categorias: ["Convênio odontológico"] });
  });
});
