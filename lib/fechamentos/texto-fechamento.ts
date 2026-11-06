/**
 * Texto do fechamento, sem IA.
 *
 * `rascunho` monta um primeiro texto no formato dos reports Gestfy a partir
 * dos indicadores (comparando com o período anterior). O consultor edita à
 * vontade; todos os números vêm do motor. `textoWhatsApp` junta cabeçalho,
 * seções e plano de ação no formato enviado hoje aos clientes.
 */
import type { Alerta } from "./conferencia";
import type { Decisoes } from "./decisoes";
import type { Indicadores } from "./indicadores";

export interface SecoesTexto {
  observacao: string;
  destaques: string;
  comercial: string;
  atencao: string;
}

export interface TextoFechamento extends SecoesTexto {
  /** O que as planilhas não mostram (ausências, campanhas, pedidos do cliente). */
  contexto: string;
}

export interface Acao {
  id: string;
  titulo: string;
  descricao: string;
  responsaveis: string[];
  /** AAAA-MM-DD */
  prazo: string | null;
  /** Como saber se funcionou. */
  indicador: string;
}

export type StatusAcompanhamento = "concluida" | "andamento" | "nao_feita";

export interface Acompanhamento {
  id: string;
  titulo: string;
  responsaveis: string[];
  status: StatusAcompanhamento | null;
  nota: string;
}

export function textoVazio(): TextoFechamento {
  return { contexto: "", observacao: "", destaques: "", comercial: "", atencao: "" };
}

/* ---------- formatos ---------- */

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const nomeDoMes = (iso: string) => MESES[Number(iso.slice(5, 7)) - 1];
export const brl = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number, casas = 1) => `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
const sinal = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${pct(Math.abs(v))}`;
const variacao = (a?: number | null, b?: number | null) => (a == null || !b ? null : a / b - 1);

export interface ContextoTexto {
  clinica: string;
  tipo: "mensal" | "quinzenal";
  indicadores: Indicadores;
  anterior: Indicadores;
  alertas: Alerta[];
  decisoes: Decisoes;
}

function rotuloPeriodo(c: ContextoTexto): { atual: string; anterior: string } {
  if (c.tipo === "mensal") return { atual: nomeDoMes(c.indicadores.periodo.inicio), anterior: nomeDoMes(c.anterior.periodo.inicio) };
  return { atual: "esta quinzena", anterior: "a mesma quinzena do mês anterior" };
}

/** Decisão "citar no texto" tomada num alerta da regra informada. */
function citar(c: ContextoTexto, regra: string): Alerta | undefined {
  const aplicados = new Set(c.decisoes.registro.filter((d) => d.acao === "aplicar").map((d) => d.chave));
  return c.alertas.find((a) => a.regra === regra && aplicados.has(a.chave));
}

/* ---------- rascunho ---------- */

