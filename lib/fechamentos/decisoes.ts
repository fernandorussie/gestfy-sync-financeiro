/**
 * Decisões da conferência.
 *
 * O fechamento guarda só o registro do que o consultor decidiu em cada
 * alerta. Ajustes, meta escolhida e o que ainda bloqueia a análise são
 * derivados desse registro. Desfazer = tirar a decisão do registro.
 */
import type { Alerta, Sugestao } from "./conferencia";
import type { Ajustes } from "./indicadores";
import { GRUPOS_ENTRADA, type GrupoEntrada } from "./entradas";
import { normalizar } from "./texto";

/** aplicar = seguir a sugestão do alerta; manter = deixar como está (vale também para "ciente"). */
export type AcaoDecisao = "aplicar" | "manter";

export interface Decisao {
  chave: string;
  acao: AcaoDecisao;
  /** Cópia da sugestão no momento da decisão (o alerta some depois de aplicado). */
  sugestao?: Sugestao;
  /** Para "escolher-meta" e "classificar": o que foi escolhido. */
  escolha?: { meta?: number; grupos?: Record<string, string>; entradas?: Record<string, GrupoEntrada> };
  titulo: string;
  em: string;
}

export interface Decisoes {
  registro: Decisao[];
}

export function decisoesVazias(): Decisoes {
  return { registro: [] };
}

/** Acrescenta (ou troca) a decisão de um alerta. */
export function decidir(d: Decisoes, alerta: Alerta, acao: AcaoDecisao, escolha?: Decisao["escolha"], agora = new Date()): Decisoes {
  const resto = d.registro.filter((x) => x.chave !== alerta.chave);
  return { registro: [...resto, { chave: alerta.chave, acao, sugestao: alerta.sugestao, escolha, titulo: alerta.titulo, em: agora.toISOString() }] };
}

export function desfazer(d: Decisoes, chave: string): Decisoes {
  return { registro: d.registro.filter((x) => x.chave !== chave) };
}

/** Ajustes de cálculo que saem das decisões "aplicar". */
export function ajustesDasDecisoes(d: Decisoes): Ajustes {
  const ajustes: Ajustes = { reclassificarDespesa: {}, unificar: {} };
  for (const x of d.registro) {
    if (x.acao !== "aplicar" || !x.sugestao) continue;
    if (x.sugestao.tipo === "reclassificar") {
      for (const linha of x.sugestao.linhas) ajustes.reclassificarDespesa![linha] = x.sugestao.categoria;
    } else if (x.sugestao.tipo === "unificar") {
      const campo = x.sugestao.campo;
      const atual = ajustes.unificar![campo] ?? {};
      for (const de of x.sugestao.de) atual[de] = x.sugestao.para;
      ajustes.unificar![campo] = atual;
    }
  }
  return ajustes;
}

/** Meta escolhida na conferência (null = nenhuma escolha registrada). */
export function metaEscolhida(d: Decisoes): number | null {
  const x = [...d.registro].reverse().find((r) => r.escolha?.meta);
  return x?.escolha?.meta ?? null;
}

/** Categoria de despesa → grupo, escolhidos em alertas "fora do plano". Vão para as regras da clínica. */
export function gruposEscolhidos(d: Decisoes): Record<string, string> {
  const out: Record<string, string> = {};
  for (const x of d.registro) Object.assign(out, x.escolha?.grupos ?? {});
  return out;
}

/** Categoria de entrada (normalizada) → grupo, escolhidos na conferência. Vão para as regras da clínica. */
export function entradasEscolhidas(d: Decisoes): Record<string, GrupoEntrada> {
  const out: Record<string, GrupoEntrada> = {};
  for (const x of d.registro) for (const [c, g] of Object.entries(x.escolha?.entradas ?? {})) if (GRUPOS_ENTRADA.includes(g)) out[normalizar(c)] = g;
  return out;
}

/** Alertas graves sem decisão. Enquanto houver algum, a análise fica bloqueada. */
export function gravesPendentes(alertas: Alerta[], d: Decisoes): Alerta[] {
  const decididos = new Set(d.registro.map((x) => x.chave));
  return alertas.filter((a) => a.gravidade === "grave" && !decididos.has(a.chave));
}

/** O que a tela mostra como "resolvido": decisões cujo alerta já não aparece ou foi mantido. */
export function situacao(alerta: Alerta, d: Decisoes): Decisao | null {
  return d.registro.find((x) => x.chave === alerta.chave) ?? null;
}
