/**
 * Pacote para o Claude: o fechamento em texto, para colar no projeto do
 * cliente no claude.ai, e a leitura da resposta de volta para a aba Análise.
 *
 * Só vão números agregados: nenhum nome de paciente e nenhuma descrição de
 * lançamento. Os nomes dos profissionais podem ser trocados por apelidos
 * ("Profissional 1"), desfeitos na leitura da resposta.
 */
import type { Alerta } from "./conferencia";
import type { Decisoes } from "./decisoes";
import { fichaPreenchida, MODELOS, separarSecoes, type FichaClinica } from "./ficha";
import type { Indicadores } from "./indicadores";
import type { Ritmo } from "./ritmo";
import type { ResultadoPersonalizado } from "./fonte-personalizada";
import { formatarIndicador, variacaoIndicador } from "./formato-indicador";
import { NEUTRO, cap, type Vocabulario } from "./vocabulario";
import { citar, naturezaPontuais, nomeDoMes, rotulo, type Acao, type Acompanhamento, type SecoesTexto, type TextoFechamento } from "./texto-fechamento";

export interface DadosPacote {
  clinica: string;
  tipo: "mensal" | "quinzenal";
  indicadores: Indicadores;
  anterior: Indicadores;
  anual: { mes: string; entradas: number; saidasCaixa: number }[];
  ritmo: Ritmo | null;
  alertas: Alerta[];
  decisoes: Decisoes;
  texto: TextoFechamento;
  acoes: Acao[];
  acompanhamento: Acompanhamento[];
  ficha: FichaClinica | null;
  /** Palavras do cliente (paciente/cliente…). Sem informar: neutras. */
  vocab?: Vocabulario;
  /** Fontes personalizadas (contratos, cirurgias, recall…). */
  personalizadas?: ResultadoPersonalizado[];
}

const fmt = (v: number | null | undefined, casas = 2) => (v == null ? "—" : `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}`);
const pc = (v: number | null | undefined, casas = 1) => (v == null ? "—" : `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`);
const n = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR"));
function vari(a?: number | null, b?: number | null): string {
  if (a == null || b == null) return "";
  if (!b) return a ? " (novo)" : "";
  const v = a / b - 1;
  return ` (${v > 0 ? "+" : v < 0 ? "−" : ""}${pc(Math.abs(v))})`;
}
const chave = (s: string) => s.trim().toLowerCase();

/** Apelidos dos profissionais, na ordem de faturamento do período (determinístico). */
export function apelidosProfissionais(i: Indicadores, a: Indicadores): Map<string, string> {
  const nomes = [...(i.faturamento?.porProfissional ?? []), ...(a.faturamento?.porProfissional ?? [])]
    .map((p) => p.nome).filter((x) => x && x !== "Não informado");
  const m = new Map<string, string>();
  for (const x of nomes) if (!m.has(x)) m.set(x, `Profissional ${m.size + 1}`);
  return m;
}

const CONTEXTO_PROJETO = "- Use o que você sabe deste cliente neste projeto (histórico, particularidades, combinados) para explicar os números. Não invente números: use só os que estão aqui.";
const CONTEXTO_API = "- Use o perfil do cliente e as ações anteriores, abaixo, como contexto do cliente. Não invente números nem fatos: use só o que está aqui. Quando faltar contexto para explicar uma variação, descreva o que os números mostram sem supor a causa.";

