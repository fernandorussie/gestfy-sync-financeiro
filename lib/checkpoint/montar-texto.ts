import { format } from "date-fns";
import type { StatusCheckpoint } from "./avaliar";

/** Forma mínima que o texto precisa — a tela passa suas linhas editadas. */
export interface IndicadorTexto {
  label: string;
  status: StatusCheckpoint;
  observacao: string;
}

export interface ClinicaTexto {
  clinicaNome: string;
  indicadores: IndicadorTexto[];
  semIndicadores?: boolean;
}

const MARCA: Record<"ok" | "atencao" | "branco", string> = {
  ok:      "✅",
  atencao: "⚠️",
  branco:  "⬜",
};

function marcaDe(status: StatusCheckpoint): string {
  if (status === "ok") return MARCA.ok;
  if (status === "atencao") return MARCA.atencao;
  return MARCA.branco;
}

function limpar(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  return String(v).trim();
}

/**
 * Monta o texto do checkpoint para colar no WhatsApp.
 *
 * Usa o que está na tela — inclusive o que o usuário editou por cima da
 * sugestão automática. Clínica sem indicador ativo e indicador sem texto
 * algum não viram linha vazia no meio da mensagem.
 */
export function montarTextoCheckpoint(clinicas: ClinicaTexto[], hoje: Date): string {
  const linhas: string[] = [];
  linhas.push(`*CHECKPOINT · ${format(hoje, "dd/MM/yyyy")}*`);

  for (const clinica of clinicas) {
    const nome = limpar(clinica.clinicaNome) || "Cliente";
    linhas.push("");
    linhas.push(`*${nome}*`);

    if (clinica.semIndicadores || clinica.indicadores.length === 0) {
      linhas.push("_Sem indicadores ativos._");
      continue;
    }

    for (const ind of clinica.indicadores) {
      const label = limpar(ind.label);
      if (!label) continue;
      const obs = limpar(ind.observacao);
      linhas.push(`${marcaDe(ind.status)} ${label}${obs ? ` — ${obs}` : ""}`);
    }
  }

  // Legenda só quando há algo pendente de preenchimento
  const temBranco = clinicas.some((c) =>
    !c.semIndicadores && c.indicadores.some((i) => i.status === null)
  );
  if (temBranco) {
    linhas.push("");
    linhas.push(`_${MARCA.branco} = a confirmar_`);
  }

  return linhas.join("\n").trimEnd();
}

/** Contagem usada no cabeçalho do infográfico e no resumo da tela. */
export function resumoStatus(clinicas: ClinicaTexto[]): {
  ok: number; atencao: number; branco: number; total: number;
} {
  let ok = 0, atencao = 0, branco = 0;
  for (const c of clinicas) {
    if (c.semIndicadores) continue;
    for (const i of c.indicadores) {
      if (i.status === "ok") ok++;
      else if (i.status === "atencao") atencao++;
      else branco++;
    }
  }
  return { ok, atencao, branco, total: ok + atencao + branco };
}
