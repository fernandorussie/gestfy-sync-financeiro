/**
 * Fonte única do cliente: todas as planilhas ficam em fechamento_config.fontes
 * (+ fontes personalizadas) e servem ao Report Semanal, ao Checkpoint e aos
 * relatórios Quinzenal e Mensal.
 *
 * Antes, o Report Semanal e o Checkpoint tinham a própria configuração
 * (tabela fontes_dados, colunas por letra). Na primeira vez que o cliente é
 * aberto, o que só existia lá é trazido para a fonte única. A tabela antiga
 * não é apagada nem alterada: fica de reserva.
 */
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { FontesFechamento } from "@/lib/fechamentos/coleta";
import { REGRAS_PADRAO, type RegrasClinica } from "@/lib/fechamentos/indicadores";
import { normalizar } from "@/lib/fechamentos/texto";
import type { FonteDados, Json } from "@/lib/supabase/types";

type Nome = keyof FontesFechamento;
type Cfg = { sheetId: string; aba: string; colunas?: Record<string, string>; linhaCabecalho?: number };

/** Tipo antigo → fonte única, e coluna antiga (letra) → campo da fonte única. */
const MAPA: Record<string, { nome: Nome; rotulo: string; colunas: Record<string, string> }> = {
  faturamento: { nome: "vendas", rotulo: "Faturamento", colunas: { categoria: "categoria", valor_pago: "valor", profissional: "profissional" } },
  despesa: { nome: "despesas", rotulo: "Despesas", colunas: { categoria: "categoria", valor_pago: "valor" } },
  leads: { nome: "leads", rotulo: "Leads", colunas: { convertido: "status" } },
  nps: { nome: "nps", rotulo: "NPS", colunas: { nota_geral: "indicacao", nota_profissional: "profissional", nota_recepcao: "recepcao", nota_infraestrutura: "infraestrutura", nota_enfermagem: "enfermagem", comentario: "comentario", nome_paciente: "nome", anonimato: "anonimato", indicacao: "indicou" } },
  pre_consulta: { nome: "preConsulta", rotulo: "Pré-consulta", colunas: { motivo: "motivo", origem: "origem" } },
};
const CAMPO_DATA: Record<string, string> = { faturamento: "data", despesa: "dataPagamento", leads: "data", nps: "data", pre_consulta: "data" };
/** Campos que só existiam na configuração do Report Semanal: entram na fonte única quando é a mesma planilha. */
const SO_DO_SEMANAL: Partial<Record<Nome, string[]>> = { nps: ["comentario", "nome", "anonimato", "indicou"] };

const letra = (v: unknown) => (typeof v === "string" && /^[A-Z]{1,2}$/i.test(v.trim()) ? v.trim().toUpperCase() : null);

export interface ResultadoImportacao { fontes: FontesFechamento; regras: RegrasClinica; notas: string[]; mudou: boolean }

/** Regra pura (testável): junta a configuração antiga na fonte única. */
export function juntarFontes(fontes: FontesFechamento, regras: RegrasClinica, antigas: Pick<FonteDados, "tipo" | "sheet_id" | "aba_nome" | "coluna_data" | "mapeamento">[]): ResultadoImportacao {
  const out = { ...fontes } as Record<string, Cfg | undefined>;
  const r: RegrasClinica = { ...regras };
  const notas: string[] = [];
  let mudou = false;
  for (const a of antigas) {
    const m = MAPA[a.tipo];
    if (!m) continue;
    const map = (a.mapeamento && typeof a.mapeamento === "object" && !Array.isArray(a.mapeamento) ? a.mapeamento : {}) as Record<string, unknown>;
    const mensais = map.abas_mensais && typeof map.abas_mensais === "object" ? Object.keys(map.abas_mensais as object).length : 0;
    const atual = out[m.nome];
    const colunas: Record<string, string> = {};
    const d = letra(a.coluna_data); if (d) colunas[CAMPO_DATA[a.tipo]] = d;
    for (const [antigo, novo] of Object.entries(m.colunas)) { const l = letra(map[antigo]); if (l) colunas[novo] = l; }
    const linhaIni = Number(map.linha_inicial);

    if (!atual) {
      if (mensais || !a.aba_nome?.trim()) { notas.push(`${m.rotulo}: a configuração antiga usava uma aba por mês. Indique a aba-base em Fontes de dados.`); continue; }
      out[m.nome] = { sheetId: a.sheet_id, aba: a.aba_nome.trim(), colunas, ...(linhaIni > 2 ? { linhaCabecalho: linhaIni - 1 } : {}) };
      notas.push(`${m.rotulo}: trazida da configuração do Report Semanal.`);
      mudou = true;
    } else if (atual.sheetId === a.sheet_id && atual.aba.trim().toLowerCase() === (a.aba_nome ?? "").trim().toLowerCase()) {
      // Mesma planilha e aba: só acrescenta as colunas que só o Semanal conhecia.
      const extras = (SO_DO_SEMANAL[m.nome] ?? []).filter((c) => colunas[c] && !atual.colunas?.[c]);
      if (extras.length) { out[m.nome] = { ...atual, colunas: { ...(atual.colunas ?? {}), ...Object.fromEntries(extras.map((c) => [c, colunas[c]])) } }; mudou = true; }
    } else if (SO_DO_SEMANAL[m.nome]?.some((c) => colunas[c])) {
      notas.push(`${m.rotulo}: o Report Semanal lia outra planilha ou aba. Vale a da fonte única; confira as colunas de comentário, nome e anonimato.`);
    }

    // Leads: o valor que o Semanal contava como convertido passa a contar como agendamento.
    if (a.tipo === "leads" && typeof map.valor_conversao === "string" && map.valor_conversao.trim()) {
      const atuais = r.statusAgendou ?? [...REGRAS_PADRAO.statusAgendou];
      const v = normalizar(map.valor_conversao);
      if (!atuais.map(normalizar).includes(v)) { r.statusAgendou = [...atuais, map.valor_conversao.trim()]; mudou = true; }
    }
  }
  return { fontes: out as FontesFechamento, regras: r, notas, mudou };
}

/** Roda uma vez por cliente. Não apaga nada da configuração antiga. */
export async function garantirFontesUnicas(clinicaId: string): Promise<void> {
  const db = getSupabaseAdmin();
  const [{ data: cfg, error }, { data: antigas }] = await Promise.all([
    db.from("fechamento_config").select("clinica_id, fontes, regras").eq("clinica_id", clinicaId).maybeSingle(),
    db.from("fontes_dados").select("tipo, sheet_id, aba_nome, coluna_data, mapeamento").eq("clinica_id", clinicaId),
  ]);
  if (error) return;
  const regras = ((cfg?.regras ?? {}) as unknown as RegrasClinica);
  if (regras.fontesUnicasEm) return;
  const fontes = ((cfg?.fontes ?? {}) as unknown as FontesFechamento);
  const r = juntarFontes(fontes, regras, (antigas ?? []) as FonteDados[]);
  const novasRegras: RegrasClinica = { ...r.regras, fontesUnicasEm: new Date().toISOString(), ...(r.notas.length ? { fontesUnicasNotas: r.notas } : {}) };
  const linha = { fontes: r.fontes as unknown as Json, regras: novasRegras as unknown as Json, atualizado_em: new Date().toISOString() };
  if (cfg) await db.from("fechamento_config").update(linha).eq("clinica_id", clinicaId);
  else await db.from("fechamento_config").insert({ clinica_id: clinicaId, ...linha });
}
