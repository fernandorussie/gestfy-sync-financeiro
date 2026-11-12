"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export function SidebarFooterClient({ perfil }: { perfil?: "admin" | "consultor" | null }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="flex items-center gap-2">
        <ThemeToggle />
        {perfil && <span className="text-xs text-muted-foreground" title="Perfil desta sessão">{perfil === "admin" ? "Administrador" : "Consultor"}</span>}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="gap-2 text-xs text-muted-foreground hover:text-destructive"
        onClick={handleLogout}
      >
        <LogOut className="h-3.5 w-3.5" />
        Sair
      </Button>
    </div>
  );
}
