"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ScrollText,
  Building2,
  FileText,
  TrendingUp,
  Target,
  CalendarOff,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const mainNavItems = [
  { href: "/clinicas", label: "Clínicas", icon: Building2 },
  // Antes do report: o checkpoint é a conferência que vem primeiro no fluxo.
  { href: "/checkpoint", label: "Checkpoint", icon: ClipboardCheck },
  { href: "/relatorio", label: "Gerar Report Semanal", icon: FileText },
  { href: "/dashboard", label: "Logs", icon: ScrollText },
];

const configNavItems = [
  { href: "/configuracoes/tipos-meta", label: "Tipos de Meta", icon: Target },
  { href: "/configuracoes/feriados", label: "Feriados", icon: CalendarOff },
];

export function SidebarNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  function navLink(href: string, label: string, Icon: React.ElementType, indent = false) {
    const active = isActive(href);
    return (
      <Link
        key={href}
        href={href}
        className={cn(
          "flex items-center gap-3 rounded-md py-2 text-sm font-medium transition-colors",
          indent ? "px-5" : "px-3",
          active
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {label}
      </Link>
    );
  }

  return (
    <nav className="space-y-0.5">
      {mainNavItems.map(({ href, label, icon }) => navLink(href, label, icon))}

      {navLink("/fechamentos", "Fechamentos", TrendingUp)}

      <div className="pt-4 pb-0.5">
        <p className="px-3 text-[10px] font-semibold text-sidebar-foreground/50 uppercase tracking-widest font-heading">
          Configurações
        </p>
      </div>

      {configNavItems.map(({ href, label, icon }) => navLink(href, label, icon, true))}
    </nav>
  );
}
