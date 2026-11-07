import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { GestfyLogo } from "@/components/brand/gestfy-logo";
import { SidebarNav } from "@/components/sidebar-nav";
import { SidebarFooterClient } from "@/components/sidebar-footer-client";
import { CommandPalette } from "@/components/command-palette";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <aside className="w-64 shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col">
        <Link href="/" className="flex items-center gap-2.5 px-5 py-5" aria-label="Gestfy Sync, início">
          {/* Símbolo G oficial (o arquivo gestfy-logo-full.png é o símbolo; os nomes estão trocados) */}
          <GestfyLogo variant="full" size={32} />
          <span className="leading-tight">
            <b className="block font-heading text-[1.05rem] font-semibold text-sidebar-foreground">Gestfy Sync</b>
            <small className="block text-xs text-sidebar-foreground/60">Gestão e resultados</small>
          </span>
        </Link>

        <Separator className="bg-sidebar-border" />

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <SidebarNav />
        </div>

        <Separator className="bg-sidebar-border" />

        <SidebarFooterClient />
      </aside>

      <main className="flex-1 overflow-auto bg-background">
        {children}
      </main>
      <CommandPalette />
    </div>
  );
}
