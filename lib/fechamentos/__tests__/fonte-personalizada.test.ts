import { describe, it, expect } from "vitest";
import {
  adaptarResultado, aplicarFormula, calcularFontes, calcularPersonalizada, colunasUsadas, indicadorVazio, lerFontePersonalizada, lerPlanilhaPersonalizada, limparFontePersonalizada,
  type FontePersonalizada,
} from "../fonte-personalizada";
import type { Indicadores } from "../indicadores";

const planilha = [
  ["Controle de cirurgias 2026", "", "", "", "", ""],
  ["Data da cirurgia", "Procedimento", "Cirurgião", "Situação", "Valor total", "Paciente"],
  ["03/10/2026", "Lipo", "Dr. Alfa", "Realizada", "R$ 12.000,00", "Ana"],
  ["10/10/2026", "Abdominoplastia", "Dr. Alfa", "Realizada", 15000, "Bruno"],
  ["12/10/2026", "Lipo", "Dra. Bia", "Cancelada", 9000, "Ana"],
  ["20/10/2026", "Lipo", "Dra. Bia", "realizada", "8.500", "Carla"],
  ["xx/10", "Lipo", "Dra. Bia", "Realizada", 1000, "Duda"],
  ["", "", "", "", "", ""],
  ["15/09/2026", "Lipo", "Dr. Alfa", "Realizada", 10000, "Eva"],
  ["Total", "", "", "", 55500, ""],
];
const OUT = { inicio: "2026-10-01", fim: "2026-10-31" };
const SET = { inicio: "2026-09-01", fim: "2026-09-30" };

/** Fonte no formato antigo (v2.3), como está salva no banco. */
const antiga = limparFontePersonalizada({
  nome: "Cirurgias", sheetId: "https://docs.google.com/spreadsheets/d/ABC123/edit", aba: "Base", colunas: {},
  filtro: { campo: "status", valores: ["Realizada"] }, medidas: { quantidade: true, valor: true, media: true }, quebras: ["categoria", "profissional"],
} as never);

const val = (r: ReturnType<typeof calcularPersonalizada>, id: string) => r.indicadores.find((x) => x.id === id);

describe("fonte personalizada: formato antigo convertido", () => {
  it("vira indicadores equivalentes, com colunas automáticas", () => {
    expect(antiga.sheetId).toBe("ABC123");
    expect(antiga.colunaData).toBe("");
    expect(antiga.indicadores.map((d) => d.id)).toEqual(["qtd", "valor", "media", "por-categoria", "por-profissional"]);
    expect(antiga.indicadores[0].filtros).toEqual([{ coluna: "~status", op: "igual", valor: "Realizada" }]);
  });

  it("lê só as colunas usadas e acha o cabeçalho", () => {
    const l = lerPlanilhaPersonalizada(planilha, antiga);
    expect(l.linhaCabecalho).toBe(2);
    expect(Object.fromEntries(l.colunas.map((c) => [c.ref, c.letra]))).toMatchObject({ "~data": "A", "~categoria": "B", "~profissional": "C", "~status": "D", "~valor": "E" });
    expect(l.linhas).toHaveLength(5);
    expect(l.ignoradas.map((x) => x.linha)).toEqual([7, 10]);
    // A coluna Paciente não é usada: não fica em memória.
    expect(Object.values(l.linhas[0].c)).not.toContain("Ana");
  });

  it("dá os mesmos números de antes", () => {
    const r = calcularPersonalizada(antiga, lerPlanilhaPersonalizada(planilha, antiga), OUT, SET);
    expect([val(r, "qtd")?.atual, val(r, "valor")?.atual, val(r, "media")?.atual]).toEqual([3, 35500, 11833.33]);
    expect([val(r, "qtd")?.anterior, val(r, "valor")?.anterior, val(r, "media")?.anterior]).toEqual([1, 10000, 10000]);
    expect(val(r, "por-categoria")?.grupos).toEqual([{ nome: "Lipo", valor: 20500, linhas: 2 }, { nome: "Abdominoplastia", valor: 15000, linhas: 1 }]);
    expect(val(r, "por-profissional")?.grupos?.map((x) => x.nome)).toEqual(["Dr. Alfa", "Dra. Bia"]);
  });

  it("medida desligada vira indicador oculto (usado só na fórmula)", () => {
    const f = limparFontePersonalizada({ nome: "X", sheetId: "X", aba: "A", colunas: { data: "a" }, medidas: { quantidade: false, valor: false, media: true }, quebras: [] } as never);
    const r = calcularPersonalizada(f, lerPlanilhaPersonalizada(planilha, f), OUT, SET);
    expect(r.indicadores.map((x) => x.id)).toEqual(["media"]);
  });
});

