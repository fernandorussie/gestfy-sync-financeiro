"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Lock, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Image from "next/image";
import { GestfyLogo } from "@/components/brand/gestfy-logo";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!usuario || !password) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, password }),
      });
      if (res.ok) {
        const from = searchParams.get("from") ?? "/dashboard";
        router.push(from);
        router.refresh();
      } else {
        const corpo = await res.json().catch(() => ({}));
        toast.error(corpo.error ?? "Usuário ou senha incorretos");
        setPassword("");
      }
    } catch {
      toast.error("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Painel esquerdo — gradiente oficial da marca ────────── */}
      <div className="hidden lg:flex lg:w-[45%] bg-gestfy-gradient flex-col items-center justify-center p-14 gap-10 relative overflow-hidden">
        {/* Círculos decorativos de profundidade */}
        <div
          className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #FF5001 0%, transparent 70%)" }}
          aria-hidden
        />
        <div
          className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, #7B099C 0%, transparent 70%)" }}
          aria-hidden
        />

        <div className="relative z-10 flex flex-col items-center gap-6 max-w-xs text-center">
          {/*
           * OPÇÃO A — colorida oficial com contorno luminoso (ativa)
           * OPÇÃO B — branca com relevo: troque o src por /brand/gestfy-logo-full.png
           *   e o filter por:
           *   "brightness(0) invert(1) drop-shadow(0 0 1px rgba(255,255,255,0.35)) drop-shadow(0 5px 16px rgba(0,0,0,0.45))"
           */}
          <Image
            src="/brand/gestfy-logo-full.png"
            alt="Gestfy"
            width={240}
            height={60}
            priority
            style={{
              height: 52,
              width: "auto",
              // contorno fino luminoso (silhueta real do PNG) + sombra de elevação
              filter: "drop-shadow(0 5px 16px rgba(0,0,0,0.45))",
            }}
          />

          <p className="text-white/90 text-base font-medium leading-snug">
            Onde dados viram decisões.
          </p>
        </div>
      </div>

      {/* ── Painel direito — formulário ─────────────────────────── */}
      <div className="flex flex-1 items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm space-y-8">
          {/* Logo no mobile (painel esquerdo oculto) */}
          <div className="flex justify-center lg:hidden">
            <GestfyLogo variant="full" size={40} />
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-foreground font-heading">
              Acessar Gestfy Sync
            </h1>
            <p className="text-sm text-muted-foreground">
              Entre com seu usuário e senha.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="usuario" className="text-sm font-medium">
                Usuário
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="usuario"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="pl-9 h-11"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  autoFocus
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Senha
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="pl-9 pr-10 h-11"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <Button
              className="w-full h-11 text-sm font-semibold"
              type="submit"
              disabled={loading}
            >
              {loading ? "Entrando…" : "Entrar"}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground/60">
            Gestfy — Gestão para Clínicas
          </p>
        </div>
      </div>
    </div>
  );
}
