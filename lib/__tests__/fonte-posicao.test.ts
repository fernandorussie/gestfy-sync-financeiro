import { describe, expect, it } from "vitest";
import {
  calcularPersonalizada, chaveIdentificacao, indicadorVazio, lerPlanilhaPersonalizada, limparFontePersonalizada, type FontePersonalizada,
} from "@/lib/fechamentos/fonte-personalizada";

// Planilha fictícia no formato "Contratos Atuais" (sem dados reais).
const valores = [
  ["Loja/Nº", "Localidade", "Status", "Término do Contrato", "Status contrato"],
  ["Loja 01", "Shopping", "Ocupada", "10/12/2026", "No prazo"],
  ["loja 1", "Shopping", "Ocupada", "10/12/2026", "No prazo"], // mesma unidade escrita diferente
  ["Loja 02", "Shopping", "Desocupada", "-", ""],
  ["Nº 10", "Padre Vairo", "Ocupada", "01/11/2026", "ATRASADO"], // vencido
  ["N° 10", "Padre Vairo", "Ocupada", "01/11/2026", "ATRASADO"], // duplicada com °
  ["Nº 11", "Padre Vairo", "Ocupada", "20/03/2027", "No prazo"],
  ["Nº 196 Casa", "Outros", "Ocupada", "", ""],
  ["", "", "", "", ""],
];

const base = (): FontePersonalizada => limparFontePersonalizada({
  id: "ctr", nome: "Contratos", sheetId: "x", aba: "Contratos Atuais", colunaData: "", modo: "posicao", pessoais: [],
  indicadores: [
    indicadorVazio({ id: "un", nome: "Unidades", operacao: "distintos", coluna: "Loja/Nº", filtros: [{ coluna: "Localidade", op: "diferente", valor: "Outros" }] }),
    indicadorVazio({ id: "vg", nome: "Vagas", operacao: "distintos", coluna: "Loja/Nº", filtros: [{ coluna: "Localidade", op: "diferente", valor: "Outros" }, { coluna: "Status", op: "igual", valor: "Desocupada" }] }),
    indicadorVazio({ id: "vac", nome: "Vacância", tipo: "formula", termos: ["vg", "un"], ops: ["%"], formato: "percentual" }),
    indicadorVazio({ id: "v60", nome: "Vencendo em 60 dias", operacao: "distintos", coluna: "Loja/Nº", filtros: [{ coluna: "Término do Contrato", op: "proximos", valor: "60" }, { coluna: "Status", op: "igual", valor: "Ocupada" }] }),
    indicadorVazio({ id: "venc", nome: "Vencidos", operacao: "distintos", coluna: "Loja/Nº", filtros: [{ coluna: "Término do Contrato", op: "passou" }, { coluna: "Status", op: "igual", valor: "Ocupada" }] }),
    indicadorVazio({ id: "atr", nome: "Em atraso", operacao: "distintos", coluna: "Loja/Nº", filtros: [{ coluna: "Status contrato", op: "igual", valor: "ATRASADO" }] }),
  ],
});

const periodo = { inicio: "2026-11-09", fim: "2026-11-15" };
const anterior = { inicio: "2026-11-02", fim: "2026-11-08" };

describe("fonte em posição atual", () => {
  it("lê todas as linhas sem coluna de data e ignora linhas vazias", () => {
    const l = lerPlanilhaPersonalizada(valores, base());
    expect(l.linhas).toHaveLength(7);
  });

  it("guarda o modo e trata a mesma unidade escrita de jeitos diferentes", () => {
    expect(base().modo).toBe("posicao");
    expect(chaveIdentificacao("Nº 10")).toBe(chaveIdentificacao("n° 10"));
    expect(chaveIdentificacao("Loja 01")).not.toBe(chaveIdentificacao("Loja 1"));
  });

  it("calcula unidades, vagas, vacância e contratos sem recorte de período", () => {
    const f = base();
    const r = calcularPersonalizada(f, lerPlanilhaPersonalizada(valores, f), periodo, anterior);
    const v = Object.fromEntries(r.indicadores.map((i) => [i.id, i.atual]));
    // Loja 01, loja 1 (número diferente), Loja 02, Nº 10 (= N° 10), Nº 11 = 5; Outros fica fora
    expect(v.un).toBe(5);
    expect(v.vg).toBe(1);
    expect(v.vac).toBeCloseTo(20);
    expect(v.v60).toBe(2); // Loja 01 e loja 1 vencem em 10/12 (até 14/01); "-" fica fora
    expect(v.venc).toBe(1);
    expect(v.atr).toBe(1);
    // Posição atual não tem anterior na planilha.
    expect(r.indicadores.every((i) => i.anterior === null)).toBe(true);
  });

  it("filtro de dias usa o fim do período como referência e ignora '-'", () => {
    const f = base();
    const r = calcularPersonalizada(f, lerPlanilhaPersonalizada(valores, f), { inicio: "2026-10-01", fim: "2026-10-31" }, anterior);
    const v = Object.fromEntries(r.indicadores.map((i) => [i.id, i.atual]));
    expect(v.v60).toBe(3); // referência 31/10: Nº 10 (01/11) + as duas lojas (10/12, até 30/12)
    expect(v.venc).toBe(0); // em 31/10 nada tinha vencido
  });
});
