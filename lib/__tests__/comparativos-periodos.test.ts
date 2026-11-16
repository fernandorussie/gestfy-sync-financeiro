import { describe, expect, it } from "vitest";
import { anoAnteriorDe, anteriorDe, fatiar, intervaloDe, metaDoIntervalo, mesesInteiros } from "@/lib/fechamentos/comparativos";

const H = new Date(2026, 10, 16); // 16/11/2026, segunda-feira

describe("intervaloDe", () => {
  it("padrões: o mais recente já fechado", () => {
    expect(intervaloDe({ tipo: "ano" }, H)).toMatchObject({ inicio: "2026-01-01", fim: "2026-10-31", parcial: false });
    expect(intervaloDe({ tipo: "12m" }, H)).toMatchObject({ inicio: "2025-11-01", fim: "2026-10-31" });
    expect(intervaloDe({ tipo: "semestre" }, H)).toMatchObject({ inicio: "2026-01-01", fim: "2026-06-30", parcial: false });
    expect(intervaloDe({ tipo: "trimestre" }, H)).toMatchObject({ inicio: "2026-07-01", fim: "2026-09-30", parcial: false });
    expect(intervaloDe({ tipo: "trimestre", atual: true }, H)).toMatchObject({ inicio: "2026-10-01", fim: "2026-11-16", parcial: true });
    expect(intervaloDe({ tipo: "mes" }, H)).toMatchObject({ inicio: "2026-10-01", fim: "2026-10-31" });
    expect(intervaloDe({ tipo: "quinzena" }, H)).toMatchObject({ inicio: "2026-11-01", fim: "2026-11-15" });
    expect(intervaloDe({ tipo: "semana" }, H)).toMatchObject({ inicio: "2026-11-09", fim: "2026-11-15" });
  });
  it("referências explícitas", () => {
    expect(intervaloDe({ tipo: "trimestre", ref: "2026-3" }, H)).toMatchObject({ inicio: "2026-07-01", fim: "2026-09-30", rotulo: "3º trimestre/2026" });
    expect(intervaloDe({ tipo: "quinzena", ref: "2026-02-2" }, H)).toMatchObject({ inicio: "2026-02-16", fim: "2026-02-28" });
    expect(intervaloDe({ tipo: "semana", ref: "2026-11-12" }, H)).toMatchObject({ inicio: "2026-11-09", fim: "2026-11-15" });
    expect(intervaloDe({ tipo: "livre", ref: "2026-11-15_2026-09-01" }, H)).toMatchObject({ inicio: "2026-09-01", fim: "2026-11-15" });
  });
  it("mês atual entra como parcial só quando pedido", () => {
    expect(intervaloDe({ tipo: "mes", atual: true }, H)).toMatchObject({ inicio: "2026-11-01", fim: "2026-11-16", parcial: true });
    expect(intervaloDe({ tipo: "12m", atual: true }, H)).toMatchObject({ inicio: "2025-12-01", fim: "2026-11-16", parcial: true });
  });
});

describe("anterior e ano anterior", () => {
  it("período anterior do mesmo tipo", () => {
    expect(anteriorDe({ tipo: "mes", ref: "2026-01" }, H)).toEqual({ tipo: "mes", ref: "2025-12" });
    expect(anteriorDe({ tipo: "trimestre", ref: "2026-1" }, H)).toEqual({ tipo: "trimestre", ref: "2025-4" });
    expect(anteriorDe({ tipo: "quinzena", ref: "2026-11-1" }, H)).toEqual({ tipo: "quinzena", ref: "2026-10-2" });
    expect(anteriorDe({ tipo: "semana", ref: "2026-11-09" }, H)).toEqual({ tipo: "semana", ref: "2026-11-02" });
    expect(intervaloDe(anteriorDe({ tipo: "livre", ref: "2026-11-01_2026-11-10" }, H), H)).toMatchObject({ inicio: "2026-10-22", fim: "2026-10-31" });
  });
  it("mesmo período do ano anterior", () => {
    expect(anoAnteriorDe({ tipo: "mes", ref: "2026-10" }, H)).toEqual({ tipo: "mes", ref: "2025-10" });
    expect(anoAnteriorDe({ tipo: "trimestre", ref: "2026-3" }, H)).toEqual({ tipo: "trimestre", ref: "2025-3" });
    expect(anoAnteriorDe({ tipo: "quinzena", ref: "2026-11-1" }, H)).toEqual({ tipo: "quinzena", ref: "2025-11-1" });
  });
});

describe("fatiar", () => {
  it("por mês, por quinzena e por semana (pontas parciais)", () => {
    expect(fatiar({ inicio: "2026-01-01", fim: "2026-03-31" }, "mes", H).map((f) => f.chave)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(fatiar({ inicio: "2026-10-01", fim: "2026-10-31" }, "quinzena", H).map((f) => f.rotulo)).toEqual(["1ª out/26", "2ª out/26"]);
    const s = fatiar({ inicio: "2026-10-01", fim: "2026-10-31" }, "semana", H);
    expect(s[0]).toMatchObject({ inicio: "2026-10-01", fim: "2026-10-04", parcial: true });
    expect(s[s.length - 1]).toMatchObject({ inicio: "2026-10-26", fim: "2026-10-31", parcial: true });
  });
  it("no máximo 26 pontos, os mais recentes", () => {
    const s = fatiar({ inicio: "2026-01-01", fim: "2026-10-31" }, "semana", H);
    expect(s).toHaveLength(26);
    expect(s[25].fim).toBe("2026-10-31");
  });
});

describe("meta do intervalo", () => {
  const metas = new Map([["2026-07", 100], ["2026-08", 120], ["2026-09", 110]]);
  it("soma das metas mensais em meses inteiros", () => {
    expect(mesesInteiros({ inicio: "2026-07-01", fim: "2026-09-30" })).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(metaDoIntervalo({ inicio: "2026-07-01", fim: "2026-09-30" }, metas)).toBe(330);
  });
  it("sem meta em algum mês ou fora de meses inteiros: não disponível", () => {
    expect(metaDoIntervalo({ inicio: "2026-07-01", fim: "2026-10-31" }, metas)).toBeNull();
    expect(metaDoIntervalo({ inicio: "2026-07-01", fim: "2026-07-15" }, metas)).toBeNull();
  });
});
