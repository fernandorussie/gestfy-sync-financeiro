"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard, Building2, FileText, Settings, Moon, Sun, ClipboardCheck,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  CommandDialog, CommandEmpty, CommandGroup,
  CommandInput, CommandItem, CommandList, CommandShortcut,
} from "@/components/ui/command";

const NAV_ITEMS = [
  { label: "Dashboard",       href: "/dashboard",     icon: LayoutDashboard },
  { label: "Clientes",        href: "/clientes",      icon: Building2       },
  { label: "Checkpoint",      href: "/checkpoint",    icon: ClipboardCheck  },
  { label: "Gerar Relatório", href: "/relatorio",     icon: FileText        },
  { label: "Configurações",   href: "/configuracoes", icon: Settings        },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(v => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Navegar, buscar ação…" />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>

        <CommandGroup heading="Navegação">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => (
            <CommandItem key={href} onSelect={() => go(href)}>
              <Icon />
              {label}
              <CommandShortcut>↵</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Preferências">
          <CommandItem onSelect={() => { setTheme(theme === "dark" ? "light" : "dark"); setOpen(false); }}>
            {theme === "dark" ? <Sun /> : <Moon />}
            {theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
