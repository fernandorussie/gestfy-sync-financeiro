import { describe, it, expect } from "vitest";
import { autenticar, createAuthToken, perfilDoCookie, verifyAuthToken } from "../../auth";

const env = { APP_PASSWORD: "senha-admin-longa", CONSULTOR_PASSWORD: "senha-consultores" };

describe("login por usuário e senha", () => {
  it("admin e consultor entram com o próprio usuário; erros são recusados", () => {
    expect(autenticar("admin", "senha-admin-longa", env)).toBe("admin");
    expect(autenticar(" Consultor ", "senha-consultores", env)).toBe("consultor");
    expect(autenticar("consultor", "senha-admin-longa", env)).toBeNull();
    expect(autenticar("admin", "senha-consultores", env)).toBeNull();
    expect(autenticar("", "senha-admin-longa", env)).toBe("admin");
    expect(autenticar("consultor", "x", { APP_PASSWORD: "a" })).toBeNull();
    expect(autenticar("gestfy", "senha-consultores", { ...env, CONSULTOR_LOGIN: "Gestfy" })).toBe("consultor");
  });

  it("cookie guarda o perfil e cai quando a senha do perfil muda", async () => {
    const t = await createAuthToken("consultor", env);
    expect(await verifyAuthToken(t, env)).toBe("consultor");
    expect(perfilDoCookie(t)).toBe("consultor");
    expect(await verifyAuthToken(t, { ...env, CONSULTOR_PASSWORD: "nova" })).toBeNull();
    expect(await verifyAuthToken(t, { APP_PASSWORD: env.APP_PASSWORD })).toBeNull();
    const a = await createAuthToken("admin", env);
    expect(await verifyAuthToken(a, { ...env, CONSULTOR_PASSWORD: "nova" })).toBe("admin");
    expect(await verifyAuthToken(a.replace(".admin.", ".consultor."), env)).toBeNull();
  });

  it("aceita o cookie antigo (só senha do admin)", async () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const enc = new TextEncoder();
    const k = await crypto.subtle.importKey("raw", enc.encode(env.APP_PASSWORD), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(`${exp}:gestfy-auth`)))).map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(await verifyAuthToken(`${exp}.${sig}`, env)).toBe("admin");
    expect(await verifyAuthToken(`${exp - 120}.${sig}`, env)).toBeNull();
  });
});
