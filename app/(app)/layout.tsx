import Link from "next/link";
import { cookies } from "next/headers";
import { COOKIE_NAME, perfilDoCookie, type Perfil } from "@/lib/auth";
import { Separator } from "@/components/ui/separator";
import { GestfyLogo } from "@/components/brand/gestfy-logo";
import { SidebarNav } from "@/components/sidebar-nav";
import { SidebarFooterClient } from "@/components/sidebar-footer-client";
import { CommandPalette } from "@/components/command-palette";
import { MenuMovel } from "@/components/menu-movel";

function Marca({ compacta = false }: { compacta?: boolean }) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 ${compacta ? "py-2" : "px-5 py-5"}`} aria-label="Gestfy Sync, início">
      {/* Símbolo G oficial (o arquivo gestfy-logo-full.png é o símbolo; os nomes estão trocados) */}
      <GestfyLogo variant="full" size={compacta ? 26 : 32} />
      <span className="leading-tight">
        <b className="block font-heading text-[1.05rem] font-semibold text-sidebar-foreground">Gestfy Sync</b>
        {!compacta && <small className="block text-xs text-sidebar-foreground/60">Gestão e resultados</small>}
      </span>
    </Link>
  );
}

function ConteudoMenu({ perfil }: { perfil: Perfil | null }) {
  return (
    <>
      <Marca />
      <Separator className="bg-sidebar-border" />
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <SidebarNav />
      </div>
      <Separator className="bg-sidebar-border" />
      <SidebarFooterClient perfil={perfil} />
    </>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const perfil = perfilDoCookie((await cookies()).get(COOKIE_NAME)?.value);
  return (
    <div className="flex h-dvh flex-col lg:flex-row">
      {/* Computador: menu lateral fixo. Celular e tablet: barra no topo com gaveta. */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <ConteudoMenu perfil={perfil} />
      </aside>
      <MenuMovel marca={<Marca compacta />}><ConteudoMenu perfil={perfil} /></MenuMovel>

      <main className="min-w-0 flex-1 overflow-auto bg-background">
        {children}
      </main>
      <CommandPalette />
    </div>
  );
}
