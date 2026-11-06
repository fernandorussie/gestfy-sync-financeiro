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
import type { Ritmo } from "./ritmo";

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
  /** Quinzenal: ritmo e projeção do mês. */
  ritmo?: Ritmo | null;
}

/** Formas do nome do período para encaixar nas frases ("em outubro", "na 1ª quinzena de outubro"). */
interface Rotulo { nome: string; em: string; de: string; a: string; sujeito: string }
export function rotulo(tipo: "mensal" | "quinzenal", inicio: string): Rotulo {
  const mes = nomeDoMes(inicio);
  if (tipo === "mensal") return { nome: mes, em: `em ${mes}`, de: `de ${mes}`, a: `a ${mes}`, sujeito: mes };
  const q = `1ª quinzena de ${mes}`;
  return { nome: q, em: `na ${q}`, de: `da ${q}`, a: `à ${q}`, sujeito: "a quinzena" };
}
function rotuloPeriodo(c: ContextoTexto): { A: Rotulo; P: Rotulo } {
  return { A: rotulo(c.tipo, c.indicadores.periodo.inicio), P: rotulo(c.tipo, c.anterior.periodo.inicio) };
}

/** Decisão "citar no texto" tomada num alerta da regra informada. */
export function citar(c: Pick<ContextoTexto, "alertas" | "decisoes">, regra: string): Alerta | undefined {
  const aplicados = new Set(c.decisoes.registro.filter((d) => d.acao === "aplicar").map((d) => d.chave));
  return c.alertas.find((a) => a.regra === regra && aplicados.has(a.chave));
}

/* ---------- rascunho ---------- */

const mil = (v: number) => `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
const lista = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`);
const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Do que eram os pagamentos pontuais, sem citar nomes de pessoas. */
export function naturezaPontuais(al: Alerta): string[] {
  const tipos: string[] = [];
  const add = (t: string) => { if (!tipos.includes(t)) tipos.push(t); };
  for (const e of al.evidencias) {
    const t = e.texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
    const imposto = t.match(/\b(IRPJ|CSLL|PIS|COFINS|ISS|IPTU|IPVA|SIMPLES|DAS)\b/);
    if (/RESCIS|RECIS|FGTS|INSS|AVISO|MULTA/.test(t)) add("despesas relacionadas a desligamento de colaborador");
    else if (/13|DECIMO/.test(t)) add("13º salário");
    else if (imposto) add(imposto[1]);
    else add("outros pagamentos não recorrentes");
  }
  // Impostos primeiro, como nos reports.
  return tipos.sort((x, y) => Number(x.includes(" ")) - Number(y.includes(" ")));
}

