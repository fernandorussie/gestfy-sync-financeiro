/**
 * URL base do projeto Supabase. Aceita a variável com caminho no final
 * (ex.: "https://xxxx.supabase.co/rest/v1/", copiada de Data API) e usa só
 * a origem; senão o cliente monta "/rest/v1/rest/v1" e o Supabase recusa.
 */
export function urlDoSupabase(bruta = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""): string {
  const s = bruta.trim();
  try {
    return new URL(s).origin;
  } catch {
    return s;
  }
}
