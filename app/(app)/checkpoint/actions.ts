"use server";

import { headers } from "next/headers";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { lerFonteCheckpoint } from "@/lib/coletores/checkpoint";
import { avaliarIndicador } from "@/lib/checkpoint/avaliar";
import type { StatusCheckpoint } from "@/lib/checkpoint/avaliar";
import {
  resolverAtivos, INDICADOR_FONTE, INDICADOR_LABEL, INDICADOR_TEM_CATEGORIA,
  INDICADOR_LIMITE_DIAS_UTEIS, INDICADOR_CADENCIA,
} from "@/lib/checkpoint/indicadores";
import type { NomeIndicador, TipoFonte, FonteDados } from "@/lib/supabase/types";

export interface ResultadoIndicador {
  indicador:  NomeIndicador;
  label:      string;
  /** Sugestão do sistema; a tela deixa o usuário trocar. */
  status:     StatusCheckpoint;
  observacao: string;
  /** false = sem planilha, nasce em branco para preenchimento manual. */
  automatico: boolean;
  /** Resumo factual da leitura (read-only na tela). */
  detalhe:    string;
  /** Régua de atraso aplicada: diária (2 dias úteis) ou semanal (5). */
  cadencia:   "diaria" | "semanal";
}

export interface ResultadoCheckpointClinica {
  clinicaId:   string;
  clinicaNome: string;
  indicadores: ResultadoIndicador[];
  /** Clínica sem nenhum indicador ativo ainda. */
  semIndicadores: boolean;
  erros: string[];
}

/**
 * Roda o checkpoint de uma clínica.
 *
 * Não há período a escolher: o checkpoint sempre olha de hoje para trás. O
 * atraso do lançamento é medido em dias úteis até hoje, e a conferência de
 * categoria cobre o mês corrente (do dia 01 até hoje) — mesma janela que o
 * relatório usa no acumulado do mês, então uma categoria em branco no começo
 * do mês não passa despercebida.
 */
export async function rodarCheckpointClinica(params: {
  clinicaId: string;
}): Promise<ResultadoCheckpointClinica> {
  const h = await headers();
  const { clinicaId } = params;

  const base: ResultadoCheckpointClinica = {
    clinicaId, clinicaNome: "", indicadores: [], semIndicadores: false, erros: [],
  };

  if (!checkRateLimit(rateLimitKey(h), 20)) {
    return { ...base, erros: ["Limite de requisições atingido. Aguarde 1 minuto."] };
  }

  const db = getSupabaseAdmin();

  const [{ data: clinica }, { data: fontes }, { data: linhas }, { data: feriados }] =
    await Promise.all([
      db.from("clinicas").select("id, nome").eq("id", clinicaId).single(),
      db.from("fontes_dados").select("*").eq("clinica_id", clinicaId),
      db.from("checkpoint_indicadores").select("indicador, ativo").eq("clinica_id", clinicaId),
      db.from("feriados").select("data"),
    ]);

  if (!clinica) return { ...base, erros: ["Cliente não encontrado."] };

  const nome         = clinica.nome;
  const tiposFonte   = (fontes ?? []).map((f) => f.tipo as TipoFonte);
  const ativos       = resolverAtivos(linhas ?? [], tiposFonte);
  const feriadosData = (feriados ?? []).map((f) => f.data);

  if (ativos.length === 0) {
    return { ...base, clinicaNome: nome, semIndicadores: true };
  }

  const hoje    = new Date();
  const dataFim = hoje;
  const dataIni = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  const indicadores = await Promise.all(
    ativos.map(async (indicador): Promise<ResultadoIndicador> => {
      const tipoFonte = INDICADOR_FONTE[indicador];
      const fonte = tipoFonte
        ? ((fontes ?? []).find((f) => f.tipo === tipoFonte) as FonteDados | undefined)
        : undefined;

      // Sem planilha: nada é calculado, o indicador nasce em branco.
      const comum = {
        temCategoria:    INDICADOR_TEM_CATEGORIA[indicador],
        limiteDiasUteis: INDICADOR_LIMITE_DIAS_UTEIS[indicador],
        referencia:      hoje,
        feriados:        feriadosData,
      };
      const cadencia = INDICADOR_CADENCIA[indicador];

      if (!fonte) {
        const a = avaliarIndicador({ leitura: null, ...comum });
        return { indicador, label: INDICADOR_LABEL[indicador], cadencia, ...a };
      }

      try {
        const leitura = await lerFonteCheckpoint(fonte, dataIni, dataFim, hoje);
        const a = avaliarIndicador({ leitura, ...comum });
        return { indicador, label: INDICADOR_LABEL[indicador], cadencia, ...a };
      } catch (e) {
        const a = avaliarIndicador({
          leitura: null,
          erro: e instanceof Error ? e.message : String(e),
          ...comum,
        });
        return { indicador, label: INDICADOR_LABEL[indicador], cadencia, ...a };
      }
    })
  );

  return { clinicaId, clinicaNome: nome, indicadores, semIndicadores: false, erros: [] };
}