export function rascunho(c: ContextoTexto): SecoesTexto {
  const i = c.indicadores, a = c.anterior;
  const { A, P } = rotuloPeriodo(c);
  const r = c.tipo === "quinzenal" ? c.ritmo ?? null : null;
  const fat = i.faturamento?.total ?? 0, fatA = a.faturamento?.total ?? 0;
  const vFat = variacao(fat, fatA);
  const temAnterior = fatA > 0;

  /* Observação */
  const obs: string[] = [];
  obs.push(`Fala, Drs.! Segue o ${c.tipo === "mensal" ? "fechamento mensal" : "parcial"} ${A.de} da ${c.clinica}.`);
  if (vFat !== null) {
    const ating = r ? r.atingimentoProjetado : i.meta?.atingimento ?? null;
    const abertura = vFat <= -0.05 || (ating !== null && ating < 0.9) ? "Tivemos um período de atenção" : vFat >= 0.05 ? "Tivemos um bom período" : "Tivemos um período estável";
    let p = `${abertura}. O faturamento ${vFat >= 0 ? "cresceu" : "caiu"} de ${brl(fatA)} ${P.em} para ${brl(fat)} ${A.em}, ${vFat >= 0 ? "um crescimento" : "uma redução"} de ${pct(Math.abs(vFat))}.`;
    if (i.meta && !r) p += i.meta.atingimento >= 1 ? ` Superamos a meta de ${brl(i.meta.valor)}, com ${pct(i.meta.atingimento)} de atingimento.` : ` Atingimos ${pct(i.meta.atingimento)} da meta de ${brl(i.meta.valor)}, ficando ${brl(i.meta.falta)} abaixo do objetivo.`;
    obs.push(p);
  } else {
    obs.push(`O faturamento foi de ${brl(fat)}${i.meta && !r ? `, ${pct(i.meta.atingimento)} da meta de ${brl(i.meta.valor)}` : ""}.`);
  }
  const vPac = variacao(i.pacientes?.atendidos, a.pacientes?.atendidos);
  const vTk = variacao(i.pacientes?.ticketMedio, a.pacientes?.ticketMedio);
  const volumeEstavel = vPac !== null && Math.abs(vPac) < 0.05;
  if (vPac !== null && vTk !== null && i.pacientes && a.pacientes) {
    if (volumeEstavel && Math.abs(vTk) >= 0.05) {
      obs.push(`O principal ponto é que o volume de pacientes ${a.pacientes.atendidos === i.pacientes.atendidos ? `se manteve em ${i.pacientes.atendidos}` : `praticamente se manteve, passando de ${a.pacientes.atendidos} ${P.em} para ${i.pacientes.atendidos} ${A.em}`}. Entretanto, o ticket médio ${vTk < 0 ? "caiu" : "subiu"} ${pct(Math.abs(vTk))}. Ou seja, ${vFat !== null && vFat < 0 ? "a queda" : "a variação"} do faturamento esteve muito mais relacionada ao valor médio dos atendimentos do que à quantidade de pacientes.`);
    } else {
      obs.push(`Atendemos ${i.pacientes.atendidos} pacientes, contra ${a.pacientes.atendidos} ${P.em} (${sinal(vPac)}), com ticket médio de ${brl(i.pacientes.ticketMedio)} (${sinal(vTk)}).`);
    }
  }
  if (r) {
    let p = `No ritmo atual, de ${brl(r.faturamentoPorDia)} por dia útil (${r.diasUteisDecorridos} de ${r.diasUteisMes} dias úteis), a projeção para o mês é de ${brl(r.projecaoMes)}`;
    if (r.meta && r.atingimentoProjetado !== null) {
      p += `, ${pct(r.atingimentoProjetado)} da meta de ${brl(r.meta)}.`;
      if (r.faltaMeta && r.necessarioPorDia) p += ` Para bater a meta, faltam ${brl(r.faltaMeta)}: ${brl(r.necessarioPorDia)} por dia útil nos ${r.diasUteisRestantes} dias úteis restantes.`;
      else if (!r.faltaMeta) p += " A meta do mês já foi atingida.";
    } else p += ".";
    obs.push(p);
  }
  if (i.despesas && r) {
    let p = `Até aqui, pagamos ${brl(r.despesasPagas)} em despesas.`;
    if (r.mediaDespesas !== null) p += ` Considerando a média de ${brl(r.mediaDespesas)} dos últimos ${r.mesesMedia.length === 1 ? "mês" : `${r.mesesMedia.length} meses`}, ainda devem sair cerca de ${brl(r.provisionado ?? 0)} até o fim do mês${r.saldoProjetado !== null ? `, o que deixa um saldo projetado de ${brl(r.saldoProjetado)}` : ""}.`;
    obs.push(p);
  } else if (i.despesas) {
    const pontuais = citar(c, "pagamentos-pontuais");
    let p = `${pontuais ? "Outro ponto importante foi o caixa. " : ""}Tivemos ${brl(i.despesas.total)} em despesas pagas${temAnterior && a.despesas ? `, contra ${brl(a.despesas.total)} ${P.em}` : ""}, e o resultado de caixa foi de ${brl(i.caixa?.resultado ?? 0)}.`;
    if (pontuais?.total) {
      const nat = naturezaPontuais(pontuais);
      p += ` Porém, ${A.sujeito} concentrou pagamentos de ${lista(nat)}, que somaram aproximadamente ${mil(pontuais.total)}. Portanto, esse aumento não representa uma elevação dos custos mensais.`;
    }
    obs.push(p);
  }

  /* Destaques */
  const dest: string[] = [];
  const grupos = i.faturamento?.porGrupo ?? [];
  const antes = new Map((a.faturamento?.porGrupo ?? []).map((g) => [g.nome.toLowerCase(), g.valor]));
  const ant = (nome: string) => antes.get(nome.toLowerCase()) ?? 0;
  const top = [...grupos].sort((x, y) => y.valor - x.valor)[0];
  if (top) {
    const v = variacao(top.valor, ant(top.nome));
    dest.push(`- ${top.nome}: foi a principal categoria ${A.de}, com ${brl(top.valor)}${v !== null && temAnterior ? `, ${v >= 0 ? "crescimento" : "queda"} de ${pct(Math.abs(v))} em relação ${P.a}` : ` (${pct(top.pct)} do faturamento)`}.`);
  }
  if (temAnterior) {
    const relevante = Math.max(2000, fatA * 0.02);
    const todos = [...new Set([...grupos.map((g) => g.nome), ...(a.faturamento?.porGrupo ?? []).map((g) => g.nome)])]
      .map((nome) => ({ nome, atual: grupos.find((g) => g.nome.toLowerCase() === nome.toLowerCase())?.valor ?? 0, antes: ant(nome) }))
      .filter((x) => x.nome !== top?.nome && x.antes > 0 && Math.abs(x.atual - x.antes) >= relevante);
    const quedas = todos.filter((x) => x.atual < x.antes).sort((x, y) => (x.atual - x.antes) - (y.atual - y.antes)).slice(0, 2);
    const altas = todos.filter((x) => x.atual > x.antes).sort((x, y) => (y.atual - y.antes) - (x.atual - x.antes)).slice(0, 2);
    quedas.forEach((x, n) => {
      let l = `- ${x.nome}: caiu de ${brl(x.antes)} para ${brl(x.atual)} (${sinal(x.atual / x.antes - 1)}).`;
      if (n === 0) l += ` Foi uma das principais reduções de faturamento do período.`;
      if (n === 1) l += ` Somando ${quedas[0].nome} e ${x.nome}, tivemos ${brl(quedas.reduce((s, q) => s + (q.antes - q.atual), 0))} a menos em faturamento.`;
      dest.push(l);
    });
    for (const x of altas) dest.push(`- ${x.nome}: gerou ${brl(x.atual)}, crescimento de ${pct(x.atual / x.antes - 1)} em relação ${P.a}.`);
  }
  const prof = i.faturamento?.porProfissional.find((p) => p.nome !== "Não informado");
  if (prof && prof.pct > 0.6) {
    const profA = a.faturamento?.porProfissional.find((p) => p.nome.toLowerCase() === prof.nome.toLowerCase());
    const demais = fat - prof.valor, demaisA = profA ? fatA - profA.valor : 0;
    if (profA && temAnterior && profA.pct - prof.pct >= 0.02 && demais > demaisA) {
      dest.push(`- Demais profissionais: aumentaram sua participação no faturamento. A dependência de ${prof.nome} caiu de ${pct(profA.pct, 0)} para ${pct(prof.pct)}, enquanto a receita dos demais profissionais cresceu de ${brl(demaisA)} para ${brl(demais)}.`);
    }
  }

  /* Comercial */
  const com: string[] = [];
  if (i.leads) {
    let l = `- Leads e agendamentos: tivemos ${i.leads.total} leads e ${i.leads.agendados} agendamentos, com conversão de ${pct(i.leads.conversao ?? 0, 0)}.`;
    if (a.leads && a.leads.total) {
      l += ` ${capital(P.em)}, foram ${a.leads.total} leads e ${a.leads.agendados} agendamentos.`;
      if (i.leads.agendados > a.leads.agendados && vFat !== null && vFat < 0) l += " Ou seja, o volume de oportunidades e agendamentos cresceu, mas ainda não conseguimos transformar essa evolução em mais faturamento.";
    }
    com.push(l);
  }
  if (i.orcamentos && i.orcamentos.total) {
    const cA = a.orcamentos?.conversaoValor;
    const cI = i.orcamentos.conversaoValor ?? 0;
    com.push(`- Orçamentos: foram ${brl(i.orcamentos.valorGerado)} prescritos e ${brl(i.orcamentos.valorFechado)} em vendas registradas, com conversão de ${pct(cI, 0)} em valor${cA != null && a.orcamentos?.total ? `, ${cI < cA ? "abaixo" : "acima"} dos ${pct(cA)} ${P.de}` : ""}.${i.orcamentos.valorEmAberto ? ` Temos ${brl(i.orcamentos.valorEmAberto)} em propostas classificadas como em negociação.` : ""}`);
  }
  if (i.leads && i.leads.total) {
    const origens = i.leads.porOrigem.filter((o) => o.nome !== "Não informado");
    const principal = origens[0];
    const busca = origens.filter((o) => o !== principal && /google|site/i.test(o.nome)).reduce((s, o) => s + o.quantidade, 0);
    const sem = i.leads.porOrigem.find((o) => o.nome === "Não informado")?.quantidade ?? 0;
    if (principal) {
      com.push(`- Marketing: dos ${i.leads.total} leads, ${principal.quantidade} foram registrados como vindos de ${principal.nome}${busca ? `, além de ${busca} identificados como Google/Site` : ""}.${sem ? ` Outros ${sem} estão sem origem informada.` : ""} Ainda precisamos acompanhar quais campanhas estão gerando agendamentos e vendas.`);
    }
  }
  if (i.nps && i.nps.respostas) {
    const g = i.google?.avaliacoes ? ` e ${i.google.avaliacoes} avaliações no Google${i.google.nota === 5 ? ", todas com 5 estrelas" : `, nota média ${i.google.nota?.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`}` : "";
    const positivo = (i.nps.nps ?? 0) >= 75;
    com.push(`- Experiência do paciente: ${positivo ? "mantivemos uma avaliação positiva, com " : ""}NPS de ${i.nps.nps} em ${i.nps.respostas} respostas${g}.`);
  }

  /* Pontos de atenção */
  const at: string[] = [];
  if (vTk !== null && vTk <= -0.1) at.push(`- Faturamento e ticket: a queda de ${pct(Math.abs(vTk))} no ticket médio impactou diretamente a receita${volumeEstavel ? ", mesmo com praticamente o mesmo volume de pacientes atendidos" : ""}.`);
  const vVend = variacao(i.orcamentos?.valorFechado, a.orcamentos?.valorFechado);
  if (vVend !== null && vVend <= -0.15) at.push(`- Conversão de orçamentos: o valor vendido caiu de ${brl(a.orcamentos!.valorFechado)} para ${brl(i.orcamentos!.valorFechado)}, redução de ${pct(Math.abs(vVend))}.`);
  if (r?.meta && r.atingimentoProjetado !== null && r.atingimentoProjetado < 0.95) at.push(`- Meta do mês: no ritmo atual, a projeção é de ${pct(r.atingimentoProjetado)} da meta. Precisamos de ${brl(r.necessarioPorDia ?? 0)} por dia útil até o fim do mês.`);
  if (!r && i.meta && i.meta.atingimento < 0.9 && vFat === null) at.push(`- Meta: ${pct(i.meta.atingimento)} de atingimento, ${brl(i.meta.falta)} abaixo.`);
  if (prof && prof.pct > 0.6) at.push(`- Concentração de receita: ${dest.some((d) => d.startsWith("- Demais profissionais")) ? "apesar da evolução dos demais profissionais, " : ""}${prof.nome} ainda representa ${pct(prof.pct)} do faturamento total.`);
  const semOrigem = citar(c, "leads-sem-origem");
  if (semOrigem) at.push(`- Origem dos leads: ${semOrigem.titulo.charAt(0).toLowerCase()}${semOrigem.titulo.slice(1)}, o que impede medir o retorno das campanhas.`);

  return { observacao: obs.join("\n\n"), destaques: dest.join("\n"), comercial: com.join("\n"), atencao: at.map(capital).join("\n") };
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
  ritmo?: Ritmo | null;
  /** Seções desligadas na estrutura do relatório (ex.: "caixaMes" tira a linha do valor a pagar). */
  ocultas?: string[];
}): string {
  const i = p.indicadores, a = p.anterior;
  const r = p.tipo === "quinzenal" ? p.ritmo ?? null : null;
  const per = rotulo(p.tipo, a.periodo.inicio).nome;
  const vFat = variacao(i.faturamento?.total, a.faturamento?.total);
  const vTk = variacao(i.pacientes?.ticketMedio, a.pacientes?.ticketMedio);
  const titulo = p.periodoNome.charAt(0).toUpperCase() + p.periodoNome.slice(1);
  const linhas: string[] = [];
  linhas.push(`Relatório ${p.tipo === "mensal" ? "Mensal" : "Quinzenal"} de Resultados - ${titulo} (${p.clinica})`, "");
  linhas.push("💰 Faturamento:");
  linhas.push(`${r ? "Até o dia 15" : "Total da clínica"}: ${brl(i.faturamento?.total ?? 0)}${vFat !== null ? ` (${sinal(vFat)} vs. ${per}/${brl(a.faturamento!.total)})` : ""}`);
  if (i.pacientes) linhas.push(`📊 Ticket médio: ${brl(i.pacientes.ticketMedio)}${vTk !== null ? ` (${sinal(vTk)} vs. ${per})` : ""}`);
  if (r) {
    linhas.push(`📈 Projeção do mês: ${brl(r.projecaoMes)} (${brl(r.faturamentoPorDia)} por dia útil)`);
    if (r.meta) linhas.push(`🎯 Meta: ${brl(r.meta)} | Projeção: ${pct(r.atingimentoProjetado ?? 0)}`);
  } else if (i.meta) linhas.push(`🎯 Meta: ${brl(i.meta.valor)} | Atingimento: ${pct(i.meta.atingimento)}`);
  linhas.push("");
  if (i.despesas) linhas.push(`💳 Saídas ${r ? "pagas até o dia 15" : "no período"}: ${brl(i.despesas.total)}`);
  if (r && r.provisionado !== null && !p.ocultas?.includes("caixaMes")) linhas.push(`🧾 A pagar até o fim do mês (pela média de ${r.mesesMedia.length === 1 ? "1 mês" : `${r.mesesMedia.length} meses`}): ${brl(r.provisionado)}`);
  if (i.caixa) linhas.push(`💵 Saldo de caixa no período: ${brl(i.caixa.resultado)}`);
  const secao = (rotuloSecao: string, corpo: string) => { if (corpo.trim()) linhas.push("", rotuloSecao, "", corpo.trim()); };
  secao("Observação:", p.texto.observacao);
  secao("✅ Principais destaques:", p.texto.destaques);
  secao("🔎 Indicadores Comerciais", p.texto.comercial);
  secao("⚠️ Pontos de Atenção", p.texto.atencao);
  const acoes = p.acoes.filter((x) => x.titulo.trim());
  if (acoes.length) {
    const proximo = p.tipo === "mensal" ? ` para ${capital(MESES[(Number(i.periodo.inicio.slice(5, 7))) % 12])}` : " para a 2ª quinzena";
    linhas.push("", `🎯 Plano de Ação${proximo}`, "");
    acoes.forEach((x, n) => {
      linhas.push(`${n + 1}. ${x.titulo.trim()}`);
      linhas.push(`- Responsável: ${x.responsaveis.join(" + ") || "a definir"}${x.prazo ? ` · até ${x.prazo.slice(8, 10)}/${x.prazo.slice(5, 7)}` : ""}`);
      if (x.descricao.trim()) linhas.push(`> Ação: ${x.descricao.trim()}`);
      linhas.push("");
    });
  }
  return linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
