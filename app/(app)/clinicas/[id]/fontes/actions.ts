"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  preConsultaSchema,
  npsSchema,
  leadsSchema,
  faturamentoSchema,
  despesaSchema,
} from "./_schemas";
import { coletarFaturamento, type ResultadoFaturamento } from "@/lib/coletores/faturamento";
import { coletarDespesa,    type ResultadoDespesa }      from "@/lib/coletores/despesa";
import type { Json, TipoFonte } from "@/lib/supabase/types";

function buildMapeamento(tipo: TipoFonte, data: Record<string, unknown>): Record<string, unknown> {
  const m: Record<string, unknown> = {};
  const add = (key: string) => { if (data[key]) m[key] = String(data[key]); };

  if (tipo === "pre_consulta") {
    add("motivo");
    add("origem");
  } else if (tipo === "nps") {
    add("nota_geral");
    add("nota_profissional");
    add("nota_recepcao");
    add("nota_infraestrutura");
    add("nota_enfermagem");
    add("comentario");
    add("nome_paciente");
    add("anonimato");
    add("indicacao");
  } else if (tipo === "leads") {
    add("convertido");
    if (data.valor_conversao) m.valor_conversao = String(data.valor_conversao);
    const li = Number(data.linha_inicial);
    if (li > 2) m.linha_inicial = String(li);
  } else if (tipo === "faturamento") {
    add("categoria");
    add("valor_pago");
    add("profissional");
    const li = Number(data.linha_inicial);
    if (li > 2) m.linha_inicial = String(li);
    m.abas_mensais = (data.abas_mensais && typeof data.abas_mensais === "object") ? data.abas_mensais : {};
  } else {
    // despesa
    add("categoria");
    add("valor_pago");
    const li = Number(data.linha_inicial);
    if (li > 2) m.linha_inicial = String(li);
    m.abas_mensais = (data.abas_mensais && typeof data.abas_mensais === "object") ? data.abas_mensais : {};
  }
  return m;
}

export async function upsertFonte(
  clinicaId: string,
  tipo: TipoFonte,
  rawData: unknown
) {
  const schema =
    tipo === "pre_consulta" ? preConsultaSchema :
    tipo === "nps"          ? npsSchema          :
    tipo === "leads"        ? leadsSchema         :
    tipo === "faturamento"  ? faturamentoSchema   :
                              despesaSchema;

  const parsed = schema.safeParse(rawData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Para fontes financeiras o schema usa aba_resumo (sem aba_nome fixa)
  const data        = parsed.data as Record<string, unknown>;
  const sheet_id    = String(data.sheet_id   ?? "");
  const coluna_data = String(data.coluna_data ?? "");
  const aba_nome    = (tipo === "faturamento" || tipo === "despesa")
    ? String(data.aba_resumo ?? "")
    : String(data.aba_nome   ?? "");
  const mapeamento  = buildMapeamento(tipo, data);

  const db = getSupabaseAdmin();
  const { data: existing } = await db
    .from("fontes_dados")
    .select("id")
    .eq("clinica_id", clinicaId)
    .eq("tipo", tipo)
    .maybeSingle();

  const payload = {
    sheet_id,
    aba_nome,
    coluna_data,
    mapeamento: mapeamento as unknown as Json,
    ativo: true,
  };

  const { error } = existing?.id
    ? await db.from("fontes_dados").update(payload).eq("id", existing.id)
    : await db.from("fontes_dados").insert({ ...payload, clinica_id: clinicaId, tipo });

  if (error) return { error: error.message };
  revalidatePath(`/clientes/${clinicaId}`);
  return { ok: true };
}

export async function deleteFonte(clinicaId: string, tipo: TipoFonte) {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("fontes_dados")
    .delete()
    .eq("clinica_id", clinicaId)
    .eq("tipo", tipo);
  if (error) return { error: error.message };
  revalidatePath(`/clientes/${clinicaId}`);
  return { ok: true };
}

// ── Teste provisório de leitura de fontes financeiras ─────────────────────────

export type TesteResultadoFat =
  | { ok: true; tipo: "faturamento"; resultado: ResultadoFaturamento }
  | { erro: string };

export type TesteResultadoDesp =
  | { ok: true; tipo: "despesa"; resultado: ResultadoDespesa }
  | { erro: string };

export async function testarLeituraFaturamento(
  clinicaId: string,
  dataInicioStr: string,
  dataFimStr: string
): Promise<TesteResultadoFat> {
  try {
    const db = getSupabaseAdmin();
    const { data: fonte } = await db
      .from("fontes_dados")
      .select("*")
      .eq("clinica_id", clinicaId)
      .eq("tipo", "faturamento")
      .maybeSingle();

    if (!fonte) return { erro: "Fonte de faturamento não configurada." };

    const ini = new Date(dataInicioStr + "T00:00:00");
    const fim = new Date(dataFimStr   + "T00:00:00");
    if (isNaN(ini.getTime()) || isNaN(fim.getTime())) return { erro: "Datas inválidas." };

    const resultado = await coletarFaturamento(fonte, ini, fim);
    return { ok: true, tipo: "faturamento", resultado };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Erro ao ler planilha." };
  }
}

export async function testarLeituraDespesa(
  clinicaId: string,
  dataInicioStr: string,
  dataFimStr: string
): Promise<TesteResultadoDesp> {
  try {
    const db = getSupabaseAdmin();
    const { data: fonte } = await db
      .from("fontes_dados")
      .select("*")
      .eq("clinica_id", clinicaId)
      .eq("tipo", "despesa")
      .maybeSingle();

    if (!fonte) return { erro: "Fonte de despesa não configurada." };

    const ini = new Date(dataInicioStr + "T00:00:00");
    const fim = new Date(dataFimStr   + "T00:00:00");
    if (isNaN(ini.getTime()) || isNaN(fim.getTime())) return { erro: "Datas inválidas." };

    const resultado = await coletarDespesa(fonte, ini, fim);
    return { ok: true, tipo: "despesa", resultado };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Erro ao ler planilha." };
  }
}
