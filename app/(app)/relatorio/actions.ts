"use server";

import { headers } from "next/headers";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { coletarPreConsulta } from "@/lib/coletores/pre-consulta";
import { coletarNPS } from "@/lib/coletores/nps";
import { coletarAvaliacoesGoogle } from "@/lib/coletores/google-places";
import type { AvaliacaoGoogle } from "@/lib/coletores/google-places";
import { coletarLeads } from "@/lib/coletores/leads";
import type { ResultadoLeads } from "@/lib/coletores/leads";
import { coletarMetas } from "@/lib/coletores/metas";
import { coletarFaturamento } from "@/lib/coletores/faturamento";
import { descreverPerformance, calcularPercentualMeta } from "@/lib/metas";
import { montarPesquisas, montarMetas } from "@/lib/relatorio/montar-whatsapp";
import { montarDadosImagem } from "@/lib/relatorio/montar-imagem-dados";
import { callGemini } from "@/lib/ia/gemini";
import type { SugestaoIA } from "@/lib/ia/gemini";
import { montarContextoIA, SYSTEM_PROMPT } from "@/lib/ia/montar-contexto";
import type { RelatorioGeradoInsert } from "@/lib/supabase/types";
import type { RelatorioImagemData } from "@/lib/relatorio/imagem-tipos";

interface GerarParams {
  clinicaId: string;
  ini: string;
  fim: string;
  formato: "whatsapp_pesquisas" | "whatsapp_metas" | "imagem";
  googleManual?: string;
  googleManualAvaliacoes?: AvaliacaoGoogle[];
  leadsManual?: { total: number; convertidos: number };
}

function leadsFromManual(m: { total: number; convertidos: number }): ResultadoLeads {
  const { total, convertidos } = m;
  return {
    total,
    convertidos,
    taxa_conversao: total > 0 ? Math.round((convertidos / total) * 1000) / 10 : null,
  };
}

export async function gerarRelatorioWhatsapp(
  params: GerarParams
): Promise<{ texto: string; erros: string[] }> {
  const h = await headers();
  if (!checkRateLimit(rateLimitKey(h), 10)) {
    return { texto: "", erros: ["Limite de requisições atingido. Aguarde 1 minuto."] };
  }

  const { clinicaId, ini, fim, formato, googleManual, googleManualAvaliacoes, leadsManual } = params;
  const erros: string[] = [];

  const db = getSupabaseAdmin();

  const [iniY, iniM, iniD] = ini.split("-").map(Number);
  const [fimY, fimM, fimD] = fim.split("-").map(Number);
  const dataInicio    = new Date(iniY, iniM - 1, iniD);
  const dataFim       = new Date(fimY, fimM - 1, fimD);
  const primeroDiaMes = new Date(fimY, fimM - 1, 1); // dia 01 do mês da data_fim

  const { data: clinica } = await db
    .from("clinicas")
    .select("*")
    .eq("id", clinicaId)
    .single();

  if (!clinica) return { texto: "", erros: ["Cliente não encontrado."] };

  let texto = "";

  if (formato === "whatsapp_pesquisas") {
    const { data: fontes } = await db
      .from("fontes_dados")
      .select("*")
      .eq("clinica_id", clinicaId);

    const fontePre  = fontes?.find((f) => f.tipo === "pre_consulta") ?? null;
    const fonteNps  = fontes?.find((f) => f.tipo === "nps")          ?? null;
    const fonteLead = fontes?.find((f) => f.tipo === "leads")        ?? null;

    const [preResult, npsResult, googleResult, metasResult] = await Promise.allSettled([
      fontePre
        ? coletarPreConsulta(fontePre, dataInicio, dataFim)
        : Promise.reject(new Error("Fonte Pré-Consulta não configurada")),
      fonteNps
        ? coletarNPS(fonteNps, dataInicio, dataFim)
        : Promise.reject(new Error("Fonte NPS não configurada")),
      clinica.google_place_id
        ? coletarAvaliacoesGoogle(clinica.google_place_id, dataInicio, dataFim)
        : Promise.reject(new Error("Google Place ID não configurado")),
      coletarMetas(clinicaId, dataFim),
    ]);

    const pre    = preResult.status    === "fulfilled" ? preResult.value    : null;
    const nps    = npsResult.status    === "fulfilled" ? npsResult.value    : null;
    const google = googleResult.status === "fulfilled" ? googleResult.value : null;
    const metas  = metasResult.status  === "fulfilled" ? metasResult.value  : [];

    if (preResult.status    === "rejected")
      erros.push(`Pré-Consulta: ${(preResult.reason as Error).message}`);
    if (npsResult.status    === "rejected")
      erros.push(`NPS: ${(npsResult.reason as Error).message}`);
    if (googleResult.status === "rejected") {
      erros.push(
        `Google: A consulta automática está indisponível (${(googleResult.reason as Error).message}). ` +
        `Confira as avaliações da semana no Google e insira manualmente no campo acima.`
      );
    } else if (google && google.total === 0 && !googleManualAvaliacoes?.length) {
      erros.push(
        `Google: A busca automática não encontrou avaliações neste período — a API do Google ` +
        `limita a ~5 avaliações curadas e pode não incluir as mais recentes. ` +
        `Confira no Google e insira manualmente se houver novas avaliações.`
      );
    }

    // Leads: manual prevalece; caso contrário, tenta planilha
    let leads: ResultadoLeads | null = null;
    if (leadsManual) {
      leads = leadsFromManual(leadsManual);
    } else if (fonteLead) {
      leads = await coletarLeads(fonteLead, dataInicio, dataFim).catch((e: Error) => {
        erros.push(`Leads: ${e.message}`);
        return null;
      });
    }

    const metaLeads = metas.find((m) => m.tipo_nome.toLowerCase().includes("lead")) ?? null;

    texto = montarPesquisas(
      clinica.nome,
      pre,
      nps,
      google,
      googleManual ?? null,
      dataInicio,
      dataFim,
      googleManualAvaliacoes,
      leads,
      metaLeads,
    );

  } else if (formato === "whatsapp_metas") {
    const [metasResult, { data: fontesData }] = await Promise.all([
      coletarMetas(clinicaId, dataFim).catch((err: Error) => {
        erros.push(`Metas: ${err.message}`);
        return [];
      }),
      db.from("fontes_dados").select("*").eq("clinica_id", clinicaId),
    ]);

    const fonteFaturamento = fontesData?.find((f) => f.tipo === "faturamento") ?? null;

    let metas = metasResult;

    // Se há planilha de faturamento, substitui o realizado da meta usando o ACUMULADO do mês
    if (fonteFaturamento) {
      const fatResult = await coletarFaturamento(fonteFaturamento, primeroDiaMes, dataFim).catch(() => null);
      if (fatResult != null) {
        metas = metas.map((m) => {
          if (!m.tipo_nome.toLowerCase().includes("faturamento")) return m;
          const newRealizado = fatResult.total_faturado;
          const performance  = descreverPerformance(newRealizado, m.meta_periodo, m.meta_mensal, m.tipo_comportamento);
          const pct_mensal   = calcularPercentualMeta(newRealizado, m.meta_mensal);
          return { ...m, realizado: newRealizado, performance, pct_mensal };
        });
      }
    }

    texto = montarMetas(clinica.nome, metas, dataInicio, dataFim);
  }

  if (texto) {
    const insert: RelatorioGeradoInsert = {
      clinica_id:         clinicaId,
      formato:            formato as "whatsapp_pesquisas" | "whatsapp_metas",
      data_inicio:        ini,
      data_fim:           fim,
      conteudo_markdown:  texto,
    };
    await db.from("relatorios_gerados").insert(insert);
  }

  return { texto, erros };
}

