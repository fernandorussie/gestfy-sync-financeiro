/**
 * Report Semanal a partir da fonte única do cliente.
 *
 * As planilhas são lidas uma vez (lib/fechamentos/coleta), com a mesma
 * configuração usada no Checkpoint e nos relatórios Quinzenal e Mensal. Aqui
 * os registros são recortados no período do report e devolvidos no mesmo
 * formato que os coletores antigos do Report Semanal devolviam, para que a
 * montagem da imagem e dos textos não mude.
 */
import type { DadosFechamento, RegrasClinica } from "@/lib/fechamentos/indicadores";
import { REGRAS_PADRAO } from "@/lib/fechamentos/indicadores";
import { normalizar } from "@/lib/fechamentos/texto";
import type { Lead, RespostaNps, RespostaPreConsulta, Venda } from "@/lib/fechamentos/leitores";
import { contar, type ResultadoPreConsulta } from "@/lib/coletores/pre-consulta";
import { parseTelefoneIndicacao, resolverNomePaciente, type ComentarioNPS, type Indicacao, type ResultadoNPS } from "@/lib/coletores/nps";
import type { ResultadoLeads } from "@/lib/coletores/leads";
import { buildGrupo, type GrupoFinanceiro } from "@/lib/coletores/faturamento";

/** Data local → "AAAA-MM-DD" (os registros guardam a data nesse formato). */
export function isoDe(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const dentro = (data: string, ini: string, fim: string) => data >= ini && data <= fim;

export function preConsultaDoPeriodo(rs: RespostaPreConsulta[], ini: Date, fim: Date): ResultadoPreConsulta {
  const a = isoDe(ini), b = isoDe(fim);
  const doPeriodo = rs.filter((r) => dentro(r.data, a, b));
  return {
    total: doPeriodo.length,
    motivos: contar(doPeriodo.map((r) => r.motivo)),
    origens: contar(doPeriodo.map((r) => r.origem)),
  };
}

const media = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};

export function npsDoPeriodo(rs: RespostaNps[], ini: Date, fim: Date): ResultadoNPS {
  const a = isoDe(ini), b = isoDe(fim);
  const doPeriodo = rs.filter((r) => dentro(r.data, a, b));
  let promotores = 0, neutros = 0, detratores = 0;
  const notas: number[] = [];
  const comentarios: ComentarioNPS[] = [];
  const indicacoes: Indicacao[] = [];
  for (const r of doPeriodo) {
    if (r.indicacao !== null) {
      notas.push(r.indicacao);
      if (r.indicacao >= 9) promotores++;
      else if (r.indicacao >= 7) neutros++;
      else detratores++;
    }
    // Mesma regra de privacidade de antes: com a coluna de anonimato configurada, vazio = anônimo.
    const nome = () => resolverNomePaciente(r.anonimato !== undefined, r.anonimato ?? "", r.nome ?? "");
    if (r.comentario) comentarios.push({ nome: nome(), comentario: r.comentario, nota: r.indicacao });
    if (r.indicou) indicacoes.push({ texto_indicacao: r.indicou, indicado_por: nome(), ...parseTelefoneIndicacao(r.indicou) });
  }
  const contagem = new Map<number, number>();
  for (const n of notas) contagem.set(n, (contagem.get(n) ?? 0) + 1);
  return {
    total: doPeriodo.length,
    notas_gerais: [...contagem.entries()].map(([nota, count]) => ({ nota, count })).sort((x, y) => y.nota - x.nota),
    classificacao: { promotores, neutros, detratores },
    nps_score: notas.length ? Math.round(((promotores - detratores) / notas.length) * 100) : 0,
    medias_por_area: {
      profissional: media(doPeriodo.map((r) => r.profissional)),
      recepcao: media(doPeriodo.map((r) => r.recepcao)),
      infraestrutura: media(doPeriodo.map((r) => r.infraestrutura)),
      enfermagem: media(doPeriodo.map((r) => r.enfermagem)),
    },
    comentarios,
    indicacoes,
  };
}

/** Convertidos = status de agendamento, a mesma regra do funil de leads dos relatórios. */
export function leadsDoPeriodo(ls: Lead[], ini: Date, fim: Date, regras: RegrasClinica = {}): ResultadoLeads {
  const a = isoDe(ini), b = isoDe(fim);
  const doPeriodo = ls.filter((l) => dentro(l.data, a, b));
  const agendou = new Set((regras.statusAgendou ?? REGRAS_PADRAO.statusAgendou).map(normalizar));
  const convertidos = doPeriodo.filter((l) => agendou.has(normalizar(l.status))).length;
  const total = doPeriodo.length;
  return { total, convertidos, taxa_conversao: total > 0 ? Math.round((convertidos / total) * 1000) / 10 : null };
}

export interface FaturamentoDoPeriodo {
  total_faturado: number;
  qtd_lancamentos: number;
  por_categoria: Record<string, GrupoFinanceiro>;
  por_profissional: Record<string, GrupoFinanceiro>;
}

/** Faturamento = soma do valor pago pela data de atendimento (lançamentos sem valor ficam fora). */
export function faturamentoDoPeriodo(vs: Venda[], ini: Date, fim: Date): FaturamentoDoPeriodo {
  const a = isoDe(ini), b = isoDe(fim);
  const doPeriodo = vs.filter((v) => dentro(v.data, a, b) && (v.valor ?? 0) > 0);
  const total = doPeriodo.reduce((s, v) => s + (v.valor ?? 0), 0);
  return {
    total_faturado: Math.round(total * 100) / 100,
    qtd_lancamentos: doPeriodo.length,
    por_categoria: buildGrupo(doPeriodo.map((v) => ({ key: v.categoria, valor: v.valor ?? 0 })), total),
    por_profissional: buildGrupo(doPeriodo.filter((v) => v.profissional).map((v) => ({ key: v.profissional, valor: v.valor ?? 0 })), total),
  };
}

/** Os quatro recortes que o Report Semanal usa, de uma vez. */
export function reportSemanalDaFonte(dados: DadosFechamento, regras: RegrasClinica, ini: Date, fim: Date) {
  const inicioDoMes = new Date(fim.getFullYear(), fim.getMonth(), 1);
  return {
    pre: dados.preConsulta ? preConsultaDoPeriodo(dados.preConsulta, ini, fim) : null,
    nps: dados.nps ? npsDoPeriodo(dados.nps, ini, fim) : null,
    leads: dados.leads ? leadsDoPeriodo(dados.leads, ini, fim, regras) : null,
    fatFiltro: dados.vendas ? faturamentoDoPeriodo(dados.vendas, ini, fim) : null,
    fatAcum: dados.vendas ? faturamentoDoPeriodo(dados.vendas, inicioDoMes, fim) : null,
  };
}