export function rascunho(c: ContextoTexto): SecoesTexto {
  const i = c.indicadores, a = c.anterior;
  const per = rotuloPeriodo(c);
  const fat = i.faturamento?.total ?? 0, fatA = a.faturamento?.total ?? 0;
  const vFat = variacao(fat, fatA);

  /* Observação */
  const obs: string[] = [];
  obs.push(`Fala, Drs.! Segue o fechamento ${c.tipo === "mensal" ? "mensal" : "quinzenal"} de ${per.atual} da ${c.clinica}.`);
  if (vFat !== null) {
    const bom = vFat >= 0 && (!i.meta || i.meta.atingimento >= 1);
    let p = `${bom ? "Tivemos um bom resultado" : "Tivemos um período de atenção"}. O faturamento ${vFat >= 0 ? "cresceu" : "caiu"} de ${brl(fatA)} em ${per.anterior} para ${brl(fat)} em ${per.atual}, ${vFat >= 0 ? "um crescimento" : "uma redução"} de ${pct(Math.abs(vFat))}.`;
    if (i.meta) p += i.meta.atingimento >= 1 ? ` Superamos a meta de ${brl(i.meta.valor)}, com ${pct(i.meta.atingimento)} de atingimento.` : ` Atingimos ${pct(i.meta.atingimento)} da meta de ${brl(i.meta.valor)}, ficando ${brl(i.meta.falta)} abaixo do objetivo.`;
    obs.push(p);
  } else {
    obs.push(`O faturamento foi de ${brl(fat)}${i.meta ? `, ${pct(i.meta.atingimento)} da meta de ${brl(i.meta.valor)}` : ""}.`);
  }
  const vPac = variacao(i.pacientes?.atendidos, a.pacientes?.atendidos);
  const vTk = variacao(i.pacientes?.ticketMedio, a.pacientes?.ticketMedio);
  if (vPac !== null && vTk !== null && i.pacientes && a.pacientes) {
    if (Math.abs(vPac) < 0.05 && Math.abs(vTk) >= 0.05) {
      obs.push(`O volume de pacientes praticamente se manteve, passando de ${a.pacientes.atendidos} para ${i.pacientes.atendidos}. Já o ticket médio ${vTk < 0 ? "caiu" : "subiu"} ${pct(Math.abs(vTk))}. Ou seja, a variação do faturamento veio do valor médio dos atendimentos, e não da quantidade de pacientes.`);
    } else {
      obs.push(`Atendemos ${i.pacientes.atendidos} pacientes (${sinal(vPac)} em relação a ${per.anterior}), com ticket médio de ${brl(i.pacientes.ticketMedio)} (${sinal(vTk)}).`);
    }
  }
  if (i.despesas) {
    const vD = variacao(i.despesas.total, a.despesas?.total);
    let p = `No caixa, pagamos ${brl(i.despesas.total)} em despesas${vD !== null ? `, contra ${brl(a.despesas!.total)} em ${per.anterior}` : ""}, e o resultado de caixa foi de ${brl(i.caixa?.resultado ?? 0)}.`;
    const pontuais = citar(c, "pagamentos-pontuais");
    if (pontuais?.total) p += ` Parte desse valor veio de pagamentos pontuais, que somaram ${brl(pontuais.total)}. Portanto, esse aumento não representa uma elevação dos custos mensais.`;
    obs.push(p);
  }

  /* Destaques */
  const dest: string[] = [];
  const grupos = i.faturamento?.porGrupo ?? [];
  const antes = new Map((a.faturamento?.porGrupo ?? []).map((g) => [g.nome.toLowerCase(), g.valor]));
  if (grupos[0]) dest.push(`- ${grupos[0].nome}: principal categoria, com ${brl(grupos[0].valor)} (${pct(grupos[0].pct)} do faturamento).`);
  const mudancas = grupos
    .map((g) => ({ g, ant: antes.get(g.nome.toLowerCase()) ?? 0 }))
    .filter((x) => x.ant > 0 && x.g !== grupos[0])
    .sort((x, y) => Math.abs(y.g.valor - y.ant) - Math.abs(x.g.valor - x.ant))
    .slice(0, 3);
  for (const { g, ant } of mudancas) dest.push(`- ${g.nome}: ${g.valor >= ant ? "passou" : "caiu"} de ${brl(ant)} para ${brl(g.valor)} (${sinal(g.valor / ant - 1)}).`);
  const prof = i.faturamento?.porProfissional[0];
  if (prof && prof.pct > 0.6) dest.push(`- ${prof.nome} respondeu por ${pct(prof.pct)} do faturamento.`);

  /* Comercial */
  const com: string[] = [];
  if (i.leads) {
    const ant = a.leads && a.leads.total ? ` Em ${per.anterior}, foram ${a.leads.total} leads e ${a.leads.agendados} agendamentos.` : "";
    com.push(`- Leads e agendamentos: ${i.leads.total} leads e ${i.leads.agendados} agendamentos, conversão de ${pct(i.leads.conversao ?? 0, 0)}.${ant}`);
    const sem = i.leads.porOrigem.find((o) => o.nome === "Não informado")?.quantidade ?? 0;
    const top = i.leads.porOrigem.find((o) => o.nome !== "Não informado");
    if (top) com.push(`- Origem: ${top.quantidade} dos ${i.leads.total} leads vieram de ${top.nome}${sem ? `; ${sem} sem origem informada` : ""}.`);
  }
  if (i.orcamentos && i.orcamentos.total) {
    const vA = a.orcamentos?.conversaoValor;
    com.push(`- Orçamentos: ${brl(i.orcamentos.valorGerado)} prescritos e ${brl(i.orcamentos.valorFechado)} fechados, conversão de ${pct(i.orcamentos.conversaoValor ?? 0, 0)} em valor${vA != null ? ` (${pct(vA, 0)} em ${per.anterior})` : ""}.${i.orcamentos.valorEmAberto ? ` Seguem ${brl(i.orcamentos.valorEmAberto)} em negociação.` : ""}`);
  }
  if (i.nps && i.nps.respostas) {
    com.push(`- Experiência do paciente: NPS ${i.nps.nps} com ${i.nps.respostas} respostas${i.google?.avaliacoes ? ` e ${i.google.avaliacoes} avaliações no Google, nota ${i.google.nota?.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}` : ""}.`);
  }

  /* Pontos de atenção */
  const at: string[] = [];
  if (vTk !== null && vTk <= -0.1) at.push(`- Ticket médio: queda de ${pct(Math.abs(vTk))}, de ${brl(a.pacientes!.ticketMedio)} para ${brl(i.pacientes!.ticketMedio)}.`);
  if (i.meta && i.meta.atingimento < 0.9) at.push(`- Meta: ${pct(i.meta.atingimento)} de atingimento, ${brl(i.meta.falta)} abaixo.`);
  const vConv = i.orcamentos?.conversaoValor != null && a.orcamentos?.conversaoValor != null ? i.orcamentos.conversaoValor - a.orcamentos.conversaoValor : null;
  if (vConv !== null && vConv <= -0.05) at.push(`- Conversão de orçamentos: caiu de ${pct(a.orcamentos!.conversaoValor!, 0)} para ${pct(i.orcamentos!.conversaoValor!, 0)} em valor.`);
  if (prof && prof.pct > 0.6) at.push(`- Concentração de receita: ${prof.nome} ainda responde por ${pct(prof.pct)} do faturamento.`);
  const semOrigem = citar(c, "leads-sem-origem");
  if (semOrigem) at.push(`- Origem dos leads: ${semOrigem.titulo.charAt(0).toLowerCase()}${semOrigem.titulo.slice(1)}, o que impede medir o retorno das campanhas.`);

  return { observacao: obs.join("\n\n"), destaques: dest.join("\n"), comercial: com.join("\n"), atencao: at.join("\n") };
}

