"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ScrollText,
  Building2,
  FileText,
  Target,
  CalendarOff,
  ClipboardCheck,
  CalendarDays,
  ChevronDown,
  History,
  LineChart,
  Settings2,
  Wallet,
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

/*
 * Relatórios Financeiros (módulo Fechamentos): grupo recolhível. Cada item diz
 * quais rotas o deixam ativo, porque as páginas internas (um fechamento, o
 * histórico de um cliente, a configuração) pertencem a um dos quatro itens.
 */
const relatoriosItems: { href: string; label: string; icon: React.ElementType; ativo: (p: string) => boolean }[] = [
  {
    href: "/fechamentos", label: "Fechamentos do mês", icon: CalendarDays,
    // painel e as telas de um fechamento (/fechamentos/<id>)
    ativo: (p) => p === "/fechamentos" || /^\/fechamentos\/[0-9a-f-]{36}(\/|$)/.test(p),
  },
  { href: "/fechamentos/historico", label: "Histórico", icon: History, ativo: (p) => p.startsWith("/fechamentos/historico") || p.startsWith("/fechamentos/clinica/") },
  { href: "/fechamentos/comparativos", label: "Comparativos", icon: LineChart, ativo: (p) => p.startsWith("/fechamentos/comparativos") },
  { href: "/fechamentos/clientes", label: "Clientes e configurações", icon: Settings2, ativo: (p) => p.startsWith("/fechamentos/clientes") || p.startsWith("/fechamentos/configurar") },
];

const CHAVE_GRUPO = "gestfy:menu-relatorios";

export function SidebarNav() {
  const pathname = usePathname();
  const noModulo = pathname.startsWith("/fechamentos");
  const [aberto, setAberto] = useState(true);

  // Abre sozinho ao entrar no módulo; fora dele, lembra se foi recolhido. Dá para recolher sempre.
  useEffect(() => {
    let salvo: string | null = null;
    try { salvo = localStorage.getItem(CHAVE_GRUPO); } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preferência do navegador, só existe no cliente
    setAberto(noModulo || salvo !== "0");
  }, [noModulo]);
  const alternar = () => {
    const novo = !aberto;
    setAberto(novo);
    try { localStorage.setItem(CHAVE_GRUPO, novo ? "1" : "0"); } catch {}
  };
  const grupoAberto = aberto;

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  function navLink(href: string, label: string, Icon: React.ElementType, indent = false, ativoForcado?: boolean) {
    const active = ativoForcado ?? isActive(href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
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

      <div className="pt-1">
        <button
          type="button"
          onClick={alternar}
          aria-expanded={grupoAberto}
          aria-controls="menu-relatorios"
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
            noModulo ? "text-sidebar-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}
        >
          <Wallet className="h-4 w-4 shrink-0" />
          <span className="flex-1">Relatórios Financeiros</span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 opacity-60 transition-transform", grupoAberto ? "" : "-rotate-90")} />
        </button>
        {grupoAberto && (
          <div id="menu-relatorios" className="mt-0.5 space-y-0.5">
            {relatoriosItems.map(({ href, label, icon, ativo }) => navLink(href, label, icon, true, ativo(pathname)))}
          </div>
        )}
      </div>

      <div className="pt-4 pb-0.5">
        <p className="px-3 text-[10px] font-semibold text-sidebar-foreground/50 uppercase tracking-widest font-heading">
          Configurações
        </p>
      </div>

      {configNavItems.map(({ href, label, icon }) => navLink(href, label, icon, true))}
    </nav>
  );
}
