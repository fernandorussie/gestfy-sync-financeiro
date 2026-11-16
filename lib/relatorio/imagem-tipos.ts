import type { EstruturaSemanal } from "./estrutura-semanal";
import type { Formato } from "@/lib/fechamentos/fonte-personalizada";

export type TipoDestaque = "positivo" | "atencao" | "financeiro";

export interface DestaqueItem {
  tipo: TipoDestaque;
  texto: string;
}

export interface FaturamentoVisao {
  is_media: boolean;
  // Faturamento do período selecionado (ex: semana 09/06→15/06) — informativo, não entra nos %
  realizado_filtro?: string;
  realizado_filtro_from_planilha?: boolean;
  // Acumulado do mês (dia 01 até data_fim) — base de todos os cálculos de %
  acumulado: string;
  acumulado_from_planilha?: boolean;
  meta_periodo: string;
  pct_periodo: number | null;  // diferença vs meta proporcional, base = acumulado; null = N/A
  acima_periodo: boolean;
  meta_mensal: string;
  pct_mensal: number | null;   // atingimento % (acumulado / meta_mensal * 100); null = N/A
  acima_mensal: boolean;
}

export interface NpsGoogleVisao {
  respostas_nps: number | null;      // TOTAL de respostas NPS no período (não o score)
  avaliacoes_google: number | null;  // qtd. de avaliações Google no período
  meta_nps_meta: number | null;      // alvo NPS (valor_meta_mensal da meta tipo NPS)
  meta_google_meta: number | null;   // alvo Google (valor_meta_mensal da meta tipo Google)
}

export interface ComercialVisao {
  conversao_leads: string;       // texto livre, ex: "32%" ou "N/A"
  conversao_orcamentos: string;
  total_leads: string;
  total_orcamentos: string;
}

export interface VisaoGeral {
  faturamento: FaturamentoVisao;
  npsGoogle: NpsGoogleVisao;
  comercial: ComercialVisao;
}

export interface CabecalhoInfo {
  clinica_nome: string;
  tag: string;      // tag_curta ou slug
  semana?: number | null;  // numero da semana ISO do periodo (selo do cabecalho)
  periodo_ini: string;  // ex: "26/05"
  periodo_fim: string;
}

export interface RodapeInfo {
  mes_ano: string;  // ex: "Maio/2026"
}

export interface FaturamentoSuplementar {
  por_categoria?:    Record<string, { total: number; pct_do_total: number }>;
  por_profissional?: Record<string, { total: number; pct_do_total: number }>;
}

/** Comentário de paciente exibido na página 2 (feedbacks). */
export interface ComentarioItem {
  texto:   string;
  /** Nome já resolvido pela regra de privacidade — "Paciente (anônimo)" quando há sigilo. */
  autor:   string;
  origem:  "nps" | "google";
  /** NPS 0–10 ou Google 1–5; null quando a fonte não traz nota. */
  nota:    number | null;
  /** true = detrator/avaliação baixa → vai para o bloco "Críticas / Sugestões". */
  critica: boolean;
}

/** Cards financeiros do modelo financeiro e operacional (valores em reais; null = sem dado). */
export interface FinanceiroSemanal {
  /** De onde vieram as entradas: planilha de Entradas ou, sem ela, Vendas. */
  origemEntradas: "entradas" | "vendas";
  entradas: number | null;
  entradasMes: number | null;
  saidas: number | null;
  saidasMes: number | null;
}

/** Card de indicador de fonte personalizada. "anterior" vem do último report salvo. */
export interface PersonalizadoCard {
  /** "pers:<fonteId>.<indicadorId>" */
  id: string;
  nome: string;
  formato: Formato;
  melhor: "maior" | "menor" | "neutro";
  atual: number | null;
  anterior: number | null;
}

export interface RelatorioImagemData {
  cabecalho: CabecalhoInfo;
  rodape: RodapeInfo;
  visaoGeral: VisaoGeral;
  destaques: DestaqueItem[];
  alertas: string[];
  acoes: string[];
  faturamento_suplementar?: FaturamentoSuplementar;
  /** Página 2 (opcional): só é preenchida quando o usuário pede os feedbacks. */
  comentarios?: ComentarioItem[];
  financeiro?: FinanceiroSemanal;
  personalizados?: PersonalizadoCard[];
  /** Linhas do bloco "Despesas relevantes" (editáveis na geração). */
  despesasRelevantes?: string[];
  /** Linhas do bloco "Contratos e pendências" (editáveis na geração). */
  contratos?: string[];
  /** Blocos ligados e ordem, conforme a estrutura do Semanal do cliente (sem ela: o padrão). */
  estrutura?: EstruturaSemanal;
}