/* ---------- WhatsApp ---------- */

export function textoWhatsApp(p: {
  clinica: string;
  tipo: "mensal" | "quinzenal";
  periodoNome: string;
  indicadores: Indicadores;
  anterior: Indicadores;
  texto: TextoFechamento;
  acoes: Acao[];
}): string {
  const i = p.indicadores, a = p.anterior;
  const per = p.tipo === "mensal" ? nomeDoMes(a.periodo.inicio) : "quinzena anterior";
  const vFat = variacao(i.faturamento?.total, a.faturamento?.total);
  const vTk = variacao(i.pacientes?.ticketMedio, a.pacientes?.ticketMedio);
  const titulo = p.periodoNome.charAt(0).toUpperCase() + p.periodoNome.slice(1);
  const linhas: string[] = [];
  linhas.push(`Relatório ${p.tipo === "mensal" ? "Mensal" : "Quinzenal"} de Resultados - ${titulo} (${p.clinica})`, "");
  linhas.push("💰 Faturamento:");
  linhas.push(`Total da clínica: ${brl(i.faturamento?.total ?? 0)}${vFat !== null ? ` (${sinal(vFat)} vs. ${per}/${brl(a.faturamento!.total)})` : ""}`);
  if (i.pacientes) linhas.push(`📊 Ticket médio: ${brl(i.pacientes.ticketMedio)}${vTk !== null ? ` (${sinal(vTk)} vs. ${per})` : ""}`);
  if (i.meta) linhas.push(`🎯 Meta: ${brl(i.meta.valor)} | Atingimento: ${pct(i.meta.atingimento)}`);
  linhas.push("");
  if (i.despesas) linhas.push(`💳 Saídas no período: ${brl(i.despesas.total)}`);
  if (i.caixa) linhas.push(`💵 Saldo de caixa no período: ${brl(i.caixa.resultado)}`);
  const secao = (rotulo: string, corpo: string) => { if (corpo.trim()) linhas.push("", rotulo, "", corpo.trim()); };
  secao("Observação:", p.texto.observacao);
  secao("✅ Principais destaques:", p.texto.destaques);
  secao("🔎 Indicadores Comerciais", p.texto.comercial);
  secao("⚠️ Pontos de Atenção", p.texto.atencao);
  const acoes = p.acoes.filter((x) => x.titulo.trim());
  if (acoes.length) {
    linhas.push("", `🎯 Plano de Ação`, "");
    acoes.forEach((x, n) => {
      linhas.push(`${n + 1}. ${x.titulo.trim()}`);
      linhas.push(`- Responsável: ${x.responsaveis.join(" + ") || "a definir"}${x.prazo ? ` · até ${x.prazo.slice(8, 10)}/${x.prazo.slice(5, 7)}` : ""}`);
      if (x.descricao.trim()) linhas.push(`> Ação: ${x.descricao.trim()}`);
      linhas.push("");
    });
  }
  return linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
