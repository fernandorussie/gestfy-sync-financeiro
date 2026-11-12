/**
 * Acesso ao app: usuário + senha, com dois perfis definidos no ambiente (Vercel).
 *  - admin:     login APP_LOGIN (padrão "admin")        e senha APP_PASSWORD
 *  - consultor: login CONSULTOR_LOGIN (padrão "consultor") e senha CONSULTOR_PASSWORD
 * Sem CONSULTOR_PASSWORD definida, o login de consultor fica desligado.
 * O cookie é assinado (HMAC) e vale 30 dias. Trocar a senha de um perfil
 * derruba as sessões abertas daquele perfil.
 */
export const COOKIE_NAME = "app_auth";
const TOKEN_DURATION_SEC = 30 * 24 * 60 * 60; // 30 dias

export type Perfil = "admin" | "consultor";

async function hmacHex(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface Conta { perfil: Perfil; login: string; senha: string }

function contas(env: Record<string, string | undefined> = process.env): Conta[] {
  const out: Conta[] = [];
  if (env.APP_PASSWORD) out.push({ perfil: "admin", login: (env.APP_LOGIN || "admin").trim().toLowerCase(), senha: env.APP_PASSWORD });
  if (env.CONSULTOR_PASSWORD) out.push({ perfil: "consultor", login: (env.CONSULTOR_LOGIN || "consultor").trim().toLowerCase(), senha: env.CONSULTOR_PASSWORD });
  return out;
}

/** Chave que assina o cookie de cada perfil (depende da senha dele). */
function chave(perfil: Perfil, env: Record<string, string | undefined> = process.env): string | null {
  if (!env.APP_PASSWORD) return null;
  if (perfil === "admin") return env.APP_PASSWORD;
  return env.CONSULTOR_PASSWORD ? `${env.APP_PASSWORD}|${env.CONSULTOR_PASSWORD}` : null;
}

/** Confere usuário e senha. Sem usuário, aceita só a senha do admin (como antes). */
export function autenticar(usuario: string, senha: string, env: Record<string, string | undefined> = process.env): Perfil | null {
  const u = usuario.trim().toLowerCase();
  for (const c of contas(env)) {
    if ((u === c.login || (!u && c.perfil === "admin")) && iguais(senha, c.senha)) return c.perfil;
  }
  return null;
}

export async function createAuthToken(perfil: Perfil, env: Record<string, string | undefined> = process.env): Promise<string> {
  const k = chave(perfil, env);
  if (!k) throw new Error("Acesso não configurado no servidor.");
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_DURATION_SEC;
  const sig = await hmacHex(k, `${expiresAt}:${perfil}:gestfy-auth`);
  return `${expiresAt}.${perfil}.${sig}`;
}

/** Perfil do cookie, ou null se inválido/vencido. Aceita o formato antigo (só senha do admin). */
export async function verifyAuthToken(token: string, env: Record<string, string | undefined> = process.env): Promise<Perfil | null> {
  const partes = token.split(".");
  const expiresAt = parseInt(partes[0], 10);
  if (isNaN(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return null;
  if (partes.length === 2) {
    // Cookie de antes do login por usuário: assinado com a senha do admin.
    if (!env.APP_PASSWORD) return null;
    return iguais(await hmacHex(env.APP_PASSWORD, `${expiresAt}:gestfy-auth`), partes[1]) ? "admin" : null;
  }
  if (partes.length !== 3) return null;
  const perfil = partes[1] as Perfil;
  if (perfil !== "admin" && perfil !== "consultor") return null;
  const k = chave(perfil, env);
  if (!k) return null;
  return iguais(await hmacHex(k, `${expiresAt}:${perfil}:gestfy-auth`), partes[2]) ? perfil : null;
}

/** Perfil escrito no cookie, só para exibir (a verificação de verdade é no proxy). */
export function perfilDoCookie(token: string | undefined): Perfil | null {
  if (!token) return null;
  const p = token.split(".");
  return p.length === 2 ? "admin" : p[1] === "consultor" ? "consultor" : p[1] === "admin" ? "admin" : null;
}
