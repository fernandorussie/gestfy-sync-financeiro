/**
 * Conferência do fechamento: o que o app encontra sozinho antes da análise.
 *
 * Cada regra olha os registros do período e devolve alertas com gravidade,
 * evidências (linha da planilha, descrição, valor) e uma sugestão de ação.
 * Alertas graves impedem seguir para a análise até o consultor decidir.
 * A decisão vira um ajuste (reclassificar, unificar) e, ao recalcular, o
 * alerta deixa de aparecer. A chave de cada alerta é estável, para o app
 * guardar decisões como "manter assim".
 */
import type { AvisoLeitura } from "./leitores";
import type { Despesa } from "./leitores";
import {
  agruparPorNome, calcularIndicadores, categoriaDaDespesa, grupoDaVenda, NAO_INFORMADO,
  type Ajustes, type CampoUnificavel, type DadosFechamento, type Periodo, type RegrasClinica,
} from "./indicadores";
import { GRUPO_SEM_CLASSIFICACAO, montarPlano, PISTAS_CATEGORIA } from "./plano-contas";
import { centavos, normalizar } from "./texto";

export type Gravidade = "grave" | "atencao" | "info";
export type Fonte = keyof DadosFechamento;

export interface Evidencia {
  fonte: Fonte;
  /** Linha da planilha de origem. */
  linha?: number;
  texto: string;
  data?: string | null;
  valor?: number | null;
}

export type Sugestao =
  | { tipo: "reclassificar"; linhas: number[]; categoria: string; grupo: string }
  | { tipo: "classificar"; categorias: string[] }
  | { tipo: "unificar"; campo: CampoUnificavel; de: string[]; para: string }
  | { tipo: "escolher-meta"; opcoes: { origem: string; valor: number }[] }
  | { tipo: "citar-no-texto" }
  | { tipo: "corrigir-na-origem" };

export interface Alerta {
  chave: string;
  regra: string;
  gravidade: Gravidade;
  area: string;
  titulo: string;
  descricao: string;
  evidencias: Evidencia[];
  total?: number;
  sugestao?: Sugestao;
}

export interface EntradaConferencia {
  dados: DadosFechamento;
  periodo: Periodo;
  regras?: RegrasClinica;
  ajustes?: Ajustes;
  /** Avisos e colunas de cada leitura (para saber, por exemplo, se a coluna de unidade existe). */
  leituras?: Partial<Record<Fonte, { avisos: AvisoLeitura[]; colunas: { indices: Record<string, number | undefined> } }>>;
  /** Todas as metas encontradas para o período (GestfySync, planilha…). */
  metas?: { origem: string; valor: number }[];
  /** Fração das despesas a partir da qual um pagamento é tratado como pontual. Padrão: 10%. */
  limitePontual?: number;
}

const ORDEM: Record<Gravidade, number> = { grave: 0, atencao: 1, info: 2 };
const brl = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const no = (d: string | null, p: Periodo) => !!d && d >= p.inicio && d <= p.fim;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const NOME_FONTE: Record<Fonte, string> = { vendas: "Vendas", despesas: "Despesas", orcamentos: "Orçamentos", leads: "Leads", nps: "NPS", avaliacoes: "Avaliações Google" };

