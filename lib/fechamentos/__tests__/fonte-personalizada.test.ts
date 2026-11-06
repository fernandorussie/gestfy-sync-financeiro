import { describe, it, expect } from "vitest";
import { calcularPersonalizada, lerFontePersonalizada, lerPlanilhaPersonalizada, limparFontePersonalizada } from "../fonte-personalizada";

const planilha = [
  ["Controle de cirurgias 2026", "", "", "", ""],
  ["Data da cirurgia", "Procedimento", "Cirurgião", "Situação", "Valor total"],
  ["03/10/2026", "Lipo", "Dr. Alfa", "Realizada", "R$ 12.000,00"],
  ["10/10/2026", "Abdominoplastia", "Dr. Alfa", "Realizada", 15000],
  ["12/10/2026", "Lipo", "Dra. Bia", "Cancelada", 9000],
  ["20/10/2026", "Lipo", "Dra. Bia", "realizada", "8.500"],
  ["xx/10", "Lipo", "Dra. Bia", "Realizada", 1000],
  ["", "", "", "", ""],
  ["15/09/2026", "Lipo", "Dr. Alfa", "Realizada", 10000],
  ["Total", "", "", "", 55500],
];

const fonte = limparFontePersonalizada({
  nome: "Cirurgias", sheetId: "https://docs.google.com/spreadsheets/d/ABC123/edit", aba: "Base", colunas: {},
  filtro: { campo: "status", valores: ["Realizada"] }, medidas: { quantidade: true, valor: true, media: true }, quebras: ["categoria", "profissional"],
});

describe("fonte personalizada", () => {
  it("limpa a configuração: id da planilha, filtro e quebras", () => {
    expect(fonte.sheetId).toBe("ABC123");
    expect(fonte.filtro).toEqual({ campo: "status", valores: ["Realizada"] });
    expect(fonte.quebras).toEqual(["categoria", "profissional"]);
  });

  it("acha o cabeçalho e as colunas pelos nomes usuais", () => {
    const l = lerPlanilhaPersonalizada(planilha, fonte);
    expect(l.linhaCabecalho).toBe(2);
    expect(Object.fromEntries(l.colunas.map((c) => [c.campo, c.letra]))).toMatchObject({ data: "A", categoria: "B", profissional: "C", status: "D", valor: "E" });
    expect(l.linhas).toHaveLength(5);
    expect(l.ignoradas.map((x) => x.linha)).toEqual([7, 10]);
  });

  it("calcula com filtro (sem diferenciar maiúsculas), compara e quebra", () => {
    const l = lerPlanilhaPersonalizada(planilha, fonte);
    const r = calcularPersonalizada(fonte, l, { inicio: "2026-10-01", fim: "2026-10-31" }, { inicio: "2026-09-01", fim: "2026-09-30" });
    expect(r.atual).toEqual({ quantidade: 3, valor: 35500, media: 11833.33 });
    expect(r.anterior).toEqual({ quantidade: 1, valor: 10000, media: 10000 });
    expect(r.quebras[0].itens).toEqual([{ nome: "Lipo", quantidade: 2, valor: 20500 }, { nome: "Abdominoplastia", quantidade: 1, valor: 15000 }]);
    expect(r.quebras[1].itens.map((x) => x.nome)).toEqual(["Dr. Alfa", "Dra. Bia"]);
  });

  it("coluna indicada pela letra e sem valor: conta linhas", () => {
    const f = limparFontePersonalizada({ nome: "Recall", sheetId: "X", aba: "A", colunas: { data: "a", status: "D" }, medidas: { quantidade: true, valor: false, media: false }, quebras: ["status"] });
    const r = calcularPersonalizada(f, lerPlanilhaPersonalizada(planilha, f), { inicio: "2026-10-01", fim: "2026-10-31" }, { inicio: "2026-09-01", fim: "2026-09-30" });
    expect(r.atual.quantidade).toBe(4);
    expect(r.quebras[0].itens).toEqual([{ nome: "Realizada", quantidade: 3, valor: 35500 }, { nome: "Cancelada", quantidade: 1, valor: 9000 }]);
  });

  it("erro amigável quando falta a coluna de data ou a planilha não abre", async () => {
    const semData = await lerFontePersonalizada(fonte, async () => [["Nome", "Valor"], ["a", 1]]);
    expect(semData.erro).toContain("Coluna não encontrada: Data");
    const semAcesso = await lerFontePersonalizada(fonte, async () => { throw new Error("The caller does not have permission (403)"); });
    expect(semAcesso.erro).toContain("Sem permissão");
  });
});
