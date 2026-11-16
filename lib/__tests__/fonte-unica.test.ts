import { describe, expect, it } from "vitest";
import { juntarFontes } from "@/lib/clientes/fontes-unicas";
import { faturamentoDoPeriodo, leadsDoPeriodo, npsDoPeriodo, preConsultaDoPeriodo } from "@/lib/relatorio/fonte-unica";
import { leituraDasLinhas } from "@/lib/checkpoint/fontes";
import { lerNps, type Lead, type RespostaNps, type Venda } from "@/lib/fechamentos/leitores";

const d = (s: string) => { const [y, m, dd] = s.split("-").map(Number); return new Date(y, m - 1, dd); };
const venda = (data: string, valor: number | null, categoria = "Consulta", profissional = ""): Venda =>
  ({ linha: 1, data, paciente: "x", primeiraVez: null, valor, categoria, grupo: "", profissional, pagamento: "", unidade: "", descricao: "" });

describe("juntarFontes (Report Semanal → fonte única)", () => {
  it("traz a fonte que só existia no Semanal, com as colunas por letra", () => {
    const r = juntarFontes({}, {}, [
      { tipo: "nps", sheet_id: "S1", aba_nome: "Respostas", coluna_data: "a", mapeamento: { nota_geral: "C", comentario: "F", nome_paciente: "B", anonimato: "G", indicacao: "H" } },
      { tipo: "pre_consulta", sheet_id: "S2", aba_nome: "Form", coluna_data: "A", mapeamento: { motivo: "B", origem: "C" } },
    ]);
    expect(r.fontes.nps).toEqual({ sheetId: "S1", aba: "Respostas", colunas: { data: "A", indicacao: "C", comentario: "F", nome: "B", anonimato: "G", indicou: "H" } });
    expect(r.fontes.preConsulta?.colunas).toEqual({ data: "A", motivo: "B", origem: "C" });
    expect(r.mudou).toBe(true);
  });
  it("mesma planilha: só acrescenta as colunas que só o Semanal tinha", () => {
    const r = juntarFontes({ nps: { sheetId: "S1", aba: "Respostas", colunas: { indicacao: "D" } } }, {}, [
      { tipo: "nps", sheet_id: "S1", aba_nome: "respostas", coluna_data: "A", mapeamento: { nota_geral: "C", comentario: "F" } },
    ]);
    expect(r.fontes.nps?.colunas).toEqual({ indicacao: "D", comentario: "F" });
  });
  it("planilha diferente: vale a fonte única e fica uma nota", () => {
    const r = juntarFontes({ nps: { sheetId: "S9", aba: "NPS" } }, {}, [
      { tipo: "nps", sheet_id: "S1", aba_nome: "Respostas", coluna_data: "A", mapeamento: { comentario: "F" } },
    ]);
    expect(r.fontes.nps?.sheetId).toBe("S9");
    expect(r.notas[0]).toMatch(/NPS/);
  });
  it("uma aba por mês não é trazida sozinha", () => {
    const r = juntarFontes({}, {}, [{ tipo: "faturamento", sheet_id: "S", aba_nome: "", coluna_data: "A", mapeamento: { abas_mensais: { "2026-10": "Out" } } }]);
    expect(r.fontes.vendas).toBeUndefined();
    expect(r.notas[0]).toMatch(/aba por mês/);
  });
  it("valor de conversão dos leads vira status de agendamento", () => {
    const r = juntarFontes({}, {}, [{ tipo: "leads", sheet_id: "S", aba_nome: "CRM", coluna_data: "A", mapeamento: { convertido: "E", valor_conversao: "Convertido", linha_inicial: 3 } }]);
    expect(r.regras.statusAgendou).toEqual(["agendou", "agendado", "sim", "Convertido"]);
    expect(r.fontes.leads).toMatchObject({ colunas: { data: "A", status: "E" }, linhaCabecalho: 2 });
  });
});

