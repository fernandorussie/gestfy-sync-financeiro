import { NextRequest, NextResponse } from "next/server";
import { autenticar, createAuthToken, COOKIE_NAME } from "@/lib/auth";

export async function POST(request: NextRequest) {
  let usuario: string, password: string;
  try {
    const body = await request.json();
    usuario = String(body.usuario ?? "");
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }

  if (!process.env.APP_PASSWORD) {
    return NextResponse.json({ error: "Acesso não configurado no servidor." }, { status: 500 });
  }
  const perfil = autenticar(usuario, password);
  if (!perfil) {
    // Pequena espera em cada erro: dificulta tentativas em massa.
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "Usuário ou senha incorretos" }, { status: 401 });
  }

  const token = await createAuthToken(perfil);
  const response = NextResponse.json({ ok: true, perfil });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });
  return response;
}
