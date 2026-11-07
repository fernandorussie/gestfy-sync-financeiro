import { describe, it, expect } from "vitest";
import fixture from "./fixtures/claros-2026-10.json";
import { coletar, faixaDaAba, type FontesFechamento } from "../coleta";
import { calcularIndicadores } from "../indicadores";
import type { Celula } from "../texto";
import { OUTUBRO } from "./carregar-fixture";

const f = fixture as unknown as Record<string, Celula[][]>;
const planilhas: Record<string, Celula[][]> = {
  "vendas|'Base'": f.vendas,
  "despesas|'Base'": f.despesas,
  "orcamentos|'Base'": f.orcamentos,
  "leads|'Sistema'": f.leads,
  "nps|'Base'": f.nps,
};
const lerFalso = async (sheetId: string, faixa: string) => {
  const r = planilhas[`${sheetId}|${faixa}`];
  if (!r) throw new Error("Unable to parse range: " + faixa);
  return r;
};

// Mapa da Claros como ficará salvo no cadastro da clínica.
const fontes: FontesFechamento = {
  vendas: { sheetId: "vendas", aba: "Base", colunas: { unidade: "R" } },
  despesas: { sheetId: "despesas", aba: "Base" },
  orcamentos: { sheetId: "orcamentos", aba: "Base" },
  leads: { sheetId: "leads", aba: "Sistema" },
  nps: { sheetId: "nps", aba: "Base" },
  avaliacoes: { sheetId: "google", aba: "Avaliações" },
};

describe("coleta", () => {
  it("lê as fontes configuradas e o resultado bate com a planilha", async () => {
    const r = await coletar(fontes, lerFalso);
    const ind = calcularIndicadores(r.dados, OUTUBRO);
    expect(ind.faturamento?.total).toBe(117650);
    expect(ind.despesas?.total).toBe(110850.14);
    expect(r.leituras.vendas?.colunas.origem.unidade).toMatchObject({ letra: "R" });
  });

  it("fonte com erro vira mensagem clara e não derruba as outras", async () => {
    const r = await coletar(fontes, lerFalso);
    expect(r.erros.avaliacoes).toBe("Aba não encontrada. Confira o nome exato da aba na configuração do cliente.");
    expect(r.dados.avaliacoes).toBeNull();
    expect(r.dados.vendas).not.toBeNull();
  });

  it("coluna obrigatória faltando bloqueia só aquela fonte", async () => {
    const r = await coletar({ vendas: { sheetId: "x", aba: "Base" } }, async () => [["Data", "Paciente"], ["01/10/2026", "Ana"]]);
    expect(r.erros.vendas).toContain("Valor pago");
    expect(r.dados.vendas).toBeNull();
  });

  it("sem permissão orienta a compartilhar com a conta de serviço", async () => {
    const r = await coletar({ nps: { sheetId: "x", aba: "Base" } }, async () => { throw new Error("The caller does not have permission (403)"); });
    expect(r.erros.nps).toMatch(/Compartilhe a planilha/);
  });

  it("aba com espaço ou apóstrofo vai entre aspas", () => {
    expect(faixaDaAba("Respostas NPS")).toBe("'Respostas NPS'");
    expect(faixaDaAba("D'Ávila")).toBe("'D''Ávila'");
  });
});
