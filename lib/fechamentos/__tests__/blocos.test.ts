import { describe, it, expect } from "vitest";
import { BLOCOS, blocosLigados, indisponiveis, limparOcultos } from "../blocos";
import { CATALOGO, estruturaPadrao, normalizarEstrutura, paginar } from "../estrutura";
import { calcularIndicadores, type DadosFechamento } from "../indicadores";
import { lerLeads } from "../leitores";

const vazio: DadosFechamento = { vendas: null, despesas: null, orcamentos: null, leads: null, nps: null, avaliacoes: null };

describe("Etapa B: catálogo de blocos", () => {
  it("cada bloco pertence a uma seção do catálogo e tem fonte e regra", () => {
    const secoes = new Set(CATALOGO.map((s) => s.id));
    for (const b of BLOCOS) {
      expect(secoes.has(b.secao), b.id).toBe(true);
      expect(b.fonte && b.regra, b.id).toBeTruthy();
    }
    expect(new Set(BLOCOS.map((b) => b.id)).size).toBe(BLOCOS.length);
  });

  it("estrutura antiga: nível Resumo esconde os blocos de detalhe; completo mostra tudo", () => {
    expect([...blocosLigados({ id: "funilLeads", nivel: "resumo" }, "mensal")]).toEqual(["leads.funil"]);
    expect(blocosLigados({ id: "funilLeads", nivel: "completo" }, "mensal").size).toBe(5);
    // Quinzenal não tem serviço nem canal.
    expect([...blocosLigados({ id: "funilLeads", nivel: "completo" }, "quinzenal")]).toEqual(["leads.funil", "leads.origem", "leads.objecoes"]);
  });

  it("escolha salva vale; obrigatórios não saem", () => {
    const b = blocosLigados({ id: "resultado", ocultos: ["res.meta", "res.faturamento"] }, "mensal");
    expect(b.has("res.meta")).toBe(false);
    expect(b.has("res.faturamento")).toBe(true);
    expect(limparOcultos("resultado", ["res.meta", "res.faturamento", "leads.canal", 3])).toEqual(["res.meta"]);
  });

  it("relatório de antes com Entradas: ticket dos novos fica fora até o usuário escolher", () => {
    expect(blocosLigados({ id: "resultado" }, "mensal", { real: true }).has("res.ticketNovos")).toBe(false);
    expect(blocosLigados({ id: "resultado", ocultos: [] }, "mensal", { real: true }).has("res.ticketNovos")).toBe(true);
  });

  it("normalização guarda blocos e quebra de página", () => {
    const n = normalizarEstrutura([{ id: "resultado", ocultos: ["res.meta", "xx"] }, { id: "receitas" }, { id: "distribuicao", ativa: true, novaPagina: false }], "mensal");
    expect(n.find((s) => s.id === "resultado")?.ocultos).toEqual(["res.meta"]);
    expect(n.find((s) => s.id === "distribuicao")?.novaPagina).toBe(false);
    expect(estruturaPadrao("mensal").some((s) => "ocultos" in s || "novaPagina" in s)).toBe(false);
  });

  it("quebra de página: juntar à anterior ou forçar página nova", () => {
    const e = normalizarEstrutura([{ id: "resultado" }, { id: "receitas" }, { id: "distribuicao", ativa: true, novaPagina: false }, { id: "despesas" }, { id: "experiencia", novaPagina: true }], "mensal")
      .map((s) => (["grafico", "funilLeads", "funilOrcamentos", "entradas", "regimes"].includes(s.id) ? { ...s, ativa: false } : s));
    expect(paginar(e, "mensal").map((p) => p.secoes.map((s) => s.id))).toEqual([["resultado"], ["receitas", "distribuicao"], ["despesas"], ["experiencia"]]);
  });

  it("disponibilidade pelos dados do cliente", () => {
    const leads = lerLeads([["Data", "Agendou?"], ["01/10/2026", "Sim"]]).registros;
    const i = calcularIndicadores({ ...vazio, leads }, { inicio: "2026-10-01", fim: "2026-10-31" });
    const sem = indisponiveis(i);
    expect(sem["leads.canal"]).toMatch(/canal/);
    expect(sem["leads.funil"]).toBeUndefined();
    expect(sem["res.entradas"]).toBeTruthy();
    expect(indisponiveis(null)).toEqual({});
  });
});

import { explicarErro } from "../erros";
import { mesesComDados, regimesAnuais } from "../indicadores";

describe("Revisão de UX", () => {
  it("erros técnicos viram o que fazer", () => {
    expect(explicarErro(new Error("GOOGLE_SERVICE_ACCOUNT_JSON não configurado")).titulo).toMatch(/conexão com o Google/);
    expect(explicarErro(new Error("The caller does not have permission")).acao).toMatch(/leitor-planilhas@/);
    expect(explicarErro(new Error("Quota exceeded (429)")).acao).toMatch(/minuto/);
    const x = explicarErro(new Error("Cannot read properties of undefined (reading 'filter')"));
    expect(x.titulo).toMatch(/Algo deu errado/);
    expect(x.detalhe).toContain("Cannot read");
  });
  it("ano começa no primeiro mês com lançamento; mês vazio no meio é marcado", () => {
    const z = { entradas: 0, saidasCaixa: 0, saidasCompetencia: 0 };
    const linhas = [{ mes: "2026-01", ...z }, { mes: "2026-02", ...z }, { mes: "2026-03", entradas: 10, saidasCaixa: 5, saidasCompetencia: 5 }, { mes: "2026-04", ...z }, { mes: "2026-05", entradas: 20, saidasCaixa: 5, saidasCompetencia: 5 }];
    expect(mesesComDados(linhas).map((l) => l.mes)).toEqual(["2026-03", "2026-04", "2026-05"]);
    const reg = regimesAnuais(linhas);
    expect(reg.linhas.map((l) => !!l.vazio)).toEqual([false, true, false]);
    expect(reg.total.faturamento).toBe(30);
    expect(mesesComDados([{ mes: "2026-01", ...z }])).toEqual([]);
  });
});
