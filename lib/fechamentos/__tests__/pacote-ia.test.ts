import { describe, it, expect } from "vitest";
import { conferir } from "../conferencia";
import { decidir, decisoesVazias } from "../decisoes";
import { fichaVazia, lerFichaGerada, pedidoFicha } from "../ficha";
import { calcularIndicadores, resumoAnual } from "../indicadores";
import { apelidosProfissionais, lerResposta, montarPacote, type DadosPacote } from "../pacote-ia";
import { textoVazio } from "../texto-fechamento";
import { carregarClaros, OUTUBRO } from "./carregar-fixture";

const { dados, leituras } = carregarClaros();
const indicadores = calcularIndicadores(dados, OUTUBRO, { meta: 188000 });
const anterior = calcularIndicadores(dados, { inicio: "2026-09-01", fim: "2026-09-30" });
const alertas = conferir({ dados, periodo: OUTUBRO, leituras });
const decisoes = decidir(decisoesVazias(), alertas.find((a) => a.regra === "pagamentos-pontuais")!, "aplicar");
const base: DadosPacote = {
  clinica: "Claros Clinic", tipo: "mensal", indicadores, anterior, anual: resumoAnual(dados, 2026, 10), ritmo: null, alertas, decisoes,
  texto: { ...textoVazio(), contexto: "- Black Week em novembro" }, acoes: [],
  acompanhamento: [{ id: "x", titulo: "Recall de pacientes", responsaveis: ["Recepção"], status: "andamento", nota: "metade da lista" }],
  ficha: { ...fichaVazia(), cidade: "Goiânia", uf: "GO", especialidades: "Nutrologia, ginecologia", perfil: "Clínica de emagrecimento e saúde da mulher" },
};

describe("pacote para o Claude", () => {
  const p = montarPacote(base);

  it("traz instruções, formato da resposta, ficha e números do período", () => {
    expect(p).toContain("Responda SOMENTE no formato abaixo");
    expect(p).toContain("### PLANO DE AÇÃO");
    expect(p).toContain("**Local:** Goiânia/GO");
    expect(p).toContain("- Faturamento: R$ 117.650,00");
    expect(p).toContain("- Meta do mês: R$ 188.000,00 | atingimento 62,6%");
    expect(p).toContain("| Plano de Acompanhamento | R$ 28.200");
    expect(p).toContain("Pagamentos pontuais no período (não recorrentes): IRPJ, CSLL");
    expect(p).toContain("- Recall de pacientes (Recepção): em andamento — metade da lista");
    expect(p).toContain("- Black Week em novembro");
  });

  it("sem dados do período anterior, não inventa comparação", () => {
    expect(p).toContain("As planilhas não têm dados de setembro");
    expect(p).not.toContain("(novo)");
    expect(p).not.toContain("| anterior");
  });

  it("com período anterior, compara cada número", () => {
    const set = { ...dados, vendas: dados.vendas!.map((v) => ({ ...v, data: v.data.replace("2026-10", "2026-09") })), despesas: dados.despesas!.map((d) => ({ ...d, dataPagamento: d.dataPagamento?.replace("2026-10", "2026-09") ?? null })) };
    const juntos = { ...dados, vendas: [...dados.vendas!, ...set.vendas], despesas: [...dados.despesas!, ...set.despesas] };
    const q = montarPacote({ ...base, indicadores: calcularIndicadores(juntos, OUTUBRO), anterior: calcularIndicadores(juntos, { inicio: "2026-09-01", fim: "2026-09-30" }) });
    expect(q).toContain("Comparação: setembro.");
    expect(q).toContain("- Faturamento: R$ 117.650,00 | anterior R$ 117.650,00 (0,0%)");
    expect(q).toContain("| Categoria | Valor | Anterior | Variação |");
  });

  it("não leva nomes de pacientes nem descrições de lançamentos", () => {
    expect(p).not.toMatch(/Paciente \d{3}/);
    expect(p).not.toContain("COLABORADORA");
  });

  it("troca nomes dos profissionais por apelidos e desfaz na resposta", () => {
    const ap = apelidosProfissionais(indicadores, anterior);
    const anon = montarPacote(base, { anonimizar: true });
    expect(anon).toContain("Profissional 1");
    for (const nome of ap.keys()) expect(anon).not.toContain(nome);
    const r = lerResposta("### OBSERVAÇÃO\nO Profissional 1 concentrou 90% do faturamento.", { apelidos: ap });
    expect(r.secoes.observacao).toContain([...ap.keys()][0]);
  });
});

describe("leitura da resposta do Claude", () => {
  let n = 0;
  const gerarId = () => `id${++n}`;
  const resposta = `Aqui está:

### OBSERVAÇÃO
Fala, Drs.! Segue o fechamento.

Segundo parágrafo.

## Principais destaques
- Plano de Acompanhamento: R$ 28.200.

**INDICADORES COMERCIAIS**
- Leads: 100.

### Pontos de atenção
- Ticket: queda de 23%.

### PLANO DE AÇÃO
1. **Follow-up dos orçamentos**
Responsável: Recepção + Gestfy
Prazo: 20/11/2026
Ação: Ligar para os 3 orçamentos em aberto.
Como medir: conversão acima de 70%

2. Black Week
- Responsáveis: Marketing, Dra. Bia
- Prazo: sem prazo
- Ação: Preparar campanha.`;
  const r = lerResposta(resposta, { gerarId });

  it("separa as 4 seções com títulos em formatos variados", () => {
    expect(r.secoes.observacao).toBe("Fala, Drs.! Segue o fechamento.\n\nSegundo parágrafo.");
    expect(r.secoes.destaques).toBe("- Plano de Acompanhamento: R$ 28.200.");
    expect(r.secoes.comercial).toBe("- Leads: 100.");
    expect(r.secoes.atencao).toBe("- Ticket: queda de 23%.");
    expect(r.avisos).toEqual([]);
  });

  it("lê o plano de ação com responsáveis, prazo e indicador", () => {
    expect(r.acoes).toEqual([
      { id: "id1", titulo: "Follow-up dos orçamentos", descricao: "Ligar para os 3 orçamentos em aberto.", responsaveis: ["Recepção", "Gestfy"], prazo: "2026-11-20", indicador: "conversão acima de 70%" },
      { id: "id2", titulo: "Black Week", descricao: "Preparar campanha.", responsaveis: ["Marketing", "Dra. Bia"], prazo: null, indicador: "" },
    ]);
  });

  it("sem títulos: tudo na observação, com aviso", () => {
    const s = lerResposta("Texto livre sem formato.");
    expect(s.secoes.observacao).toBe("Texto livre sem formato.");
    expect(s.avisos[0]).toContain("Não encontrei os títulos");
  });
});

describe("ficha da clínica", () => {
  it("pedido traz os títulos e a resposta preenche a ficha", () => {
    expect(pedidoFicha("Claros Clinic")).toContain("### PESSOAS E PAPÉIS");
    const { ficha, achados } = lerFichaGerada(`### CIDADE/UF
Goiânia/GO
### SEGMENTO
Clínica médica
### MODELO DE NEGÓCIO (particular, convênio ou misto)
Particular
### PERFIL E POSICIONAMENTO
- Emagrecimento e saúde da mulher
### ASSUNTOS A EVITAR
não informado`, fichaVazia());
    expect(achados).toBe(4);
    expect(ficha).toMatchObject({ cidade: "Goiânia", uf: "GO", segmento: "Clínica médica", modelo: "particular", perfil: "- Emagrecimento e saúde da mulher", evitar: "" });
  });
});
