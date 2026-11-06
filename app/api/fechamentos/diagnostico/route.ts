/**
 * Diagnóstico da conexão com o banco e o Google, sem expor nenhuma chave.
 * Protegido pela senha do app (proxy.ts protege /api/*).
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function tipoDaChave(chave: string | undefined): string {
  if (!chave) return "ausente";
  if (chave.startsWith("sb_secret_")) return "chave secreta nova (sb_secret)";
  if (chave.startsWith("sb_publishable_")) return "ERRADA: chave pública (sb_publishable) no lugar da secreta";
  const partes = chave.split(".");
  if (partes.length !== 3) return "formato não reconhecido";
  try {
    const carga = JSON.parse(Buffer.from(partes[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { role?: string; ref?: string };
    if (carga.role === "service_role") return `service_role (projeto ${carga.ref ?? "?"})`;
    return `ERRADA: chave com papel "${carga.role ?? "?"}" (projeto ${carga.ref ?? "?"}); precisa ser a service_role`;
  } catch {
    return "formato não reconhecido";
  }
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const resultado: Record<string, unknown> = {
    supabaseUrl: (() => {
      if (!url) return "ausente";
      try {
        const u = new URL(url.trim());
        return u.pathname !== "/" ? `${u.host} (a variável tem o caminho "${u.pathname}"; o app ignora, mas o certo é só https://${u.host})` : u.host;
      } catch { return "URL inválida"; }
    })(),
    chaveServiceRole: tipoDaChave(process.env.SUPABASE_SERVICE_ROLE_KEY),
    chaveAnon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "presente" : "ausente",
    contaGoogle: (() => {
      try { return (JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "") as { client_email?: string }).client_email ?? "sem client_email"; }
      catch { return process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? "JSON inválido" : "ausente"; }
    })(),
  };
  try {
    const db = getSupabaseAdmin();
    for (const tabela of ["clinicas", "fechamento_config", "fechamentos"] as const) {
      const { count, error } = await db.from(tabela).select("*", { count: "exact", head: true });
      resultado[tabela] = error ? `ERRO: ${error.message}${error.code ? ` (${error.code})` : ""}` : `${count ?? 0} linhas`;
    }
  } catch (e) {
    resultado.erro = e instanceof Error ? e.message : String(e);
  }
  return NextResponse.json(resultado, { headers: { "Cache-Control": "no-store" } });
}
