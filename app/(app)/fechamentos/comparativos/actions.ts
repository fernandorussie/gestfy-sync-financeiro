"use server";

import { headers } from "next/headers";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { comparativoDoCliente, type PontoComparativo } from "@/lib/fechamentos/servidor";
import { explicarErro } from "@/lib/fechamentos/erros";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Indicadores de um cliente num período, para a comparação entre clientes.
 * A tela chama uma vez por cliente, em paralelo, e mostra cada um quando chega.
 */
export async function indicadoresDoCliente(p: { clinicaId: string; inicio: string; fim: string }): Promise<{ ponto: PontoComparativo | null; erro: string | null }> {
  if (!UUID.test(p.clinicaId) || !DATA.test(p.inicio) || !DATA.test(p.fim)) return { ponto: null, erro: "Pedido inválido." };
  if (!checkRateLimit(rateLimitKey(await headers()), 60)) return { ponto: null, erro: "Muitas consultas seguidas. Aguarde 1 minuto." };
  try {
    const r = await comparativoDoCliente(p.clinicaId, [{ inicio: p.inicio, fim: p.fim, chave: "P", rotulo: "", parcial: false }]);
    return { ponto: r.pontos[0] ?? null, erro: r.pontos[0] ? null : r.erro ?? "Sem lançamentos no período." };
  } catch (e) {
    const x = explicarErro(e);
    return { ponto: null, erro: `${x.titulo} ${x.acao}` };
  }
}