describe("construtor de indicadores", () => {
  const base: FontePersonalizada = limparFontePersonalizada({
    nome: "Cirurgias", sheetId: "S", aba: "Base", colunaData: "Data da cirurgia", pessoais: ["Paciente"],
    indicadores: [
      indicadorVazio({ id: "real", nome: "Realizadas", operacao: "contar", filtros: [{ coluna: "Situação", op: "igual", valor: "Realizada" }] }),
      indicadorVazio({ id: "pac", nome: "Pacientes únicos", operacao: "distintos", coluna: "Paciente" }),
      indicadorVazio({ id: "taxa", nome: "Taxa de realização", operacao: "percentual", condicao: { coluna: "Situação", op: "igual", valor: "Realizada" }, formato: "percentual" }),
      indicadorVazio({ id: "maior", nome: "Maior cirurgia", operacao: "maximo", coluna: "Valor total", formato: "moeda" }),
      indicadorVazio({ id: "soma", nome: "Valor", operacao: "somar", coluna: "E", oculto: true }),
      indicadorVazio({ id: "tk", nome: "Ticket por paciente", tipo: "formula", termos: ["soma", "pac"], ops: ["/"], formato: "moeda" }),
      indicadorVazio({ id: "part", nome: "% do faturamento", tipo: "formula", termos: ["soma", "padrao:faturamento"], ops: ["%"], formato: "percentual", secao: "resultado" }),
      indicadorVazio({ id: "grp", nome: "Por cirurgião", operacao: "contar", agruparPor: "Paciente" }),
    ],
  });

  it("não agrupa por coluna de dado pessoal", () => {
    expect(base.indicadores.find((d) => d.id === "grp")?.agruparPor).toBeUndefined();
  });

  it("lê só as colunas referidas (cabeçalho, letra) e a de dado pessoal só para distintos", () => {
    expect(colunasUsadas(base).sort()).toEqual(["Data da cirurgia", "E", "Paciente", "Situação", "Valor total"].sort());
  });

  it("calcula operações, percentual, fórmulas e usa indicadores padrão", () => {
    const padrao = { atual: { faturamento: { total: 100000 } } as unknown as Indicadores, anterior: { faturamento: { total: 50000 } } as unknown as Indicadores };
    const r = calcularFontes([base], new Map([[base.id, { leitura: lerPlanilhaPersonalizada(planilha, base), erro: null }]]), OUT, SET, padrao)[0];
    const v = Object.fromEntries(r.indicadores.map((d) => [d.id, [d.atual, d.anterior]]));
    expect(v.real).toEqual([3, 1]);
    expect(v.pac).toEqual([3, 1]); // Ana, Bruno, Carla
    expect(v.taxa).toEqual([75, 100]);
    expect(v.maior).toEqual([15000, 10000]);
    expect(v.soma).toBeUndefined(); // oculto
    expect(v.tk).toEqual([14833.33, 10000]); // 44500 / 3
    expect(v.part).toEqual([44.5, 20]);
    expect(r.indicadores.find((d) => d.id === "part")?.secao).toBe("resultado");
    expect(r.indicadores.find((d) => d.id === "tk")?.descricao).toBe("Valor ÷ Pacientes únicos");
  });

  it("fórmula com outra fonte (id.indicador)", () => {
    const outra = limparFontePersonalizada({ id: "f2", nome: "Leads", sheetId: "S", aba: "B", colunaData: "A", indicadores: [indicadorVazio({ id: "n", operacao: "contar" })] });
    const alvo = limparFontePersonalizada({ id: "f1", nome: "Conv", sheetId: "S", aba: "B", colunaData: "A", indicadores: [indicadorVazio({ id: "c", tipo: "formula", termos: ["f2.n", "f2.n"], ops: ["/"] })] });
    const leit = lerPlanilhaPersonalizada([["Data"], ["01/10/2026"], ["02/10/2026"]], outra);
    const r = calcularFontes([alvo, outra], new Map([["f2", { leitura: leit, erro: null }], ["f1", { leitura: leit, erro: null }]]), OUT, SET);
    expect(r[0].indicadores[0].atual).toBe(1);
  });

  it("filtros: diferente, contém, maior, vazio", () => {
    const f = limparFontePersonalizada({ nome: "F", sheetId: "S", aba: "A", colunaData: "A", indicadores: [
      indicadorVazio({ id: "a", operacao: "contar", filtros: [{ coluna: "Situação", op: "diferente", valor: "Cancelada" }, { coluna: "Valor total", op: "maior", valor: "9000" }] }),
      indicadorVazio({ id: "b", operacao: "contar", filtros: [{ coluna: "Procedimento", op: "contem", valor: "abdomin" }] }),
      indicadorVazio({ id: "c", operacao: "contar", filtros: [{ coluna: "Situação", op: "vazio" }] }),
    ] });
    const r = calcularPersonalizada(f, lerPlanilhaPersonalizada(planilha, f), OUT, SET);
    expect(r.indicadores.map((d) => d.atual)).toEqual([2, 1, 0]);
  });

  it("aplicarFormula: divisão por zero e termo vazio dão vazio", () => {
    expect(aplicarFormula([10, 0], ["/"])).toBeNull();
    expect(aplicarFormula([10, null], ["+"])).toBeNull();
    expect(aplicarFormula([10, 4, 2], ["-", "*"])).toBe(12);
  });
});

describe("compatibilidade", () => {
  it("adapta o resultado antigo guardado em fechamentos concluídos", () => {
    const r = adaptarResultado({
      id: "x", nome: "Cirurgias", medidas: { quantidade: true, valor: true, media: false }, filtro: null,
      atual: { quantidade: 3, valor: 100, media: null }, anterior: { quantidade: 1, valor: 50, media: null },
      quebras: [{ campo: "categoria", rotulo: "Por categoria", itens: [{ nome: "Lipo", quantidade: 2, valor: 80 }] }], linhasLidas: 5, ignoradas: 0, erro: null,
    });
    expect(r.indicadores.map((d) => [d.nome, d.atual])).toEqual([["Quantidade", 3], ["Valor total", 100], ["Por categoria", null]]);
    expect(r.indicadores[2].grupos).toEqual([{ nome: "Lipo", valor: 80, linhas: 2 }]);
  });

  it("erro amigável quando falta a coluna de data ou a planilha não abre", async () => {
    const semData = await lerFontePersonalizada(antiga, async () => [["Nome", "Valor"], ["a", 1]]);
    expect(semData.erro).toContain("Coluna não encontrada: Data");
    const semAcesso = await lerFontePersonalizada(antiga, async () => { throw new Error("The caller does not have permission (403)"); });
    expect(semAcesso.erro).toContain("Sem permissão");
  });
});
