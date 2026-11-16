/**
 * Estrutura do Report Semanal: quais blocos do infográfico aparecem e em que
 * ordem. O visual continua o mesmo; o cliente liga, desliga, reordena e pode
 * renomear os títulos. Fica em fechamento_config.relatorio.semanal, junto das
 * estruturas do Quinzenal e do Mensal.
 *
 * Dois modelos prontos: o comercial (padrão, o de sempre) e o financeiro e
 * operacional (entradas, saídas, saldo, cards das fontes personalizadas,
 * despesas relevantes e contratos). Itens novos entram desligados, para não
 * mudar o report de quem já usa.
 */
export type SecaoSemanal = "indicadores" | "destaques" | "despesas" | "contratos" | "alertas" | "acoes" | "feedbacks";
export type KpiFixo =
  | "faturamentoPeriodo" | "acumuladoMes" | "respostasNps" | "avaliacoesGoogle" | "totalLeads"
  | "entradasPeriodo" | "saidasPagas" | "saldoPeriodo";
/** Card de indicador de fonte personalizada: "pers:<fonteId>.<indicadorId>". */
export type KpiPersonalizado = `pers:${string}`;
export type KpiSemanal = KpiFixo | KpiPersonalizado;

export interface ItemLigado<T extends string> { id: T; ligado: boolean }
export interface EstruturaSemanal {
  secoes: ItemLigado<SecaoSemanal>[];
  kpis: ItemLigado<KpiSemanal>[];
  /** Títulos trocados pelo cliente (ex.: "Próximos passos" no lugar de "Ações sugeridas"). */
  titulos?: Partial<Record<SecaoSemanal, string>>;
  /** Indicadores personalizados que viram linhas do bloco "Contratos e pendências". */
  contratos?: KpiPersonalizado[];
}

export const SECOES_SEMANAL: { id: SecaoSemanal; titulo: string; descricao: string; ordenavel: boolean; padrao: boolean }[] = [
  { id: "indicadores", titulo: "Indicadores", descricao: "Cards do topo (escolha quais abaixo)", ordenavel: true, padrao: true },
  { id: "destaques", titulo: "Principais destaques", descricao: "Texto escrito na geração do report (ou sugerido pela IA)", ordenavel: true, padrao: true },
  { id: "despesas", titulo: "Despesas relevantes", descricao: "As maiores despesas pagas na semana, por categoria (editável na geração)", ordenavel: true, padrao: false },
  { id: "contratos", titulo: "Contratos e pendências", descricao: "Linhas montadas dos indicadores personalizados escolhidos, mais o que for escrito na geração", ordenavel: true, padrao: false },
  { id: "alertas", titulo: "Alertas", descricao: "Pontos de atenção da semana", ordenavel: true, padrao: true },
  { id: "acoes", titulo: "Ações sugeridas", descricao: "Próximos passos numerados", ordenavel: true, padrao: true },
  { id: "feedbacks", titulo: "Página de feedbacks", descricao: "Segunda imagem com comentários do NPS e do Google (quando pedida na geração)", ordenavel: false, padrao: true },
];

export const KPIS_SEMANAL: { id: KpiFixo; titulo: string; fonte: string; padrao: boolean }[] = [
  { id: "faturamentoPeriodo", titulo: "Faturamento no período", fonte: "Vendas, com a meta proporcional do período", padrao: true },
  { id: "acumuladoMes", titulo: "Acumulado no mês", fonte: "Vendas do dia 1 até o fim do período, com a meta mensal", padrao: true },
  { id: "respostasNps", titulo: "Respostas NPS", fonte: "NPS, com a meta de respostas", padrao: true },
  { id: "avaliacoesGoogle", titulo: "Avaliações Google", fonte: "Google (Place ID), com a meta de avaliações", padrao: true },
  { id: "totalLeads", titulo: "Total de leads", fonte: "Leads, com a conversão em agendamentos", padrao: true },
  { id: "entradasPeriodo", titulo: "Entradas do período", fonte: "Entradas; sem essa planilha, Vendas", padrao: false },
  { id: "saidasPagas", titulo: "Saídas pagas", fonte: "Despesas pagas, pela data de pagamento", padrao: false },
  { id: "saldoPeriodo", titulo: "Saldo do período", fonte: "Entradas − saídas pagas", padrao: false },
];

export const ehKpiPersonalizado = (id: string): id is KpiPersonalizado => /^pers:[\w-]{1,64}\.[\w-]{1,64}$/.test(id);
export const kpiPersonalizado = (fonteId: string, indicadorId: string): KpiPersonalizado => `pers:${fonteId}.${indicadorId}`;
/** "pers:<fonte>.<ind>" → chave usada no cálculo das fontes ("<fonte>.<ind>"). */
export const chaveDoKpi = (id: KpiPersonalizado) => id.slice(5);

const MAX_TITULO = 40;
export const MAX_KPIS_LIGADOS = 8;

export function padraoSemanal(): EstruturaSemanal {
  return {
    secoes: SECOES_SEMANAL.map((s) => ({ id: s.id, ligado: s.padrao })),
    kpis: KPIS_SEMANAL.map((k) => ({ id: k.id, ligado: k.padrao })),
  };
}

