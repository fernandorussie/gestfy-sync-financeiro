"use server";

import { headers } from "next/headers";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { avaliarIndicador } from "@/lib/checkpoint/avaliar";
import type { StatusCheckpoint } from "@/lib/checkpoint/avaliar";
import { coletarFontesDoCliente, testarFontePersonalizada } from "@/lib/fechamentos/servidor";
import {
  FONTES_CHECKPOINT, LIMITE_POR_CADENCIA, cadenciaDa, idPersonalizadaCheckpoint, leituraDasLinhas, linhasDaFonte,
  type Cadencia,
} from "@/lib/checkpoint/fontes";

export interface ResultadoIndicador {
  /** Fonte conferida: "vendas", "nps"… ou "pers:<id>" para as personalizadas. */
  indicador:  string;
  label:      string;
  /** Sugestão do sistema; a tela deixa o usuário trocar. */
  status:     StatusCheckpoint;
  observacao: string;
  /** false = sem leitura automática, nasce em branco para preenchimento manual. */
  automatico: boolean;
  /** Resumo factual da leitura (read-only na tela). */
  detalhe:    string;
  /** Régua de atraso aplicada: diária (2 dias úteis) ou semanal (5). */
  cadencia:   Cadencia;
}

export interface ResultadoCheckpointClinica {
  clinicaId:   string;
  clinicaNome: string;
  indicadores: ResultadoIndicador[];
  /** Cliente sem nenhuma fonte para conferir. */
  semIndicadores: boolean;
  erros: string[];
}

/**
 * Roda o checkpoint de um cliente sobre todas as fontes de dados dele
 * (as mesmas planilhas dos relatórios Semanal, Quinzenal e Mensal).
 *
 * Não há período a escolher: o checkpoint sempre olha de hoje para trás. O
 * atraso do lançamento é medido em dias úteis até hoje, e a conferência de
 * categoria cobre o mês corrente (do dia 01 até hoje).
 */
export async function rodarCheckpointClinica(params: {
  clinicaId: string;
}): Promise<ResultadoCheckpointClinica> {
  const h = await headers();
  const { clinicaId } = params;
  const base: ResultadoCheckpointClinica = { clinicaId, clinicaNome: "", indicadores: [], semIndicadores: false, erros: [] };

  if (!checkRateLimit(rateLimitKey(h), 20)) {
    return { ...base, erros: ["Limite de requisições atingido. Aguarde 1 minuto."] };
  }

  const db = getSupabaseAdmin();
  const [{ data: clinica }, { data: feriados }] = await Promise.all([
    db.from("clinicas").select("id, nome").eq("id", clinicaId).single(),
    db.from("feriados").select("data"),
  ]);
  if (!clinica) return { ...base, erros: ["Cliente não encontrado."] };
  const nome = clinica.nome;
  const feriadosData = (feriados ?? []).map((f) => f.data);
  const hoje = new Date();

  let fonte: Awaited<ReturnType<typeof coletarFontesDoCliente>>;
  try {
    // Sempre lê de novo: o checkpoint existe justamente para ver o que entrou agora.
    fonte = await coletarFontesDoCliente(clinicaId, true);
  } catch (e) {
    return { ...base, clinicaNome: nome, erros: [`Não foi possível ler as fontes de dados: ${e instanceof Error ? e.message : String(e)}`] };
  }
  const { coleta, regras, fontes, extras } = fonte;

  const avaliar = (indicador: string, label: string, cadencia: Cadencia, r: { linhas?: { data: string; categoria?: string }[]; erro?: string | null }, comCategoria: boolean): ResultadoIndicador => {
    const a = avaliarIndicador({
      leitura: r.erro ? null : leituraDasLinhas(r.linhas ?? [], hoje, comCategoria),
      erro: r.erro ?? null,
      temCategoria: comCategoria,
      limiteDiasUteis: LIMITE_POR_CADENCIA[cadencia],
      referencia: hoje,
      feriados: feriadosData,
    });
    return { indicador, label, cadencia, ...a };
  };

  const indicadores: ResultadoIndicador[] = [];
  for (const f of FONTES_CHECKPOINT) {
    if (!fontes[f.id]) continue;
    const cad = cadenciaDa(f.id, regras, f.padrao);
    if (cad === "nao") continue;
    const erro = coleta.erros[f.id];
    indicadores.push(avaliar(f.id, f.rotulo, cad, erro ? { erro } : { linhas: linhasDaFonte(coleta.dados, f.id) }, f.categoria));
  }
  const pers = extras.filter((x) => x.sheetId && x.aba && cadenciaDa(idPersonalizadaCheckpoint(x.id), regras) !== "nao");
  const lidas = await Promise.all(pers.map(async (x) => ({ x, r: await testarFontePersonalizada(x) })));
  for (const { x, r } of lidas) {
    const cad = cadenciaDa(idPersonalizadaCheckpoint(x.id), regras) as Cadencia;
    indicadores.push(avaliar(idPersonalizadaCheckpoint(x.id), x.nome, cad, r.erro ? { erro: r.erro } : { linhas: (r.leitura?.linhas ?? []).map((l) => ({ data: l.data })) }, false));
  }

  return { clinicaId, clinicaNome: nome, indicadores, semIndicadores: indicadores.length === 0, erros: [] };
}