const INSTRUCOES = `Você é o analista financeiro da Gestfy, consultoria de gestão. Escreva a análise do fechamento abaixo para enviar aos sócios do cliente por WhatsApp.

Como escrever:
{{CONTEXTO}}
- Vocabulário deste cliente: {{VOCAB}}. Não use termos de outro tipo de negócio.
- Tom: direto, próximo e consultivo, como a Gestfy escreve. Comece a observação com "{{SAUDACAO}}" (ou o tratamento que o cliente usa).
- Compare sempre com o período anterior e explique o porquê das variações (volume × ticket, categorias que subiram ou caíram, pagamentos pontuais).
- Destaques, comercial e pontos de atenção: um item por linha, começando com "- Tema: ...", sempre com número.
- Plano de ação: de 3 a 5 ações práticas para o próximo período, com responsáveis reais do cliente.

Responda SOMENTE no formato abaixo, mantendo os títulos exatamente assim (sem texto antes ou depois):

### OBSERVAÇÃO
(2 a 4 parágrafos)

### PRINCIPAIS DESTAQUES
- ...

### INDICADORES COMERCIAIS
- ...

### PONTOS DE ATENÇÃO
- ...

### PLANO DE AÇÃO
1. Título da ação
Responsável: Nome + Nome
Prazo: dd/mm/aaaa (ou "sem prazo")
Ação: o que fazer, em 1 ou 2 frases
Como medir: indicador que mostra se funcionou`;

/**
 * `destino`: "projeto" = para colar no projeto do cliente no claude.ai (o Claude
 * já conhece o histórico); "api" = geração dentro do app, só com a ficha.
 */