export function conferir(e: EntradaConferencia): Alerta[] {
  const { dados, periodo } = e;
  const regras = e.regras ?? {};
  const ajustes = e.ajustes ?? {};
  const alertas: Alerta[] = [];
  const ind = calcularIndicadores(dados, periodo, { regras, ajustes });
  const plano = montarPlano(regras.categoriasDespesa);
  const vendas = (dados.vendas ?? []).filter((v) => no(v.data, periodo));
  const despesas = (dados.despesas ?? []).filter((d) => no(d.dataPagamento, periodo));
  const evDesp = (d: Despesa): Evidencia => ({ fonte: "despesas", linha: d.linha, texto: d.descricao || d.categoria, data: d.dataPagamento, valor: d.valor });

  /* ---------- fontes e linhas ---------- */
  for (const fonte of Object.keys(NOME_FONTE) as Fonte[]) {
    const lista = dados[fonte] as { data?: string; dataPagamento?: string | null }[] | null;
    if (!lista) continue;
    const n = lista.filter((r) => no(r.data ?? r.dataPagamento ?? null, periodo)).length;
    if (n === 0) {
      alertas.push({
        chave: `fonte-vazia:${fonte}`, regra: "fonte-vazia", gravidade: fonte === "vendas" || fonte === "despesas" ? "grave" : "info",
        area: NOME_FONTE[fonte], titulo: `${NOME_FONTE[fonte]} sem lançamentos no período`,
        descricao: "A planilha foi lida, mas não há nenhuma linha com data dentro do período. Confira se a planilha está atualizada.",
        evidencias: [], sugestao: { tipo: "corrigir-na-origem" },
      });
    }
  }
  for (const [fonte, l] of Object.entries(e.leituras ?? {}) as [Fonte, { avisos: AvisoLeitura[] }][]) {
    const avisos = l.avisos.filter((a) => !a.motivo.includes("ignorada"));
    if (!avisos.length) continue;
    alertas.push({
      chave: `linhas-ilegiveis:${fonte}`, regra: "linhas-ilegiveis", gravidade: "atencao", area: NOME_FONTE[fonte],
      titulo: `${plural(avisos.length, "linha", "linhas")} de ${NOME_FONTE[fonte]} com data ou valor ilegível`,
      descricao: "Essas linhas ficaram fora do cálculo. Corrija na planilha e leia de novo.",
      evidencias: avisos.slice(0, 20).map((a) => ({ fonte, linha: a.linha, texto: `${a.campo}: ${a.motivo}${a.valor ? ` (“${a.valor}”)` : ""}` })),
      sugestao: { tipo: "corrigir-na-origem" },
    });
  }

  /* ---------- despesas sem grupo ---------- */
  const semGrupo = despesas.filter((d) => plano.grupoDe(categoriaDaDespesa(d, ajustes)) === null);
  if (semGrupo.length) {
    const cats = [...new Set(semGrupo.map((d) => categoriaDaDespesa(d, ajustes) || NAO_INFORMADO))];
    alertas.push({
      chave: `despesa-sem-grupo:${cats.map(normalizar).sort().join("|")}`, regra: "despesa-sem-grupo", gravidade: "grave", area: "Despesas",
      titulo: `${plural(cats.length, "categoria de despesa", "categorias de despesa")} fora do plano de contas`,
      descricao: `Ficariam em “${GRUPO_SEM_CLASSIFICACAO}”: ${cats.join(", ")}. Escolha o grupo de cada uma; a escolha fica salva no mapa da clínica.`,
      evidencias: semGrupo.map(evDesp), total: centavos(semGrupo.reduce((s, d) => s + d.valor, 0)),
      sugestao: { tipo: "classificar", categorias: cats },
    });
  }

  /* ---------- despesa no grupo errado (pistas na descrição) ---------- */
  const porSugestao = new Map<string, Despesa[]>();
  for (const d of despesas) {
    const desc = normalizar(d.descricao);
    const pista = PISTAS_CATEGORIA.find((p) => p.padrao.test(desc));
    if (!pista) continue;
    const atual = categoriaDaDespesa(d, ajustes);
    const grupoAtual = plano.grupoDe(atual);
    const grupoSugerido = plano.grupoDaCategoriaPadrao(pista.categoria);
    if (!grupoSugerido || grupoAtual === grupoSugerido) continue;
    // Encargos (FGTS, INSS) de uma rescisão ficam em Impostos: não é erro.
    if (grupoAtual === "Impostos, Taxas e afins") continue;
    porSugestao.set(pista.categoria, [...(porSugestao.get(pista.categoria) ?? []), d]);
  }
  for (const [categoria, ds] of porSugestao) {
    const grupo = plano.grupoDaCategoriaPadrao(categoria)!;
    const de = [...new Set(ds.map((d) => plano.nomeDe(categoriaDaDespesa(d, ajustes))))];
    alertas.push({
      chave: `despesa-grupo-errado:${normalizar(categoria)}:${ds.map((d) => d.linha).join(",")}`, regra: "despesa-grupo-errado",
      gravidade: grupo === "Pessoal" ? "grave" : "atencao", area: "Despesas",
      titulo: `${plural(ds.length, "lançamento parece", "lançamentos parecem")} ser “${categoria}” (${grupo})`,
      descricao: `Estão em ${de.join(" e ")}. Isso distorce o peso de ${grupo} no relatório.`,
      evidencias: ds.map(evDesp), total: centavos(ds.reduce((s, d) => s + d.valor, 0)),
      sugestao: { tipo: "reclassificar", linhas: ds.map((d) => d.linha), categoria, grupo },
    });
  }

  /* ---------- pagamentos pontuais ---------- */
  const limite = (e.limitePontual ?? 0.1) * (ind.despesas?.total ?? 0);
  const PONTUAL = /\b(cota unica|rescis\w*|recis\w*|parcela unica|13[oº°]|decimo terceiro|refis|multa)\b/;
  const pontuais = despesas.filter((d) => PONTUAL.test(normalizar(d.descricao)) || (limite > 0 && d.valor >= limite && !/recorrente/i.test(d.periodicidade)));
  // Encargos ligados a uma rescisão (ex.: "FGTS DA FULANA" quando há "RESCISÃO DA FULANA").
  const nomesRescisao = pontuais
    .filter((d) => /\b(rescis|recis)/.test(normalizar(d.descricao)))
    .map((d) => normalizar(d.descricao).replace(/^.*?\b(rescis|recis)\w*\b\s*(da|do|de)?\s*/, "").trim())
    .filter((n) => n.length >= 3);
  for (const d of despesas) {
    const desc = normalizar(d.descricao);
    if (!pontuais.includes(d) && /\b(fgts|inss|multa|aviso)\b/.test(desc) && nomesRescisao.some((n) => desc.includes(n))) pontuais.push(d);
  }
  if (pontuais.length) {
    const total = centavos(pontuais.reduce((s, d) => s + d.valor, 0));
    alertas.push({
      chave: `pagamentos-pontuais:${pontuais.map((d) => d.linha).sort((a, b) => a - b).join(",")}`, regra: "pagamentos-pontuais", gravidade: "atencao", area: "Despesas",
      titulo: `Pagamentos pontuais somam ${brl(total)}`,
      descricao: `São ${plural(pontuais.length, "pagamento", "pagamentos")} que não se repetem todo mês (${((total / (ind.despesas?.total || 1)) * 100).toFixed(0)}% das despesas). No caixa entram normalmente; vale explicar no texto para o aumento não parecer custo fixo.`,
      evidencias: pontuais.sort((a, b) => b.valor - a.valor).map(evDesp), total,
      sugestao: { tipo: "citar-no-texto" },
    });
  }

  /* ---------- metas ---------- */
  const metas = (e.metas ?? []).filter((m) => m.valor > 0);
  const valores = [...new Set(metas.map((m) => m.valor))];
  if (e.metas && valores.length === 0) {
    alertas.push({ chave: "meta-ausente", regra: "meta-ausente", gravidade: "atencao", area: "Metas", titulo: "Sem meta de faturamento para o período", descricao: "Cadastre a meta do mês no GestfySync para o relatório mostrar o atingimento.", evidencias: [] });
  } else if (valores.length > 1) {
    alertas.push({
      chave: `metas-diferentes:${valores.sort((a, b) => a - b).join("|")}`, regra: "metas-diferentes", gravidade: "grave", area: "Metas",
      titulo: `${valores.length} metas diferentes para o período`,
      descricao: "Escolha qual meta vale para este fechamento. O texto e o PDF usam só ela.",
      evidencias: metas.map((m) => ({ fonte: "vendas" as Fonte, texto: m.origem, valor: m.valor })),
      sugestao: { tipo: "escolher-meta", opcoes: metas },
    });
  }

  /* ---------- nomes parecidos e grafias unidas ---------- */
  const un = ajustes.unificar ?? {};
  const campos: { campo: CampoUnificavel; fonte: Fonte; area: string; rotulo: string; itens: { nome: string; valor: number; quantidade: number; variantes: string[] }[] }[] = [
    { campo: "profissional", fonte: "vendas", area: "Vendas", rotulo: "Profissional", itens: agruparPorNome(vendas, (v) => v.profissional, (v) => v.valor ?? 0, un.profissional) },
    { campo: "unidade", fonte: "vendas", area: "Vendas", rotulo: "Unidade", itens: agruparPorNome(vendas, (v) => v.unidade, (v) => v.valor ?? 0, un.unidade) },
    { campo: "pagamento", fonte: "vendas", area: "Vendas", rotulo: "Meio de pagamento", itens: agruparPorNome(vendas, (v) => v.pagamento, (v) => v.valor ?? 0, un.pagamento) },
    { campo: "grupoReceita", fonte: "vendas", area: "Vendas", rotulo: "Grupo de receita", itens: agruparPorNome(vendas, (v) => grupoDaVenda(v, regras), (v) => v.valor ?? 0, un.grupoReceita) },
  ];
  if (dados.leads) {
    const ls = dados.leads.filter((l) => no(l.data, periodo));
    campos.push(
      { campo: "origem", fonte: "leads", area: "Leads", rotulo: "Origem do lead", itens: agruparPorNome(ls, (l) => l.origem, () => 0, un.origem) },
      { campo: "interesse", fonte: "leads", area: "Leads", rotulo: "Interesse", itens: agruparPorNome(ls, (l) => l.interesse, () => 0, un.interesse) },
    );
  }
  const unidas: Evidencia[] = [];
  for (const c of campos) {
    for (const it of c.itens) if (it.variantes.length > 1) unidas.push({ fonte: c.fonte, texto: `${c.rotulo}: ${it.variantes.map((v) => `“${v}”`).join(", ")} → “${it.nome}”` });
    // Um nome que é o começo de outro ("Dra. Ana" e "Dra. Ana Clara").
    const nomes = c.itens.filter((i) => i.nome !== NAO_INFORMADO);
    for (const curto of nomes) {
      const nc = normalizar(curto.nome);
      const longos = nomes.filter((l) => l !== curto && normalizar(l.nome).startsWith(nc + " "));
      if (longos.length !== 1 || nc.split(" ").length < 2) continue;
      const longo = longos[0];
      alertas.push({
        chave: `nomes-parecidos:${c.campo}:${nc}|${normalizar(longo.nome)}`, regra: "nomes-parecidos", gravidade: "atencao", area: c.area,
        titulo: `“${curto.nome}” e “${longo.nome}” podem ser a mesma pessoa`,
        descricao: `Os dois aparecem em ${c.rotulo.toLowerCase()}. Se forem a mesma, o total junto é ${brl(curto.valor + longo.valor)}.`,
        evidencias: [curto, longo].map((x) => ({ fonte: c.fonte, texto: `${x.nome} (${plural(x.quantidade, "lançamento", "lançamentos")})`, valor: c.fonte === "vendas" ? x.valor : undefined })),
        sugestao: { tipo: "unificar", campo: c.campo, de: [curto.nome], para: longo.nome },
      });
    }
  }
  if (unidas.length) {
    alertas.push({
      chave: "grafias-unidas", regra: "grafias-unidas", gravidade: "info", area: "Vendas e leads",
      titulo: "Nomes escritos de formas diferentes foram unidos",
      descricao: "Maiúsculas, acentos e espaços não separam mais os totais. Se algum par não for a mesma coisa, ajuste no mapa da clínica.",
      evidencias: unidas,
    });
  }

  /* ---------- vendas com campos faltando ---------- */
  const cols = e.leituras?.vendas?.colunas.indices ?? {};
  const comValor = vendas.filter((v) => (v.valor ?? 0) > 0);
  const faltas: { campo: "unidade" | "pagamento" | "profissional"; rotulo: string }[] = [
    { campo: "unidade", rotulo: "sem unidade" }, { campo: "pagamento", rotulo: "sem meio de pagamento" }, { campo: "profissional", rotulo: "sem profissional" },
  ];
  const evFaltas: Evidencia[] = [];
  const partes: string[] = [];
  for (const f of faltas) {
    if (e.leituras?.vendas && cols[f.campo] === undefined) continue;
    const vs = comValor.filter((v) => !v[f.campo]);
    if (!vs.length) continue;
    partes.push(`${plural(vs.length, "venda", "vendas")} ${f.rotulo} (${brl(vs.reduce((s, v) => s + (v.valor ?? 0), 0))})`);
    evFaltas.push(...vs.map((v) => ({ fonte: "vendas" as Fonte, linha: v.linha, texto: `${f.rotulo}: ${v.grupo || v.categoria}`, data: v.data, valor: v.valor })));
  }
  if (partes.length) {
    alertas.push({
      chave: `vendas-incompletas:${evFaltas.map((x) => x.linha).join(",")}`, regra: "vendas-incompletas", gravidade: "atencao", area: "Vendas",
      titulo: partes.join(" e "), descricao: "Aparecem como “Não informado” nos quadros. Corrija na planilha de vendas e leia de novo.",
      evidencias: evFaltas, sugestao: { tipo: "corrigir-na-origem" },
    });
  }

  /* ---------- informativos de vendas ---------- */
  if (ind.faturamento && ind.faturamento.semValor > 0) {
    const zero = vendas.filter((v) => v.valor === 0).length;
    const branco = vendas.filter((v) => v.valor === null).length;
    alertas.push({
      chave: "vendas-sem-valor", regra: "vendas-sem-valor", gravidade: "info", area: "Vendas",
      titulo: `${ind.faturamento.semValor} de ${ind.faturamento.lancamentos} lançamentos sem valor`,
      descricao: `${zero} com R$ 0 e ${branco} em branco. Costumam ser retornos: contam como paciente atendido e reduzem o ticket médio.`,
      evidencias: [],
    });
  }
  for (const g of ind.faturamento?.porGrupo ?? []) {
    if (g.valor === 0 && g.quantidade > 0) {
      alertas.push({
        chave: `grupo-sem-valor:${normalizar(g.nome)}`, regra: "grupo-sem-valor", gravidade: "info", area: "Vendas",
        titulo: `${g.nome}: ${plural(g.quantidade, "atendimento", "atendimentos")} sem valor`,
        descricao: "Pode ser cortesia, teste ou venda registrada em outro lançamento.", evidencias: [],
      });
    }
  }
  if (ind.pacientes && ind.faturamento && ind.faturamento.lancamentos > 0 && (!ind.pacientes.temInformacaoDeNovos || ind.pacientes.novos === 0)) {
    alertas.push({
      chave: "novos-sem-informacao", regra: "novos-sem-informacao", gravidade: "atencao", area: "Vendas",
      titulo: "Nenhum paciente marcado como novo",
      descricao: "A coluna “1ª vez na clínica” está vazia ou não existe. Pacientes novos e ticket dos novos vão sair zerados.",
      evidencias: [], sugestao: { tipo: "corrigir-na-origem" },
    });
  }

  /* ---------- leads ---------- */
  if (ind.leads && ind.leads.total > 0) {
    const sem = ind.leads.porOrigem.find((o) => o.nome === NAO_INFORMADO)?.quantidade ?? 0;
    if (sem / ind.leads.total > 0.2) {
      alertas.push({
        chave: "leads-sem-origem", regra: "leads-sem-origem", gravidade: "atencao", area: "Leads",
        titulo: `${sem} de ${ind.leads.total} leads sem origem informada`,
        descricao: "Sem a origem, não dá para saber quais campanhas trazem agendamento. Sugestão: citar nos pontos de atenção.",
        evidencias: [], sugestao: { tipo: "citar-no-texto" },
      });
    }
  }

  return alertas.sort((a, b) => ORDEM[a.gravidade] - ORDEM[b.gravidade]);
}

/** O fechamento só segue para a análise sem alertas graves pendentes. */
export function podeSeguirParaAnalise(alertas: Alerta[], decididos: Set<string> = new Set()): boolean {
  return alertas.every((a) => a.gravidade !== "grave" || decididos.has(a.chave));
}
