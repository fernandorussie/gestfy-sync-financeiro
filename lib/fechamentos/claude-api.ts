/**
 * Chamada à API do Claude (Anthropic), só no servidor.
 * Liga quando a variável ANTHROPIC_API_KEY existe na Vercel; sem ela, o app
 * avisa e o resto (copiar e colar no projeto do cliente) continua funcionando.
 * Dados enviados pela API não são usados para treinar modelos por padrão
 * (termos comerciais da Anthropic).
 */

const URL_API = "https://api.anthropic.com/v1/messages";
export const MODELO_PADRAO = "claude-sonnet-5-5";

export interface RespostaClaude {
  texto: string;
  modelo: string;
  tokensEntrada: number;
  tokensSaida: number;
}

export const claudeConfigurado = () => !!process.env.ANTHROPIC_API_KEY;

export async function chamarClaude(prompt: string, opcoes: { maxTokens?: number; fetchFn?: typeof fetch } = {}): Promise<RespostaClaude> {
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) throw new Error("A IA ainda não está ligada: falta cadastrar a chave ANTHROPIC_API_KEY nas variáveis da Vercel.");
  const modelo = process.env.ANTHROPIC_MODEL || MODELO_PADRAO;
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), 55_000);
  try {
    const res = await (opcoes.fetchFn ?? fetch)(URL_API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": chave, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: modelo, max_tokens: opcoes.maxTokens ?? 4000, messages: [{ role: "user", content: prompt }] }),
      signal: controle.signal,
    });
    const corpo = (await res.json().catch(() => null)) as {
      content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number }; error?: { type?: string; message?: string };
    } | null;
    if (!res.ok) {
      const tipo = corpo?.error?.type ?? "";
      if (res.status === 401 || tipo === "authentication_error") throw new Error("A chave da API do Claude foi recusada. Confira ANTHROPIC_API_KEY na Vercel.");
      if (res.status === 402 || /credit|billing/i.test(corpo?.error?.message ?? "")) throw new Error("A conta da API do Claude está sem créditos. Adicione créditos no Console da Anthropic.");
      if (res.status === 404 || tipo === "not_found_error") throw new Error(`O modelo "${modelo}" não foi encontrado. Ajuste ANTHROPIC_MODEL na Vercel.`);
      if (res.status === 429 || res.status === 529) throw new Error("O Claude está sobrecarregado agora. Tente de novo em 1 minuto.");
      throw new Error("O Claude não respondeu como esperado. Tente de novo.");
    }
    const texto = (corpo?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n").trim();
    if (!texto) throw new Error("O Claude devolveu uma resposta vazia. Tente de novo.");
    return { texto, modelo, tokensEntrada: corpo?.usage?.input_tokens ?? 0, tokensSaida: corpo?.usage?.output_tokens ?? 0 };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("O Claude demorou demais para responder. Tente de novo.");
    throw e;
  } finally {
    clearTimeout(limite);
  }
}