export function montarPacote(d: DadosPacote, opcoes: { anonimizar?: boolean; destino?: "projeto" | "api" } = {}): string {
  const i = d.indicadores, a = d.anterior;
  const apelidos = opcoes.anonimizar ? apelidosProfissionais(i, a) : new Map<string, string>();
  const prof = (nome: string) => apelidos.get(nome) ?? nome;
  const A = rotulo(d.tipo, i.periodo.inicio), P = rotulo(d.tipo, a.periodo.inicio);
  // Sem dados no período anterior, as comparações saem do pacote (evita "anterior R$ 0 (novo)").
  const temAnterior = !!(a.faturamento?.total || a.despesas?.total);
  const ant = (t: string) => (temAnterior ? t : "");
  const vr = (x?: number | null, y?: number | null) => (temAnterior ? vari(x, y) : "");
  const L: string[] = [];
  const sec = (t: string) => L.push("", `## ${t}`, "");

  const V = d.vocab ?? NEUTRO;
  const vocabTxt = `quem compra = "${V.clientes}", quem atende = "${V.profissionais}", o que é vendido = "${V.servicos}"`;
  L.push(INSTRUCOES.replace("{{CONTEXTO}}", opcoes.destino === "api" ? CONTEXTO_API : CONTEXTO_PROJETO).replace("{{VOCAB}}", vocabTxt).replace("{{SAUDACAO}}", V.saudacao), "", "---", "", `# Fechamento ${d.tipo === "mensal" ? "mensal" : "quinzenal (parcial do dia 1 ao 15)"} · ${d.clinica} · ${A.nome}/${i.periodo.inicio.slice(0, 4)}`);
  L.push(temAnterior
    ? `Comparação: ${P.nome}${d.tipo === "quinzenal" ? " (mesmo período do mês anterior)" : ""}. Valores em regime de caixa.`
    : `As planilhas não têm dados de ${P.nome}, então não há comparação com o período anterior. Valores em regime de caixa.`);

  if (d.ficha && fichaPreenchida(d.ficha)) {
    const f = d.ficha;
    sec("Perfil do cliente (registrado no GestfySync)");
    const item = (t: string, v: string) => { if (v.trim()) L.push(`**${t}:** ${v.trim()}`); };
    item("Local", [f.cidade, f.uf].filter(Boolean).join("/"));
    item("Segmento", f.segmento);
    item(cap(V.areas), f.especialidades);
    item("Modelo de negócio", f.modelo ? MODELOS[f.modelo] : "");
    item("Perfil", f.perfil);
    item("Prioridades do momento", f.prioridades);
    item("Pessoas e papéis", f.pessoas);
    item("Como escrever", f.estilo);
    item("Evitar", f.evitar);
  }

  sec("Resultado");
  L.push(`- Faturamento: ${fmt(i.faturamento?.total)}${ant(` | anterior ${fmt(a.faturamento?.total)}`)}${vr(i.faturamento?.total, a.faturamento?.total)}`);
  L.push(`- Despesas pagas: ${fmt(i.despesas?.total)}${ant(` | anterior ${fmt(a.despesas?.total)}`)}${vr(i.despesas?.total, a.despesas?.total)}`);
  L.push(`- Resultado de caixa: ${fmt(i.caixa?.resultado)}${ant(` | anterior ${fmt(a.caixa?.resultado)}`)}`);
  if (d.tipo === "mensal" && i.meta) L.push(`- Meta do mês: ${fmt(i.meta.valor)} | atingimento ${pc(i.meta.atingimento)} | faltaram ${fmt(i.meta.falta)}`);
  if (i.pacientes) {
    L.push(`- ${cap(V.clientes)} atendidos: ${n(i.pacientes.atendidos)}${ant(` | anterior ${n(a.pacientes?.atendidos)}`)}${vr(i.pacientes.atendidos, a.pacientes?.atendidos)}`);
    L.push(`- Ticket médio: ${fmt(i.pacientes.ticketMedio)}${ant(` | anterior ${fmt(a.pacientes?.ticketMedio)}`)}${vr(i.pacientes.ticketMedio, a.pacientes?.ticketMedio)}`);
    L.push(`- ${cap(V.clientes)} novos: ${n(i.pacientes.novos)}${ant(` | anterior ${n(a.pacientes?.novos)}`)} | ticket dos novos ${fmt(i.pacientes.ticketNovos)}`);
  }

  if (d.ritmo) {
    const r = d.ritmo;
    sec("Ritmo do mês (parcial)");
    L.push(`- Dias úteis: ${r.diasUteisDecorridos} de ${r.diasUteisMes} (restam ${r.diasUteisRestantes})`);
    L.push(`- Faturamento por dia útil: ${fmt(r.faturamentoPorDia)} | projeção do mês: ${fmt(r.projecaoMes)}`);
    if (r.meta) L.push(`- Meta do mês: ${fmt(r.meta)} | realizado ${pc(r.atingimento)} | projeção ${pc(r.atingimentoProjetado)} | necessário por dia útil: ${fmt(r.necessarioPorDia)}`);
    L.push(`- Despesas pagas até agora: ${fmt(r.despesasPagas)} | média mensal (${r.mesesMedia.length} meses): ${fmt(r.mediaDespesas)} | provisionado a pagar: ${fmt(r.provisionado)} | saldo projetado do mês: ${fmt(r.saldoProjetado)}`);
  }

  const gruposA = new Map((a.faturamento?.porGrupo ?? []).map((g) => [chave(g.nome), g]));
  const receitas = (i.faturamento?.porGrupo ?? []).filter((g) => g.valor || gruposA.get(chave(g.nome))?.valor);
  if (receitas.length) {
    sec("Receitas por categoria");
    L.push(temAnterior ? "| Categoria | Valor | Anterior | Variação | Qtd. | Ticket | % do fat. |" : "| Categoria | Valor | Qtd. | Ticket | % do fat. |", temAnterior ? "| --- | --- | --- | --- | --- | --- | --- |" : "| --- | --- | --- | --- | --- |");
    for (const g of [...receitas].sort((x, y) => y.valor - x.valor)) {
      const ga = gruposA.get(chave(g.nome));
      L.push(`| ${g.nome} | ${fmt(g.valor, 0)} | ${ant(`${fmt(ga?.valor ?? 0, 0)} | ${vari(g.valor, ga?.valor ?? 0).trim() || "—"} | `)}${g.quantidade} | ${g.valor ? fmt(g.ticket, 0) : "—"} | ${pc(g.pct)} |`);
    }
  }

  const profs = (i.faturamento?.porProfissional ?? []).filter((p) => p.nome !== "Não informado");
  if (profs.length) {
    const profA = new Map((a.faturamento?.porProfissional ?? []).map((p) => [chave(p.nome), p]));
    sec(`Faturamento por ${V.profissional}`);
    for (const p of profs.slice(0, 8)) L.push(`- ${prof(p.nome)}: ${fmt(p.valor, 0)} (${pc(p.pct)} do total)${ant(` | anterior ${fmt(profA.get(chave(p.nome))?.valor ?? 0, 0)} (${pc(profA.get(chave(p.nome))?.pct ?? 0)})`)}`);
  }

  if (i.despesas) {
    sec("Despesas por grupo");
    const despA = new Map((a.despesas?.porGrupo ?? []).map((g) => [chave(g.nome), g]));
    for (const g of i.despesas.porGrupo.filter((x) => x.valor || despA.get(chave(x.nome))?.valor)) {
      L.push(`- ${g.nome}: ${fmt(g.valor, 0)}${ant(` | anterior ${fmt(despA.get(chave(g.nome))?.valor ?? 0, 0)}`)}${vr(g.valor, despA.get(chave(g.nome))?.valor ?? 0)}`);
    }
    const catA = new Map((a.despesas?.porGrupo ?? []).flatMap((g) => g.categorias.map((c) => [chave(c.nome), c.valor] as const)));
    const altas = i.despesas.porGrupo.flatMap((g) => g.categorias)
      .map((c) => ({ nome: c.nome, atual: c.valor, antes: catA.get(chave(c.nome)) ?? 0 }))
      .filter((x) => x.atual - x.antes >= 300)
      .sort((x, y) => (y.atual - y.antes) - (x.atual - x.antes)).slice(0, 5);
    if (altas.length && temAnterior) L.push("", "Maiores aumentos por categoria:", ...altas.map((x) => `- ${x.nome}: ${fmt(x.atual, 0)} (era ${fmt(x.antes, 0)})`));
    const pontuais = citar(d, "pagamentos-pontuais");
    if (pontuais?.total) L.push("", `Pagamentos pontuais no período (não recorrentes): ${naturezaPontuais(pontuais).join(", ")}, somando ${fmt(pontuais.total)}. O consultor pediu para citar isso no texto.`);
  }

  if (i.leads) {
    sec("Funil de leads");
    L.push(`- Leads: ${n(i.leads.total)}${ant(` | anterior ${n(a.leads?.total)}`)} · Agendados: ${n(i.leads.agendados)}${ant(` | anterior ${n(a.leads?.agendados)}`)} · Conversão: ${pc(i.leads.conversao, 0)}${ant(` | anterior ${pc(a.leads?.conversao, 0)}`)}`);
    if (i.leads.porOrigem.length) L.push(`- Origem: ${i.leads.porOrigem.slice(0, 6).map((o) => `${o.nome} ${o.quantidade}`).join(", ")}`);
    if (i.leads.porObjecao.length) L.push(`- Objeções: ${i.leads.porObjecao.filter((o) => o.nome !== "Não informado").slice(0, 5).map((o) => `${o.nome} ${o.quantidade}`).join(", ")}`);
    if (i.leads.porInteresse?.length) L.push(`- Serviços mais procurados: ${i.leads.porInteresse.filter((o) => o.nome !== "Não informado").slice(0, 5).map((o) => `${o.nome} ${o.quantidade}`).join(", ")}`);
  }
  if (i.orcamentos) {
    const o = i.orcamentos, oa = a.orcamentos;
    sec("Orçamentos");
    L.push(`- Gerados: ${o.total} (${fmt(o.valorGerado, 0)})${ant(` | anterior ${n(oa?.total)} (${fmt(oa?.valorGerado, 0)})`)}`);
    L.push(`- Fechados: ${o.fechados} (${fmt(o.valorFechado, 0)})${ant(` | anterior ${n(oa?.fechados)} (${fmt(oa?.valorFechado, 0)})`)}`);
    L.push(`- Em negociação: ${o.emAberto} (${fmt(o.valorEmAberto, 0)}) · Conversão em valor: ${pc(o.conversaoValor, 0)}${ant(` | anterior ${pc(oa?.conversaoValor, 0)}`)}`);
  }
  if (i.nps || i.google) {
    sec(`Experiência do ${V.cliente}`);
    if (i.nps) L.push(`- NPS ${n(i.nps.nps)} com ${i.nps.respostas} respostas (promotores ${i.nps.promotores}, neutros ${i.nps.neutros}, detratores ${i.nps.detratores})${ant(` | anterior ${n(a.nps?.nps)}`)}`);
    if (i.google) L.push(`- Google: ${i.google.avaliacoes} avaliações novas, nota média ${i.google.nota?.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) ?? "—"}`);
  }

  for (const fp of (d.personalizadas ?? []).filter((x) => !x.erro && x.indicadores.length)) {
    sec(`${fp.nome} (controle específico do cliente)`);
    for (const x of fp.indicadores) {
      const fmtI = (v: number | null) => formatarIndicador(v, x.formato);
      if (x.grupos?.length) {
        L.push(`- ${x.nome} (${x.descricao}): ${x.grupos.slice(0, 6).map((g) => `${prof(g.nome)} ${fmtI(g.valor)}`).join(", ")}`);
        continue;
      }
      const v = variacaoIndicador(x.atual, x.anterior, x.formato, x.melhor);
      L.push(`- ${x.nome}: ${fmtI(x.atual)}${ant(` | anterior ${fmtI(x.anterior)}${v ? ` (${v.texto})` : ""}`)} — ${x.descricao}`);
    }
  }

  if (d.anual.filter((m) => m.entradas || m.saidasCaixa).length > 1) {
    sec(`Evolução em ${i.periodo.inicio.slice(0, 4)} (regime de caixa)`);
    L.push(d.anual.filter((m) => m.entradas || m.saidasCaixa).map((m) => `${nomeDoMes(m.mes + "-01").slice(0, 3)}: fat. ${fmt(m.entradas, 0)} / desp. ${fmt(m.saidasCaixa, 0)}`).join(" · "));
  }

  if (d.acompanhamento.length) {
    sec("Ações combinadas no fechamento anterior");
    const st = { concluida: "concluída", andamento: "em andamento", nao_feita: "não feita" } as const;
    for (const x of d.acompanhamento) L.push(`- ${x.titulo} (${x.responsaveis.join(" + ") || "sem responsável"}): ${x.status ? st[x.status] : "andamento não informado"}${x.nota ? ` — ${x.nota}` : ""}`);
  }
  if (d.texto.contexto.trim()) { sec("Contexto do período (anotado pelo consultor)"); L.push(d.texto.contexto.trim()); }

  const rascunho = (["observacao", "destaques", "comercial", "atencao"] as const).filter((k) => d.texto[k].trim());
  if (rascunho.length) {
    sec("Texto já escrito pelo consultor (use como ponto de partida e melhore)");
    const nomes = { observacao: "Observação", destaques: "Destaques", comercial: "Comercial", atencao: "Atenção" };
    for (const k of rascunho) L.push(`**${nomes[k]}:**`, d.texto[k].trim(), "");
  }

  const acoes = d.acoes.filter((x) => x.titulo.trim());
  if (acoes.length) {
    sec("Plano de ação já rascunhado (revise, melhore e devolva completo)");
    acoes.forEach((x, k) => {
      L.push(`${k + 1}. ${x.titulo.trim()}`, `Responsável: ${x.responsaveis.join(" + ") || "a definir"}`, `Prazo: ${x.prazo ? x.prazo.split("-").reverse().join("/") : "sem prazo"}`);
      if (x.descricao.trim()) L.push(`Ação: ${x.descricao.trim()}`);
      if (x.indicador.trim()) L.push(`Como medir: ${x.indicador.trim()}`);
      L.push("");
    });
  }

  let texto = L.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (apelidos.size) {
    texto += `\n\nObservação: os nomes dos profissionais foram trocados por apelidos (Profissional 1, 2...). Use os apelidos na resposta.`;
    // Também troca nomes que aparecem fora das tabelas (texto do consultor, ações).
    for (const [nome, ap] of apelidos) texto = texto.split(nome).join(ap);
  }
  return texto;
}

