/**
 * Coleta: busca as planilhas configuradas da clínica e passa pelos leitores.
 *
 * A função de leitura é injetável, para testar sem acessar o Google. No app,
 * usa readSheetValues (Service Account, só leitura).
 */
import type { IndicacaoColuna } from "./colunas";
import type { DadosFechamento } from "./indicadores";
import {
  lerAvaliacoes, lerDespesas, lerLeads, lerNps, lerOrcamentos, lerVendas,
  type AvisoLeitura, type CampoAvaliacao, type CampoDespesa, type CampoLead, type CampoNps, type CampoOrcamento, type CampoVenda,
} from "./leitores";
import type { Celula } from "./texto";

export interface ConfigFonte<C extends string> {
  sheetId: string;
  /** Nome exato da aba. */
  aba: string;
  colunas?: Partial<Record<C, IndicacaoColuna>>;
  linhaCabecalho?: number;
}

/** Mapa de fontes da clínica para o fechamento (fica salvo junto do cadastro dela). */
export interface FontesFechamento {
  vendas?: ConfigFonte<CampoVenda>;
  despesas?: ConfigFonte<CampoDespesa>;
  orcamentos?: ConfigFonte<CampoOrcamento>;
  leads?: ConfigFonte<CampoLead>;
  nps?: ConfigFonte<CampoNps>;
  avaliacoes?: ConfigFonte<CampoAvaliacao>;
}

export type LerPlanilha = (sheetId: string, faixa: string) => Promise<Celula[][]>;

export interface ResultadoColeta {
  dados: DadosFechamento;
  /** Avisos e colunas encontradas por fonte (vão para a conferência e para a tela de configuração). */
  leituras: Partial<Record<keyof DadosFechamento, { avisos: AvisoLeitura[]; colunas: { indices: Record<string, number | undefined>; faltando: string[]; origem: Record<string, unknown> }; linhas: number }>>;
  /** Fontes que não puderam ser lidas (sem permissão, aba inexistente…). */
  erros: Partial<Record<keyof DadosFechamento, string>>;
}

/** Nome de aba entre aspas simples, como a API exige quando há espaço ou acento. */
export function faixaDaAba(aba: string): string {
  return `'${aba.replace(/'/g, "''")}'`;
}

export async function coletar(fontes: FontesFechamento, ler: LerPlanilha): Promise<ResultadoColeta> {
  const res: ResultadoColeta = {
    dados: { vendas: null, despesas: null, orcamentos: null, leads: null, nps: null, avaliacoes: null },
    leituras: {},
    erros: {},
  };

  async function uma<C extends string, T>(
    nome: keyof DadosFechamento,
    cfg: ConfigFonte<C> | undefined,
    leitor: (l: Celula[][], op: { colunas?: Partial<Record<C, IndicacaoColuna>>; linhaCabecalho?: number }) => {
      registros: T[]; avisos: AvisoLeitura[]; colunas: { indices: Partial<Record<C, number>>; faltando: C[]; faltandoRotulos: string[]; origem: object };
    },
  ) {
    if (!cfg) return;
    try {
      const linhas = await ler(cfg.sheetId, faixaDaAba(cfg.aba));
      const l = leitor(linhas, { colunas: cfg.colunas, linhaCabecalho: cfg.linhaCabecalho });
      res.leituras[nome] = {
        avisos: l.avisos,
        colunas: { indices: l.colunas.indices as Record<string, number | undefined>, faltando: l.colunas.faltandoRotulos, origem: l.colunas.origem as Record<string, unknown> },
        linhas: l.registros.length,
      };
      if (l.colunas.faltando.length) {
        res.erros[nome] = `Coluna não encontrada: ${l.colunas.faltandoRotulos.join(", ")}. Indique a coluna no mapa da clínica.`;
        return;
      }
      (res.dados as unknown as Record<string, T[]>)[nome] = l.registros;
    } catch (e) {
      res.erros[nome] = mensagemDeErro(e);
    }
  }

  // Em sequência: a API do Sheets tem limite de leituras por minuto por usuário.
  await uma("vendas", fontes.vendas, lerVendas);
  await uma("despesas", fontes.despesas, lerDespesas);
  await uma("orcamentos", fontes.orcamentos, lerOrcamentos);
  await uma("leads", fontes.leads, lerLeads);
  await uma("nps", fontes.nps, lerNps);
  await uma("avaliacoes", fontes.avaliacoes, lerAvaliacoes);
  return res;
}

function mensagemDeErro(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/permission|403|forbidden/i.test(msg)) return "Sem permissão. Compartilhe a planilha com o e-mail da conta de serviço, como Leitor.";
  if (/unable to parse range|400/i.test(msg)) return "Aba não encontrada. Confira o nome exato da aba no mapa da clínica.";
  if (/not found|404/i.test(msg)) return "Planilha não encontrada. Confira o link no mapa da clínica.";
  return `Não foi possível ler a planilha: ${msg}`;
}
