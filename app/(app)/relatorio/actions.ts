"use server";

import { headers } from "next/headers";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { coletarAvaliacoesGoogle } from "@/lib/coletores/google-places";
import type { AvaliacaoGoogle } from "@/lib/coletores/google-places";
import type { ResultadoLeads } from "@/lib/coletores/leads";
import { coletarMetas } from "@/lib/coletores/metas";
import { coletarFontesDoCliente } from "@/lib/fechamentos/servidor";
import { reportSemanalDaFonte } from "@/lib/relatorio/fonte-unica";
import { limparSemanal, ligado } from "@/lib/relatorio/estrutura-semanal";
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

/**
 * Lê as planilhas do cliente pela fonte única (a mesma do Checkpoint e dos
 * relatórios Quinzenal e Mensal) e recorta o período do report.
 */
async function dadosDaFonteUnica(clinicaId: string, dataInicio: Date, dataFim: Date, erros: string[]) {
  try {
    const { coleta, regras, fontes } = await coletarFontesDoCliente(clinicaId);
    const nomes = { vendas: "Faturamento", nps: "NPS", leads: "Leads", preConsulta: "Pré-Consulta" } as const;
    for (const [k, rot] of Object.entries(nomes) as [keyof typeof nomes, string][]) {
      const e = coleta.erros[k];
      if (e) erros.push(`${rot}: ${e}`);
      else if (!fontes[k] && (k === "nps" || k === "preConsulta")) erros.push(`${rot}: fonte não configurada em Clientes → Fontes de dados`);
    }
    return reportSemanalDaFonte(coleta.dados, regras, dataInicio, dataFim);
  } catch (e) {
    erros.push(`Planilhas: ${e instanceof Error ? e.message : "não foi possível ler as fontes de dados do cliente."}`);
    return { pre: null, nps: null, leads: null, fatFiltro: null, fatAcum: null };
  }
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
  const { data: clinica } = await db
    .from("clinicas")
    .select("*")
    .eq("id", clinicaId)
    .single();

  if (!clinica) return { texto: "", erros: ["Cliente não encontrado."] };

  let texto = "";

  if (formato === "whatsapp_pesquisas") {
    const [fonte, googleResult, metasResult] = await Promise.all([
      dadosDaFonteUnica(clinicaId, dataInicio, dataFim, erros),
      clinica.google_place_id
        ? coletarAvaliacoesGoogle(clinica.google_place_id, dataInicio, dataFim).then((v) => ({ ok: true as const, v }), (e: Error) => ({ ok: false as const, e }))
        : Promise.resolve({ ok: false as const, e: new Error("Google Place ID não configurado") }),
      coletarMetas(clinicaId, dataFim).catch(() => []),
    ]);

    const pre    = fonte.pre;
    const nps    = fonte.nps;
    const google = googleResult.ok ? googleResult.v : null;
    const metas  = metasResult;

    if (!googleResult.ok) {
      erros.push(
        `Google: A consulta automática está indisponível (${googleResult.e.message}). ` +
        `Confira as avaliações da semana no Google e insira manualmente no campo acima.`
      );
    } else if (google && google.total === 0 && !googleManualAvaliacoes?.length) {
      erros.push(
        `Google: A busca automática não encontrou avaliações neste período — a API do Google ` +
        `limita a ~5 avaliações curadas e pode não incluir as mais recentes. ` +
        `Confira no Google e insira manualmente se houver novas avaliações.`
      );
    }

    // Leads: manual prevalece; caso contrário, vem da planilha
    const leads: ResultadoLeads | null = leadsManual ? leadsFromManual(leadsManual) : fonte.leads;

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
    const [metasResult, fonte] = await Promise.all([
      coletarMetas(clinicaId, dataFim).catch((err: Error) => {
        erros.push(`Metas: ${err.message}`);
        return [];
      }),
      dadosDaFonteUnica(clinicaId, dataInicio, dataFim, erros),
    ]);

    let metas = metasResult;

    // Com a planilha de vendas, o realizado da meta de faturamento é o ACUMULADO do mês (dia 01 → data fim)
    if (fonte.fatAcum) {
      const newRealizado = fonte.fatAcum.total_faturado;
      metas = metas.map((m) => {
        if (!m.tipo_nome.toLowerCase().includes("faturamento")) return m;
        const performance  = descreverPerformance(newRealizado, m.meta_periodo, m.meta_mensal, m.tipo_comportamento);
        const pct_mensal   = calcularPercentualMeta(newRealizado, m.meta_mensal);
        return { ...m, realizado: newRealizado, performance, pct_mensal };
      });
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

  const { data: clinica } = await db
    .from("clinicas")
    .select("*")
    .eq("id", clinicaId)
    .single();

  if (!clinica) {
    return { dados: {} as RelatorioImagemData, erros: ["Cliente não encontrado."] };
  }

  // Estrutura do Semanal do cliente (blocos e ordem); sem estrutura salva, vale o padrão.
  const { data: cfgRel } = await db.from("fechamento_config").select("relatorio").eq("clinica_id", clinicaId).maybeSingle();
  const estrutura = limparSemanal((cfgRel?.relatorio as { semanal?: unknown } | null)?.semanal);
  const comFeedbacks = incluirComentarios === true && ligado(estrutura.secoes, "feedbacks");
  if (incluirComentarios && !comFeedbacks) erros.push("Feedbacks: a página de feedbacks está desligada na estrutura do Semanal deste cliente (Clientes → Estrutura dos relatórios).");

  const [fonte, googleResult, metasResult] = await Promise.all([
    dadosDaFonteUnica(clinicaId, dataInicio, dataFim, erros),
    clinica.google_place_id
      ? coletarAvaliacoesGoogle(clinica.google_place_id, dataInicio, dataFim).then((v) => ({ ok: true as const, v }), (e: Error) => ({ ok: false as const, e }))
      : Promise.resolve({ ok: false as const, e: new Error("Google Place ID não configurado") }),
    coletarMetas(clinicaId, dataFim).then((v) => ({ ok: true as const, v }), (e: Error) => ({ ok: false as const, e })),
  ]);

  const pre       = fonte.pre;
  const nps       = fonte.nps;
  const google    = googleResult.ok ? googleResult.v : null;
  const metas     = metasResult.ok ? metasResult.v : [];
  const fatFiltro = fonte.fatFiltro;
  const fatAcum   = fonte.fatAcum;

  if (!googleResult.ok) erros.push(`Google: ${googleResult.e.message}`);
  if (!metasResult.ok) erros.push(`Metas: ${metasResult.e.message}`);

  // Leads: manual prevalece; caso contrário, vem da planilha
  const leads: ResultadoLeads | null = leadsManual ? leadsFromManual(leadsManual) : fonte.leads;

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
    comFeedbacks,
    googleManualAvaliacoes ?? null,
  );
  dados.estrutura = estrutura;

  if (comFeedbacks && (dados.comentarios?.length ?? 0) === 0) {
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
