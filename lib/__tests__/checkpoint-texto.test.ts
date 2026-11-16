import { describe, it, expect } from "vitest";
import { montarTextoCheckpoint, resumoStatus } from "../checkpoint/montar-texto";
import type { ClinicaTexto } from "../checkpoint/montar-texto";

const HOJE = new Date(2026, 9, 19); // 19/10/2026

function clinica(nome: string, indicadores: ClinicaTexto["indicadores"]): ClinicaTexto {
  return { clinicaNome: nome, indicadores };
}

describe("montarTextoCheckpoint", () => {
  it("abre com o título e a data de hoje", () => {
    const t = montarTextoCheckpoint([clinica("Axem", [])], HOJE);
    expect(t.split("\n")[0]).toBe("*CHECKPOINT · 19/10/2026*");
  });

  it("usa ✅ e ⚠️ e anexa a observação depois do travessão", () => {
    const t = montarTextoCheckpoint([
      clinica("Axem", [
        { label: "Faturamento", status: "ok", observacao: "" },
        { label: "Despesas", status: "atencao", observacao: "Último lançamento em 10/10 (6 dias úteis atrás)" },
      ]),
    ], HOJE);
    expect(t).toContain("✅ Faturamento");
    expect(t).toContain("⚠️ Despesas — Último lançamento em 10/10 (6 dias úteis atrás)");
  });

  it("indicador ok sem observação não ganha travessão solto", () => {
    const t = montarTextoCheckpoint([
      clinica("Axem", [{ label: "NPS", status: "ok", observacao: "" }]),
    ], HOJE);
    expect(t).toContain("✅ NPS");
    expect(t).not.toContain("NPS —");
  });

  it("status em branco sai com ⬜ e ganha legenda no fim", () => {
    const t = montarTextoCheckpoint([
      clinica("Axem", [{ label: "Fechamentos", status: null, observacao: "" }]),
    ], HOJE);
    expect(t).toContain("⬜ Fechamentos");
    expect(t).toContain("⬜ = a confirmar");
  });

  it("sem nenhum em branco, não há legenda", () => {
    const t = montarTextoCheckpoint([
      clinica("Axem", [{ label: "NPS", status: "ok", observacao: "" }]),
    ], HOJE);
    expect(t).not.toContain("a confirmar");
  });

  it("separa as clínicas com o nome em negrito", () => {
    const t = montarTextoCheckpoint([
      clinica("Axem",        [{ label: "NPS", status: "ok", observacao: "" }]),
      clinica("Claros Clinic", [{ label: "Leads", status: "atencao", observacao: "Sem lançamentos" }]),
    ], HOJE);
    expect(t).toContain("*Axem*");
    expect(t).toContain("*Claros Clinic*");
    expect(t.indexOf("*Axem*")).toBeLessThan(t.indexOf("*Claros Clinic*"));
  });

  it("clínica sem indicador ativo é declarada, não some", () => {
    const t = montarTextoCheckpoint(
      [{ clinicaNome: "Healthme", indicadores: [], semIndicadores: true }], HOJE
    );
    expect(t).toContain("*Healthme*");
    expect(t).toContain("_Sem indicadores ativos._");
  });

  it("nunca imprime null, undefined ou NaN", () => {
    const t = montarTextoCheckpoint([
      {
        clinicaNome: undefined as unknown as string,
        indicadores: [
          { label: "NPS", status: null, observacao: null as unknown as string },
          { label: "", status: "ok", observacao: "some" },
        ],
      },
    ], HOJE);
    expect(t).not.toMatch(/null|undefined|NaN/);
    expect(t).toContain("*Cliente*");
    // indicador sem nome não vira linha
    expect(t).not.toContain("some");
  });
});

describe("resumoStatus", () => {
  it("conta por status, ignorando clínica sem indicadores", () => {
    const r = resumoStatus([
      clinica("A", [
        { label: "x", status: "ok", observacao: "" },
        { label: "y", status: "atencao", observacao: "" },
        { label: "z", status: null, observacao: "" },
      ]),
      { clinicaNome: "B", indicadores: [], semIndicadores: true },
    ]);
    expect(r).toEqual({ ok: 1, atencao: 1, branco: 1, total: 3 });
  });

  it("lista vazia zera tudo", () => {
    expect(resumoStatus([])).toEqual({ ok: 0, atencao: 0, branco: 0, total: 0 });
  });
});
