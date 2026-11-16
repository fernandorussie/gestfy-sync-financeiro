"use client";

import { format, subDays, subWeeks, startOfWeek, endOfWeek } from "date-fns";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { Clinica } from "@/lib/supabase/types";

// ─── Período ──────────────────────────────────────────────────────────────────
export type Preset = "semana_passada" | "ultimos7" | "custom";

export const PRESET_LABELS: Record<Preset, string> = {
  semana_passada: "Semana passada (seg–dom)",
  ultimos7:       "Últimos 7 dias",
  custom:         "Personalizado",
};

export interface Periodo {
  ini: string;  // "yyyy-MM-dd" — formato interno; a tela exibe DD/MM
  fim: string;
}

export function semanaPassada(): Periodo {
  const l = subWeeks(new Date(), 1);
  return {
    ini: format(startOfWeek(l, { weekStartsOn: 1 }), "yyyy-MM-dd"),
    fim: format(endOfWeek(l,   { weekStartsOn: 1 }), "yyyy-MM-dd"),
  };
}

export function ultimos7Dias(): Periodo {
  const t = new Date();
  return { ini: format(subDays(t, 6), "yyyy-MM-dd"), fim: format(t, "yyyy-MM-dd") };
}

export function resolverPeriodo(preset: Preset, customIni: string, customFim: string): Periodo {
  if (preset === "semana_passada") return semanaPassada();
  if (preset === "ultimos7")       return ultimos7Dias();
  return { ini: customIni, fim: customFim };
}

// ─── Seleção de clínicas ──────────────────────────────────────────────────────
export function SelecaoClinicas({
  clinicas, selecionadas, onToggle, onToggleTodas,
}: {
  clinicas: Clinica[];
  selecionadas: Set<string>;
  onToggle: (id: string) => void;
  onToggleTodas: () => void;
}) {
  const todas = clinicas.length > 0 && selecionadas.size === clinicas.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>
          Clientes{" "}
          <span className="text-muted-foreground text-sm font-normal">
            ({selecionadas.size} de {clinicas.length} selecionada{selecionadas.size !== 1 ? "s" : ""})
          </span>
        </Label>
        <Button type="button" variant="ghost" size="sm" className="text-xs h-7" onClick={onToggleTodas}>
          {todas ? "Desmarcar todas" : "Selecionar todas"}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {clinicas.map(c => (
          <label key={c.id}
            className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors ${
              selecionadas.has(c.id) ? "border-primary/50 bg-primary/5" : ""
            }`}>
            <input type="checkbox" checked={selecionadas.has(c.id)}
              onChange={() => onToggle(c.id)}
              className="h-4 w-4 cursor-pointer accent-[#7B099C]" />
            <span className="text-sm truncate">{c.nome}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── Seleção de período ───────────────────────────────────────────────────────
export function SelecaoPeriodo({
  preset, onPreset, customIni, onCustomIni, customFim, onCustomFim,
}: {
  preset: Preset;
  onPreset: (p: Preset) => void;
  customIni: string;
  onCustomIni: (v: string) => void;
  customFim: string;
  onCustomFim: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Período</Label>
      <div className="flex flex-wrap gap-2">
        {(["semana_passada", "ultimos7", "custom"] as Preset[]).map(p => (
          <Button key={p} type="button"
            variant={preset === p ? "default" : "outline"}
            size="sm" onClick={() => onPreset(p)}>
            {PRESET_LABELS[p]}
          </Button>
        ))}
      </div>
      {preset === "custom" && (
        <div className="flex items-end gap-3 pt-1">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">De</Label>
            <Input type="date" value={customIni} onChange={e => onCustomIni(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Até</Label>
            <Input type="date" value={customFim} onChange={e => onCustomFim(e.target.value)} className="w-40" />
          </div>
        </div>
      )}
    </div>
  );
}