export async function prepararDadosImagem(params: {
  clinicaId: string;
  ini: string;
  fim: string;
  leadsManual?: { total: number; convertidos: number };
  /** Página 2 (feedbacks): só coleta comentários quando pedido. */
  incluirComentarios?: boolean;
  googleManualAvaliacoes?: AvaliacaoGoogle[];
}): Promise<{ dados: RelatorioImagemData; erros: string[] }> {
  const h = await headers();
  if (!checkRateLimit(rateLimitKey(h), 10)) {
    return { dados: {} as RelatorioImagemData, erros: ["Limite de requisições atingido. Aguarde 1 minuto."] };
  }

  const { clinicaId, ini, fim, leadsManual, incluirComentarios, googleManualAvaliacoes } = params;
  const erros: string[] = [];
  const db = getSupabaseAdmin();

  const [iniY, iniM, iniD] = ini.split("-").map(Number);
  const [fimY, fimM, fimD] = fim.split("-").map(Number);
  const dataInicio    = new Date(iniY, iniM - 1, iniD);
  const dataFim       = new Date(fimY, fimM - 1, fimD);
  const primeroDiaMes = new Date(fimY, fimM - 1, 1); // dia 01 do mês da data_fim → acumulado

  const { data: clinica } = await db
    .from("clinicas")
    .select("*")
    .eq("id", clinicaId)
    .single();

  if (!clinica) {
    return { dados: {} as RelatorioImagemData, erros: ["Cliente não encontrado."] };
  }

  const { data: fontes } = await db
    .from("fontes_dados")
    .select("*")
    .eq("clinica_id", clinicaId);

  const fontePre         = fontes?.find((f) => f.tipo === "pre_consulta") ?? null;
  const fonteNps         = fontes?.find((f) => f.tipo === "nps")          ?? null;
  const fonteLead        = fontes?.find((f) => f.tipo === "leads")        ?? null;
  const fonteFaturamento = fontes?.find((f) => f.tipo === "faturamento")  ?? null;

  // Duas chamadas de faturamento em paralelo: filtro (período selecionado) e acumulado (mês inteiro até data_fim)
  const [preResult, npsResult, googleResult, metasResult, fatFiltroResult, fatAcumResult] =
    await Promise.allSettled([
      fontePre
        ? coletarPreConsulta(fontePre, dataInicio, dataFim)
        : Promise.reject(new Error("Fonte Pré-Consulta não configurada")),
      fonteNps
        ? coletarNPS(fonteNps, dataInicio, dataFim)
        : Promise.reject(new Error("Fonte NPS não configurada")),
      clinica.google_place_id
        ? coletarAvaliacoesGoogle(clinica.google_place_id, dataInicio, dataFim)
        : Promise.reject(new Error("Google Place ID não configurado")),
      coletarMetas(clinicaId, dataFim),
      fonteFaturamento
        ? coletarFaturamento(fonteFaturamento, dataInicio, dataFim)          // filtro: período selecionado
        : Promise.reject(new Error("Fonte de faturamento não configurada")),
      fonteFaturamento
        ? coletarFaturamento(fonteFaturamento, primeroDiaMes, dataFim)       // acumulado: dia 01 → data_fim
        : Promise.reject(new Error("Fonte de faturamento não configurada")),
    ]);

  const pre       = preResult.status    === "fulfilled" ? preResult.value    : null;
  const nps       = npsResult.status    === "fulfilled" ? npsResult.value    : null;
  const google    = googleResult.status === "fulfilled" ? googleResult.value : null;
  const metas     = metasResult.status  === "fulfilled" ? metasResult.value  : [];
  const fatFiltro = fatFiltroResult.status === "fulfilled" ? fatFiltroResult.value : null;
  const fatAcum   = fatAcumResult.status   === "fulfilled" ? fatAcumResult.value   : null;

  if (preResult.status    === "rejected")
    erros.push(`Pré-Consulta: ${(preResult.reason as Error).message}`);
  if (npsResult.status    === "rejected")
    erros.push(`NPS: ${(npsResult.reason as Error).message}`);
  if (googleResult.status === "rejected")
    erros.push(`Google: ${(googleResult.reason as Error).message}`);
  if (metasResult.status  === "rejected")
    erros.push(`Metas: ${(metasResult.reason as Error).message}`);
  // Expõe erro de faturamento apenas quando a fonte está configurada (aba faltando etc.)
  if (fonteFaturamento && fatFiltroResult.status === "rejected")
    erros.push(`Faturamento: ${(fatFiltroResult.reason as Error).message}`);

  // Leads: manual prevalece; caso contrário, tenta planilha
  let leads: ResultadoLeads | null = null;
  if (leadsManual) {
    leads = leadsFromManual(leadsManual);
  } else if (fonteLead) {
    leads = await coletarLeads(fonteLead, dataInicio, dataFim).catch((e: Error) => {
      erros.push(`Leads: ${e.message}`);
      return null;
    });
  }

  const dados = montarDadosImagem(
    clinica,
    pre,
    nps,
    google,
    metas,
    dataInicio,
    dataFim,
    leads,
    fatFiltro?.total_faturado    ?? null,   // realizado_filtro: período selecionado
    fatAcum?.total_faturado      ?? null,   // realizadoAcumulado: dia 01 → data_fim
    fatFiltro?.por_categoria     ?? null,
    fatFiltro?.por_profissional  ?? null,
    incluirComentarios === true,
    googleManualAvaliacoes ?? null,
  );

  if (incluirComentarios && (dados.comentarios?.length ?? 0) === 0) {
    erros.push(
      "Feedbacks: nenhum comentário encontrado no período (NPS e Google). " +
      "A página de comentários não será gerada."
    );
  }

  return { dados, erros };
}