describe("Report Semanal pela fonte única", () => {
  it("faturamento da semana e do mês, sem lançamentos sem valor", () => {
    const vs = [venda("2026-11-02", 100, "Consulta", "Dra. Ana"), venda("2026-11-09", 300, "consulta"), venda("2026-11-10", null), venda("2026-11-11", 50, "Exame")];
    const f = faturamentoDoPeriodo(vs, d("2026-11-09"), d("2026-11-15"));
    expect(f.total_faturado).toBe(350);
    expect(f.qtd_lancamentos).toBe(2);
    expect(f.por_categoria).toEqual({ consulta: { total: 300, pct_do_total: 85.7 }, Exame: { total: 50, pct_do_total: 14.3 } });
    expect(faturamentoDoPeriodo(vs, d("2026-11-01"), d("2026-11-15")).total_faturado).toBe(450);
  });
  it("leads: convertido = status de agendamento", () => {
    const l = (data: string, status: string): Lead => ({ linha: 1, data, origem: "", canal: "", interesse: "", status, objecao: "", responsavel: "" });
    const r = leadsDoPeriodo([l("2026-11-10", "Agendou"), l("2026-11-10", "não"), l("2026-11-11", "SIM"), l("2026-11-20", "sim")], d("2026-11-09"), d("2026-11-15"));
    expect(r).toEqual({ total: 3, convertidos: 2, taxa_conversao: 66.7 });
  });
  it("NPS: nota, comentários com a regra de anonimato e indicações", () => {
    const r = (o: Partial<RespostaNps>): RespostaNps => ({ linha: 1, data: "2026-11-10", indicacao: null, profissional: null, recepcao: null, infraestrutura: null, enfermagem: null, ...o });
    const n = npsDoPeriodo([
      r({ indicacao: 10, comentario: "Ótimo", nome: "Ana", anonimato: "Pode mostrar" }),
      r({ indicacao: 5, comentario: "Demorou", nome: "Bia", anonimato: "" }),
      r({ indicacao: 8, indicou: "Carla 62 98141-0165", nome: "Davi", anonimato: "Quero anonimato" }),
    ], d("2026-11-09"), d("2026-11-15"));
    expect(n.nps_score).toBe(0);
    expect(n.comentarios.map((c) => c.nome)).toEqual(["Ana", "Paciente (anônimo)"]);
    expect(n.indicacoes[0]).toMatchObject({ indicado_por: "Paciente (anônimo)", numero: "(62) 98141-0165" });
  });
  it("pré-consulta conta motivos e origens", () => {
    const p = preConsultaDoPeriodo([{ linha: 1, data: "2026-11-10", motivo: "Dor", origem: "Instagram" }, { linha: 2, data: "2026-11-11", motivo: "dor", origem: "" }], d("2026-11-09"), d("2026-11-15"));
    expect(p.total).toBe(2);
    expect(p.motivos).toEqual([{ nome: "Dor", count: 2, pct: 100 }]);
  });
  it("leitor de NPS: coluna configurada e célula ausente no fim da linha vira texto vazio", () => {
    const l = lerNps([["Data", "Nota", "Comentário", "Anonimato"], ["10/11/2026", "9", "Bom"], ["11/11/2026", "10", "", "Sim"]], { colunas: { anonimato: "D" } });
    expect(l.registros[0].anonimato).toBe("");
    expect(l.registros[0].comentario).toBe("Bom");
    expect(l.registros[1].anonimato).toBe("Sim");
  });
});

describe("Checkpoint pela fonte única", () => {
  it("último lançamento ignora datas no futuro e conta sem categoria no mês", () => {
    const l = leituraDasLinhas([{ data: "2026-11-30", categoria: "x" }, { data: "2026-11-12", categoria: "" }, { data: "2026-10-31", categoria: "" }], d("2026-11-16"), true);
    expect(l.ultimoLancamento?.getDate()).toBe(12);
    expect(l.lancamentosPeriodo).toBe(1);
    expect(l.semCategoriaPeriodo).toBe(1);
  });
});

import { limparSemanal, padraoSemanal } from "@/lib/relatorio/estrutura-semanal";
describe("Estrutura do Report Semanal", () => {
  it("sem nada salvo, vale o padrão com todos os blocos", () => {
    expect(limparSemanal(undefined)).toEqual(padraoSemanal());
  });
  it("mantém ordem e escolhas válidas, completa o que falta e deixa os feedbacks no fim", () => {
    const e = limparSemanal({ secoes: [{ id: "feedbacks", ligado: false }, { id: "acoes", ligado: true }, { id: "xx" }, { id: "destaques", ligado: false }], kpis: [{ id: "totalLeads", ligado: false }] });
    expect(e.secoes.map((s) => s.id)).toEqual(["acoes", "destaques", "indicadores", "alertas", "feedbacks"]);
    expect(e.secoes.find((s) => s.id === "feedbacks")?.ligado).toBe(false);
    expect(e.kpis[0]).toEqual({ id: "totalLeads", ligado: false });
    expect(e.kpis).toHaveLength(5);
  });
});