/* ---------- leitura da resposta ---------- */

const ROTULOS = {
  observacao: ["OBSERVACAO"],
  destaques: ["PRINCIPAIS DESTAQUES", "DESTAQUES"],
  comercial: ["INDICADORES COMERCIAIS", "COMERCIAL"],
  atencao: ["PONTOS DE ATENCAO", "ATENCAO"],
  plano: ["PLANO DE ACAO"],
};

export interface RespostaLida {
  secoes: Partial<SecoesTexto>;
  acoes: Acao[];
  avisos: string[];
}

function lerData(t: string): string | null {
  const m = t.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (!m) return null;
  const ano = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : String(new Date().getFullYear());
  const iso = `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

function lerPlano(texto: string, gerarId: () => string): Acao[] {
  const acoes: Acao[] = [];
  let atual: Acao | null = null;
  const campo = (l: string, nome: RegExp) => { const m = l.match(nome); return m ? l.slice(m[0].length).trim() : null; };
  for (const bruta of texto.split("\n")) {
    const l = bruta.replace(/\*\*/g, "").replace(/^\s*[-•>]\s*/, "").trim();
    if (!l) continue;
    const titulo = bruta.match(/^\s*(?:\*\*)?\d{1,2}[.)]\s*(.+?)(?:\*\*)?\s*$/);
    if (titulo) { atual = { id: gerarId(), titulo: titulo[1].replace(/\*\*/g, "").trim(), descricao: "", responsaveis: [], prazo: null, indicador: "" }; acoes.push(atual); continue; }
    if (!atual) continue;
    const resp = campo(l, /^respons[aá]ve(?:l|is)\s*:\s*/i);
    if (resp !== null) { atual.responsaveis = resp.split(/\s*(?:\+|,|;|\se\s)\s*/).map((x) => x.trim()).filter(Boolean).slice(0, 8); continue; }
    const prazo = campo(l, /^prazo\s*:\s*/i);
    if (prazo !== null) { atual.prazo = lerData(prazo); continue; }
    const medir = campo(l, /^como medir\s*:\s*/i) ?? campo(l, /^indicador\s*:\s*/i);
    if (medir !== null) { atual.indicador = medir; continue; }
    const acao = campo(l, /^a[cç][aã]o\s*:\s*/i);
    atual.descricao = [atual.descricao, acao ?? l].filter(Boolean).join(" ");
  }
  return acoes.filter((x) => x.titulo);
}

/**
 * Lê a resposta do Claude. Sem nenhum título reconhecido, o texto inteiro vai
 * para a Observação (com aviso), para o consultor ajustar à mão.
 */
export function lerResposta(texto: string, opcoes: { apelidos?: Map<string, string>; gerarId?: () => string } = {}): RespostaLida {
  let t = texto.trim();
  for (const [nome, ap] of opcoes.apelidos ?? []) t = t.replace(new RegExp(`\\b${ap}\\b`, "g"), nome);
  const gerarId = opcoes.gerarId ?? (() => crypto.randomUUID());
  const { secoes } = separarSecoes(t, ROTULOS);
  const avisos: string[] = [];
  const achou = Object.keys(secoes);
  if (!achou.length) return { secoes: { observacao: t }, acoes: [], avisos: ["Não encontrei os títulos do formato. O texto todo foi para a Observação."] };
  const faltam = (["observacao", "destaques", "comercial", "atencao", "plano"] as const).filter((k) => !secoes[k]);
  const nomes = { observacao: "Observação", destaques: "Destaques", comercial: "Indicadores comerciais", atencao: "Pontos de atenção", plano: "Plano de ação" };
  if (faltam.length) avisos.push(`Não vieram: ${faltam.map((k) => nomes[k]).join(", ")}.`);
  const acoes = secoes.plano ? lerPlano(secoes.plano, gerarId) : [];
  if (secoes.plano && !acoes.length) avisos.push("O plano de ação veio fora do formato numerado e não foi lido.");
  const { plano: _plano, ...resto } = secoes;
  void _plano;
  return { secoes: resto, acoes, avisos };
}