/** Modelo financeiro e operacional (pensado para administradoras, locação e afins). */
export function modeloFinanceiro(atual: EstruturaSemanal): EstruturaSemanal {
  const ordem: SecaoSemanal[] = ["indicadores", "destaques", "despesas", "contratos", "alertas", "acoes", "feedbacks"];
  const ligadas = new Set<SecaoSemanal>(["indicadores", "destaques", "despesas", "contratos", "acoes"]);
  const fin = new Set<KpiFixo>(["entradasPeriodo", "saidasPagas", "saldoPeriodo"]);
  const pers = atual.kpis.filter((k) => ehKpiPersonalizado(k.id));
  return {
    secoes: ordem.map((id) => ({ id, ligado: ligadas.has(id) })),
    kpis: [
      ...KPIS_SEMANAL.filter((k) => fin.has(k.id)).map((k) => ({ id: k.id as KpiSemanal, ligado: true })),
      ...pers,
      ...KPIS_SEMANAL.filter((k) => !fin.has(k.id)).map((k) => ({ id: k.id as KpiSemanal, ligado: false })),
    ],
    titulos: { destaques: "Destaques financeiros", acoes: "Próximos passos" },
    contratos: atual.contratos ?? [],
  };
}

/** Modelo comercial: o padrão de sempre, mantendo os cards personalizados já escolhidos (desligados). */
export function modeloComercial(atual: EstruturaSemanal): EstruturaSemanal {
  const p = padraoSemanal();
  return { ...p, kpis: [...p.kpis, ...atual.kpis.filter((k) => ehKpiPersonalizado(k.id)).map((k) => ({ ...k, ligado: false }))], contratos: atual.contratos ?? [] };
}

function limparLista<T extends string>(v: unknown, ids: { id: T; padrao: boolean }[], extra?: (id: string) => boolean): ItemLigado<T>[] {
  const lista = Array.isArray(v) ? v : [];
  const vistos = new Set<string>();
  const out: ItemLigado<T>[] = [];
  for (const x of lista) {
    const id = String((x as { id?: unknown })?.id ?? "");
    if (!(ids.some((i) => i.id === id) || extra?.(id)) || vistos.has(id)) continue;
    vistos.add(id);
    out.push({ id: id as T, ligado: (x as { ligado?: unknown }).ligado !== false });
  }
  // Itens que não estavam salvos entram com o padrão de cada um (os novos, desligados).
  for (const i of ids) if (!vistos.has(i.id)) out.push({ id: i.id, ligado: i.padrao });
  return out;
}

/** Aceita o que estiver salvo (ou nada) e devolve uma estrutura completa e válida. */
export function limparSemanal(v: unknown): EstruturaSemanal {
  const o = (v ?? {}) as Record<string, unknown>;
  const secoes = limparLista<SecaoSemanal>(o.secoes, SECOES_SEMANAL);
  // A página de feedbacks é sempre a segunda imagem: fica no fim.
  const fb = secoes.find((s) => s.id === "feedbacks")!;
  const out: EstruturaSemanal = {
    secoes: [...secoes.filter((s) => s.id !== "feedbacks"), fb],
    kpis: limparLista<KpiSemanal>(o.kpis, KPIS_SEMANAL, ehKpiPersonalizado),
  };
  const t = (o.titulos ?? {}) as Record<string, unknown>;
  const titulos: Partial<Record<SecaoSemanal, string>> = {};
  for (const s of SECOES_SEMANAL) {
    const x = typeof t[s.id] === "string" ? (t[s.id] as string).trim().slice(0, MAX_TITULO) : "";
    if (x && x !== s.titulo) titulos[s.id] = x;
  }
  if (Object.keys(titulos).length) out.titulos = titulos;
  const contratos = Array.isArray(o.contratos) ? [...new Set(o.contratos.filter((x): x is KpiPersonalizado => typeof x === "string" && ehKpiPersonalizado(x)))].slice(0, 10) : [];
  if (contratos.length) out.contratos = contratos;
  return out;
}

export const tituloDaSecao = (e: EstruturaSemanal, id: SecaoSemanal) => e.titulos?.[id] || SECOES_SEMANAL.find((s) => s.id === id)!.titulo;
/** Igual ao padrão no que aparece: mesmos blocos e cards ligados, na mesma ordem, sem títulos trocados. */
export const ehPadraoSemanal = (e: EstruturaSemanal) => {
  const v = (x: EstruturaSemanal) => JSON.stringify([x.secoes.filter((s) => s.ligado).map((s) => s.id), x.kpis.filter((k) => k.ligado).map((k) => k.id), x.titulos ?? {}]);
  return v(limparSemanal(e)) === v(padraoSemanal());
};
export const ligado = <T extends string>(lista: ItemLigado<T>[], id: T) => lista.find((x) => x.id === id)?.ligado === true;
/** Cards e linhas de contratos que dependem de indicadores personalizados. */
export const personalizadosUsados = (e: EstruturaSemanal): KpiPersonalizado[] =>
  [...new Set([
    ...(ligado(e.secoes, "indicadores") ? e.kpis.filter((k) => k.ligado && ehKpiPersonalizado(k.id)).map((k) => k.id as KpiPersonalizado) : []),
    ...(ligado(e.secoes, "contratos") ? e.contratos ?? [] : []),
  ])];
