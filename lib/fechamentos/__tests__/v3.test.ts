import { describe, it, expect } from "vitest";
import { NEUTRO, segmentoDoTexto, vocabularioDe } from "../vocabulario";
import { estatisticas, seriesComparativas, situacaoCliente, agruparPeriodos, type LinhaFechamento } from "../historico";
import { metricasDoFechamento } from "../metricas";
import { extrasDe, limparEstrutura, normalizarEstrutura } from "../estrutura";
import { faltaColunaOuTabela } from "../banco";
import type { Indicadores } from "../indicadores";

describe("vocabulário", () => {
  it("neutro sem segmento; preset por segmento; ajuste do consultor vence", () => {
    expect(vocabularioDe(null)).toEqual(NEUTRO);
    expect(vocabularioDe({ segmentoTipo: "clinica" }).clientes).toBe("pacientes");
    expect(vocabularioDe({ segmentoTipo: "varejo" }).profissionais).toBe("lojas");
    expect(vocabularioDe({ segmentoTipo: "clinica", vocabulario: { clientes: "Clientes" } }).clientes).toBe("clientes");
    expect(vocabularioDe({ segmento: "Clínica de dermatologia" }).cliente).toBe("paciente");
    expect(segmentoDoTexto("Shopping regional")).toBe("varejo");
  });
});

describe("situação do cliente no painel", () => {
  it("pronto, pendente e não configurado", () => {
    expect(situacaoCliente({ vendas: { sheetId: "a" }, despesas: { sheetId: "b" } }).situacao).toBe("pronto");
    expect(situacaoCliente({ vendas: { sheetId: "a" } })).toEqual({ situacao: "pendente", faltando: ["despesas"] });
    expect(situacaoCliente({}).situacao).toBe("nao_configurado");
    expect(situacaoCliente(null).situacao).toBe("nao_configurado");
  });
});

describe("comparativos e métricas", () => {
  const ind = (fat: number) => ({ faturamento: { total: fat }, caixa: { resultado: fat / 10, margem: 0.1 }, despesas: { total: fat * 0.9 } }) as unknown as Indicadores;
  const linha = (mes: string, fat: number, status: LinhaFechamento["status"], versao = 1): LinhaFechamento => ({
    id: `${mes}-${versao}`, tipo: "mensal", inicio: `${mes}-01`, fim: `${mes}-28`, status, versao, indicadores: ind(fat), concluido_em: null, enviado_em: null,
    snapshot: status === "concluido" ? { indicadores: ind(fat), personalizadas: [{ id: "f", nome: "Recall", indicadores: [{ id: "t", nome: "Taxa", formato: "percentual", melhor: "maior", secao: "fonte", atual: 50, anterior: 40, descricao: "" }], linhasLidas: 1, ignoradas: 0, erro: null }] } : null,
  });

  it("série por indicador com a versão mais nova de cada mês; personalizadas só de concluídos", () => {
    const p = agruparPeriodos([linha("2026-08", 100, "concluido"), linha("2026-09", 120, "concluido", 1), linha("2026-09", 130, "concluido", 2), linha("2026-10", 90, "analise")]);
    const s = seriesComparativas(p, 12);
    expect(s.find((x) => x.id === "faturamento")!.pontos.map((x) => x.valor)).toEqual([100, 130, 90]);
    expect(s.find((x) => x.id === "margem")!.pontos[0].valor).toBe(10);
    const taxa = s.find((x) => x.id === "pers:f:t")!;
    expect(taxa.pontos.map((x) => x.mes)).toEqual(["2026-08", "2026-09"]);
    const st = estatisticas(s[0].pontos)!;
    expect([st.maior.mes, st.menor.mes, Math.round(st.media)]).toEqual(["2026-09", "2026-10", 107]);
  });

  it("métricas padronizadas ignoram vazios e agrupados", () => {
    const m = metricasDoFechamento(ind(100), [{ id: "f", nome: "X", comparavel: "recall", linhasLidas: 0, ignoradas: 0, erro: null, indicadores: [
      { id: "a", nome: "Contatos", formato: "numero", melhor: "maior", secao: "fonte", atual: 5, anterior: null, descricao: "" },
      { id: "g", nome: "Por canal", formato: "numero", melhor: "maior", secao: "fonte", atual: 5, anterior: null, descricao: "", grupos: [] },
    ] }]);
    expect(m.map((x) => x.indicador)).toEqual(["faturamento", "despesas", "resultado", "margem", "pers:f:a"]);
    expect(m.at(-1)!.comparavel).toBe("recall:contatos");
  });
});

describe("estrutura com seções personalizadas", () => {
  it("seções salvas entram na lista; fonte sem indicador na própria seção não ganha seção", () => {
    const fontes = [{ id: "r", nome: "Recall", indicadores: [{ secao: "funilLeads" }] }, { id: "c", nome: "Contratos", indicadores: [{ secao: "fonte" }] }];
    const ex = extrasDe(fontes);
    expect(ex.map((x) => x.id)).toEqual(["c"]);
    const e = limparEstrutura({ secoes: [{ id: "rel", titulo: "Relacionamento" }, { id: "x", titulo: "  " }] }, ex);
    expect(e.secoes).toEqual([{ id: "rel", titulo: "Relacionamento" }]);
    expect(e.mensal!.map((s) => s.id)).toContain("sec:rel");
    expect(e.mensal!.map((s) => s.id)).toContain("fonte:c");
    expect(normalizarEstrutura(e.mensal, "mensal", ex).map((s) => s.id)).not.toContain("sec:rel");
  });
});

describe("verificador do banco", () => {
  it("reconhece coluna ou tabela inexistente", () => {
    expect(faltaColunaOuTabela({ message: "column fechamentos.snapshot does not exist", code: "42703" })).toBe(true);
    expect(faltaColunaOuTabela({ message: "Could not find the table 'public.fechamento_metricas'", code: "PGRST205" })).toBe(true);
    expect(faltaColunaOuTabela({ message: "permission denied" })).toBe(false);
  });
});
