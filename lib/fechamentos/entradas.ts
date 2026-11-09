/**
 * Regras das Entradas de caixa (recebimentos), no motor do GestfySync.
 *
 * Cada categoria de entrada pertence a um grupo:
 *  - operacional: receita da operação (consultas, procedimentos, cartão, PIX de clientes);
 *  - nao_operacional: dinheiro que entra mas não vem da operação (rendimentos, reembolsos);
 *  - fora: não é receita (transferência entre contas, empréstimo, aporte, saldo inicial).
 * Resultado de caixa = (operacional + não operacional) − saídas. "Fora" só aparece como informação.
 * O consultor confirma o grupo de cada categoria uma vez; fica salvo nas regras do cliente.
 */
import { normalizar } from "./texto";

export type GrupoEntrada = "operacional" | "nao_operacional" | "fora";

export const ROTULO_GRUPO_ENTRADA: Record<GrupoEntrada, string> = {
  operacional: "Operacional",
  nao_operacional: "Não operacional",
  fora: "Fora do resultado",
};

const FORA = /transfer|emprest|aporte|saldo|resgate|aplicacao financeira|integraliza|capital social|mutuo/;
const NAO_OPERACIONAL = /rendiment|reembols|juros|estorno|devoluc|indeniz|venda de (ativo|imobilizado)/;

/** Sugestão pelo nome da categoria. null = não dá para saber (o consultor escolhe). */
export function sugerirGrupoEntrada(categoria: string): GrupoEntrada | null {
  const c = normalizar(categoria);
  if (!c) return null;
  if (FORA.test(c)) return "fora";
  if (NAO_OPERACIONAL.test(c)) return "nao_operacional";
  if (/receita|servic|consult|procediment|cirurg|cartao|pix|venda|atendiment|tratament|exame|pacote|plano|produto|mensalidade|honorar/.test(c)) return "operacional";
  return null;
}

/** Grupo de uma categoria: o escolhido pelo consultor; senão a sugestão; senão operacional (e a conferência pede confirmação). */
export function grupoDaEntrada(categoria: string, escolhidos: Record<string, GrupoEntrada> | undefined): { grupo: GrupoEntrada; confirmado: boolean; sugerido: GrupoEntrada | null } {
  const k = normalizar(categoria);
  const salvo = escolhidos?.[k];
  if (salvo) return { grupo: salvo, confirmado: true, sugerido: salvo };
  const sug = sugerirGrupoEntrada(categoria);
  return { grupo: sug ?? "operacional", confirmado: false, sugerido: sug };
}

export const GRUPOS_ENTRADA: GrupoEntrada[] = ["operacional", "nao_operacional", "fora"];