export async function salvarRelatorioImagem(params: {
  clinicaId: string;
  ini: string;
  fim: string;
  dados: RelatorioImagemData;
  relatorioId?: string;
}): Promise<{ id: string }> {
  const { clinicaId, ini, fim, dados, relatorioId } = params;
  const db = getSupabaseAdmin();

  if (relatorioId) {
    await db
      .from("relatorios_gerados")
      .update({ dados_json: dados as unknown as import("@/lib/supabase/types").Json })
      .eq("id", relatorioId);
    return { id: relatorioId };
  }

  const insert: RelatorioGeradoInsert = {
    clinica_id:  clinicaId,
    formato:     "imagem",
    data_inicio: ini,
    data_fim:    fim,
    dados_json:  dados as unknown as import("@/lib/supabase/types").Json,
  };

  const { data } = await db
    .from("relatorios_gerados")
    .insert(insert)
    .select("id")
    .single();

  return { id: data?.id ?? "" };
}

export type ResultadoSugestaoIA =
  | { ok: true; sugestoes: SugestaoIA }
  | { ok: false; erro: string };

export async function gerarSugestoesIA(
  dados: RelatorioImagemData,
): Promise<ResultadoSugestaoIA> {
  const h = await headers();
  if (!checkRateLimit(rateLimitKey(h), 10)) {
    return { ok: false, erro: "Limite de requisições atingido. Aguarde 1 minuto." };
  }

  try {
    const contexto  = montarContextoIA(dados);
    const sugestoes = await callGemini(SYSTEM_PROMPT, contexto);
    return { ok: true, sugestoes };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro ao gerar sugestões com IA." };
  }
}
