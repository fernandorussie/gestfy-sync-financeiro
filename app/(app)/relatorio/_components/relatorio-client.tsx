"use client";

import { useState, useRef } from "react";
import { format } from "date-fns";
import {
  FileText, ChevronDown, ChevronUp,
  Loader2, AlertTriangle, Plus, Trash2,
  ExternalLink, Download, Image as ImageIcon, Archive, Database, Sparkles,
  MessageSquareQuote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  gerarRelatorioWhatsapp, prepararDadosImagem, salvarRelatorioImagem, gerarSugestoesIA,
} from "../actions";
import { SEPARATOR } from "@/lib/relatorio/montar-whatsapp";
import type { Clinica, RelatorioGerado } from "@/lib/supabase/types";
import type {
  RelatorioImagemData, DestaqueItem, TipoDestaque,
  FaturamentoVisao, NpsGoogleVisao,
} from "@/lib/relatorio/imagem-tipos";
import type { AvaliacaoGoogle } from "@/lib/coletores/google-places";
import { withConcurrency } from "@/lib/concorrencia";
import { CopyButton } from "@/components/copy-button";
import {
  SelecaoClinicas, SelecaoPeriodo, resolverPeriodo,
} from "@/components/selecao-clinicas-periodo";
import type { Preset } from "@/components/selecao-clinicas-periodo";
import type { ComentarioItem } from "@/lib/relatorio/imagem-tipos";
import {
  filtrarComentarios, parsePalavras, parseLimite, filtroAtivo,
} from "@/lib/relatorio/filtrar-comentarios";
import type { FiltroComentarios } from "@/lib/relatorio/filtrar-comentarios";

// ─── Types ────────────────────────────────────────────────────────────────────
type Formato = "whatsapp_pesquisas" | "whatsapp_metas" | "imagem";

interface LeadsManualDados {
  total:      string;
  convertidos: string;
}

/** Campos do filtro como texto, do jeito que o formulário guarda. */
interface FiltroForm {
  maxComentarios: string;
  minPalavras:    string;
  maxPalavras:    string;
  palavras:       string;
}

const FILTRO_FORM_VAZIO: FiltroForm = {
  maxComentarios: "", minPalavras: "", maxPalavras: "", palavras: "",
};

function formParaFiltro(f: FiltroForm): FiltroComentarios {
  return {
    maxComentarios: parseLimite(f.maxComentarios),
    minPalavras:    parseLimite(f.minPalavras),
    maxPalavras:    parseLimite(f.maxPalavras),
    palavras:       parsePalavras(f.palavras),
  };
}

interface ResultadoClinica {
  clinicaId:    string;
  clinicaNome:  string;
  texto:        string;
  erros:        string[];
  imagemId?:    string;
  imagemUrl?:   string;
  imagemDados?: RelatorioImagemData;
  /** Página 2 (feedbacks) — só existe quando pedida e há comentários. */
  comentariosUrl?: string;
  /**
   * Índices de `imagemDados.comentarios` que vão para a página 2.
   * `undefined` = ainda não escolhido (vale tudo que foi coletado).
   */
  comentariosSel?: number[];
}

const FORMATO_OPTIONS: { value: Formato; label: string }[] = [
  { value: "whatsapp_pesquisas", label: "WhatsApp — Pesquisas" },
  { value: "whatsapp_metas",     label: "WhatsApp — Metas" },
  { value: "imagem",             label: "Imagem (infográfico)" },
];

// ─── Parsers ──────────────────────────────────────────────────────────────────
function parseGoogleTexto(texto: string): AvaliacaoGoogle[] {
  if (!texto.trim()) return [];
  return texto.split("/").map(p => p.trim()).filter(Boolean).flatMap((parte): AvaliacaoGoogle[] => {
    const campos = parte.split(";").map(c => c.trim());
    if (campos.length < 3) return [];
    const [estStr, autorStr, textoStr, dataStr = ""] = campos;
    const nota = Number(estStr);
    if (isNaN(nota) || nota < 1 || nota > 5) return [];
    const textoLimpo = textoStr.replace(/^["""'']|["""'']$/g, "").trim();
    if (!textoLimpo) return [];
    return [{ nota: Math.round(nota), autor: autorStr || "Anônimo", texto: textoLimpo, data: dataStr.trim() }];
  });
}

function parseLeadsManual(
  d: LeadsManualDados | undefined
): { total: number; convertidos: number } | undefined {
  if (!d) return undefined;
  const total      = parseInt(d.total, 10);
  const convertidos = parseInt(d.convertidos, 10);
  if (isNaN(total) || total < 0) return undefined;
  return { total, convertidos: isNaN(convertidos) ? 0 : Math.max(0, convertidos) };
}

function slugificar(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Lista editável ───────────────────────────────────────────────────────────
function ListaEditavel({ items, onChange, placeholder }: {
  items: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex gap-2">
          <Input value={item}
            onChange={e => { const n = [...items]; n[i] = e.target.value; onChange(n); }}
            placeholder={placeholder} className="text-sm" />
          <Button type="button" variant="ghost" size="sm"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="shrink-0 text-destructive hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm"
        onClick={() => onChange([...items, ""])} className="gap-1.5">
        <Plus className="h-3.5 w-3.5" />Adicionar
      </Button>
    </div>
  );
}

// ─── Lista de destaques ───────────────────────────────────────────────────────
const TIPO_LABELS: Record<TipoDestaque, string> = {
  positivo:   "✓ Positivo",
  atencao:    "⚠ Atenção",
  financeiro: "$ Financeiro",
};

function ListaDestaques({ items, onChange }: {
  items: DestaqueItem[];
  onChange: (v: DestaqueItem[]) => void;
}) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex gap-2 items-center">
          <Select value={item.tipo}
            onValueChange={v => { const n = [...items]; n[i] = { ...n[i], tipo: v as TipoDestaque }; onChange(n); }}>
            <SelectTrigger className="w-36 shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(TIPO_LABELS) as TipoDestaque[]).map(t => (
                <SelectItem key={t} value={t}>{TIPO_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input value={item.texto}
            onChange={e => { const n = [...items]; n[i] = { ...n[i], texto: e.target.value }; onChange(n); }}
            placeholder="Texto do destaque…" className="text-sm" />
          <Button type="button" variant="ghost" size="sm"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="shrink-0 text-destructive hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm"
        onClick={() => onChange([...items, { tipo: "positivo", texto: "" }])} className="gap-1.5">
        <Plus className="h-3.5 w-3.5" />Adicionar destaque
      </Button>
    </div>
  );
}

// ─── % helpers ────────────────────────────────────────────────────────────────
function parseFmtNum(s: string): number | null {
  if (!s || s === "N/A" || s === "—") return null;
  const n = parseFloat(s.replace(/R\$\s*/g, "").replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}
function calcPct(
  num: number | string | null | undefined,
  den: number | string | null | undefined
): number | null {
  const n = typeof num === "string" ? parseFmtNum(num) : (num ?? null);
  const d = typeof den === "string" ? parseFmtNum(den) : (den ?? null);
  if (n === null || d === null || d === 0) return null;
  return Math.round((n / d) * 100);
}
function ReadOnlyPct({
  value,
  acima,
  sufixo,
}: {
  value: number | null;
  acima?: boolean;
  sufixo?: string;
}) {
  if (value === null) {
    return (
      <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground">
        —
      </div>
    );
  }
  const colorCls = acima === undefined
    ? "text-muted-foreground"
    : acima
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-orange-500 dark:text-orange-400";
  return (
    <div className={`flex h-9 w-full items-center rounded-md border border-input bg-muted/50 px-3 text-sm font-medium ${colorCls}`}>
      {`${value}%${sufixo ?? ""}`}
    </div>
  );
}

// ─── Campo Monetário (formata R$ ao vivo enquanto digita) ─────────────────────
function CampoMonetario({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  function toDigits(v: string): string {
    if (!v || v === "N/A" || v === "—") return "";
    const num = parseFmtNum(v);
    return num !== null && num >= 0 ? String(Math.round(num)) : "";
  }

  const [raw, setRaw] = useState(() => toDigits(value));

  // Sync quando value muda externamente (carga do servidor, preenchimento por IA)
  const prevRef = useRef(value);
  if (prevRef.current !== value) {
    prevRef.current = value;
    const newRaw = toDigits(value);
    if (newRaw !== raw) setRaw(newRaw);
  }

  function fmtBRL(digits: string): string {
    if (!digits) return "";
    const num = parseInt(digits, 10);
    if (isNaN(num)) return "";
    return num.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    });
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "");
    setRaw(digits);
    onChange(digits ? fmtBRL(digits) : "");
  }

  return (
    <Input
      value={fmtBRL(raw)}
      onChange={handleChange}
      inputMode="numeric"
      className={className}
    />
  );
}

// ─── Google Fallback Panel (por clínica) ──────────────────────────────────────
function GoogleFallbackPanel({
  clinicaNome, placeId, textoManual, onChangeTexto, labelOverride,
}: {
  clinicaNome: string;
  placeId: string | null | undefined;
  textoManual: string;
  onChangeTexto: (v: string) => void;
  labelOverride?: string;
}) {
  const [open, setOpen] = useState(false);
  const googleUrl = placeId
    ? `https://www.google.com/maps/place/?q=place_id:${placeId}`
    : null;
  const parsed = parseGoogleTexto(textoManual);
  const count = parsed.length;
  const temTexto = textoManual.trim().length > 0;

  return (
    <div className="rounded-md border bg-muted/30">
      <div className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap">
        <button type="button" onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors flex-1 text-left min-w-0">
          {open ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
          <span className="font-medium">{labelOverride ?? "Inserir avaliações Google manualmente"}</span>
          {count > 0 && (
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
              — {count} avaliação(ões)
            </span>
          )}
        </button>
        {googleUrl && (
          <Button variant="outline" size="sm" asChild className="shrink-0 gap-1.5">
            <a href={googleUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />Abrir no Google
            </a>
          </Button>
        )}
      </div>

      {open && (
        <div className="border-t px-4 pb-4 pt-3 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            A API do Google retorna no máximo ~5 avaliações curadas. Se houver dados manuais,
            eles <strong>substituem</strong> a busca automática no relatório de{" "}
            <em>{clinicaNome}</em>.
          </p>
          <div className="rounded-md bg-muted/60 px-3 py-2 space-y-1 text-xs">
            <p className="font-medium text-foreground">Formato:</p>
            <p className="text-muted-foreground font-mono">
              estrelas; nome; &quot;texto&quot;; data{" "}
              <span className="not-italic">— separe múltiplas com</span>{" "}
              <span className="font-semibold text-foreground">/</span>
            </p>
            <p className="font-medium text-foreground pt-1">Exemplo:</p>
            <p className="font-mono text-muted-foreground break-all">
              5; João Lima; &quot;Ótima clínica!&quot;; 02/06
            </p>
          </div>
          <Textarea
            value={textoManual}
            onChange={e => onChangeTexto(e.target.value)}
            placeholder={'5; João Lima; "Ótima clínica!"; 02/06 / 4; Maria S.; "Bom atendimento"; 03/06'}
            className="text-sm resize-none h-24 font-mono"
          />
          {temTexto && (
            <p className={`text-xs font-medium ${count > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
              {count > 0
                ? `✓ ${count} avaliação(ões) reconhecida(s) — serão usadas em vez da API`
                : "⚠ Nenhuma avaliação reconhecida — verifique o formato acima"}
            </p>
          )}
          {!temTexto && (
            <p className="text-xs text-muted-foreground italic">
              Sem dados manuais — o relatório usará o resultado da API do Google (quando disponível).
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Leads Manual Panel (por clínica) ────────────────────────────────────────
function LeadsManualPanel({
  clinicaNome, dados, onChangeDados, labelOverride,
}: {
  clinicaNome: string;
  dados: LeadsManualDados | undefined;
  onChangeDados: (d: LeadsManualDados) => void;
  labelOverride?: string;
}) {
  const [open, setOpen] = useState(false);
  const total      = dados?.total ?? "";
  const convertidos = dados?.convertidos ?? "";
  const totalN      = parseInt(total, 10);
  const convertidosN = parseInt(convertidos, 10);
  const taxa =
    !isNaN(totalN) && totalN > 0 && !isNaN(convertidosN)
      ? `${((convertidosN / totalN) * 100).toFixed(1)}%`
      : null;
  const hasData = total !== "" || convertidos !== "";

  return (
    <div className="rounded-md border bg-muted/30">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left px-4 py-3">
        {open ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
        <span className="font-medium flex-1">{labelOverride ?? "Inserir leads manualmente"}</span>
        {hasData && (
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
            — {total || "?"} leads, {convertidos || "?"} conv.
          </span>
        )}
      </button>

      {open && (
        <div className="border-t px-4 pb-4 pt-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Preencha se <em>{clinicaNome}</em> não tem planilha de leads, ou para sobrescrever a coleta automática.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Total de leads</Label>
              <Input type="number" min="0" value={total}
                onChange={e => onChangeDados({ total: e.target.value, convertidos })}
                placeholder="0" className="text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Convertidos</Label>
              <Input type="number" min="0" value={convertidos}
                onChange={e => onChangeDados({ total, convertidos: e.target.value })}
                placeholder="0" className="text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Taxa (auto)</Label>
              <div className="flex h-9 items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground">
                {taxa ?? "—"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Formulário de dados do infográfico ───────────────────────────────────────
function FormImagem({ dados, onChange }: {
  dados: RelatorioImagemData;
  onChange: (d: RelatorioImagemData) => void;
}) {
  const { visaoGeral, destaques, alertas, acoes } = dados;
  const fat = visaoGeral.faturamento, ng = visaoGeral.npsGoogle, com = visaoGeral.comercial;
  const [loadingIA, setLoadingIA] = useState(false);
  const [erroIA,    setErroIA]    = useState<string | null>(null);
  const [iaUsada,   setIaUsada]   = useState(false);

  async function handleIA() {
    setLoadingIA(true);
    setErroIA(null);
    try {
      const res = await gerarSugestoesIA(dados);
      if (!res.ok) {
        setErroIA(res.erro);
        return;
      }
      onChange({ ...dados, destaques: res.sugestoes.destaques, alertas: res.sugestoes.alertas, acoes: res.sugestoes.acoes });
      setIaUsada(true);
    } catch (e) {
      setErroIA(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoadingIA(false);
    }
  }

  function onFatChange(patch: Partial<FaturamentoVisao>) {
    const newFat   = { ...fat, ...patch };
    const acumVal  = parseFmtNum(newFat.acumulado);
    const metaPVal = parseFmtNum(newFat.meta_periodo);
    const metaMVal = parseFmtNum(newFat.meta_mensal);
    // pct_periodo: diferença relativa vs meta proporcional (StatusPill mostra +/-X%)
    const pctPeriodo = (acumVal !== null && metaPVal !== null && metaPVal > 0)
      ? Math.abs(Math.round(((acumVal - metaPVal) / metaPVal) * 100))
      : null;
    // pct_mensal: atingimento (acumulado / meta_mensal * 100)
    const pctMensal = (acumVal !== null && metaMVal !== null && metaMVal > 0)
      ? Math.round((acumVal / metaMVal) * 100)
      : null;
    onChange({ ...dados, visaoGeral: { ...visaoGeral, faturamento: {
      ...newFat,
      pct_periodo:   pctPeriodo,
      acima_periodo: acumVal !== null && metaPVal !== null ? acumVal >= metaPVal : false,
      pct_mensal:    pctMensal,
      acima_mensal:  acumVal !== null && metaMVal !== null ? acumVal >= metaMVal : false,
    }}});
  }

  function onNgChange(patch: Partial<NpsGoogleVisao>) {
    onChange({ ...dados, visaoGeral: { ...visaoGeral, npsGoogle: { ...ng, ...patch } } });
  }

  const pctNps    = calcPct(ng.respostas_nps,    ng.meta_nps_meta);
  const pctGoogle = calcPct(ng.avaliacoes_google, ng.meta_google_meta);

  const FAT_EXTRA_FIELDS: [keyof FaturamentoVisao, string][] = [
    ["meta_periodo",    "Meta do período"],
    ["meta_mensal",     "Meta mensal"],
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Faturamento x Meta</h3>
        <div className="grid grid-cols-2 gap-3">
          {/* Faturamento no período (filtro selecionado — informativo, sem % de meta) */}
          {fat.realizado_filtro !== undefined && (
            <div className="space-y-1">
              <Label className="text-xs">Faturamento no período</Label>
              <CampoMonetario
                value={fat.realizado_filtro ?? ""}
                onChange={v => onFatChange({ realizado_filtro: v || undefined })}
                className="text-sm" />
              {fat.realizado_filtro_from_planilha && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Database className="h-3 w-3 shrink-0" />
                  Da planilha — informativo (% calculado sobre acumulado)
                </p>
              )}
            </div>
          )}
          {/* Acumulado do mês (dia 01 até data_fim — base dos %) */}
          <div className="space-y-1">
            <Label className="text-xs">
              {fat.realizado_filtro !== undefined ? "Acumulado no mês" : "Acumulado"}
            </Label>
            <CampoMonetario
              value={fat.acumulado ?? ""}
              onChange={v => onFatChange({ acumulado: v })}
              className="text-sm" />
            {fat.acumulado_from_planilha && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Database className="h-3 w-3 shrink-0" />
                {fat.realizado_filtro !== undefined ? "Da planilha (dia 01 → data fim)" : "Preenchido a partir da planilha"}
              </p>
            )}
          </div>
          {/* Meta do período e Meta mensal */}
          {FAT_EXTRA_FIELDS.map(([k, l]) => (
            <div key={k} className="space-y-1">
              <Label className="text-xs">{l}</Label>
              <CampoMonetario
                value={(fat as unknown as Record<string, string>)[k] ?? ""}
                onChange={v => onFatChange({ [k]: v } as Partial<FaturamentoVisao>)}
                className="text-sm" />
            </div>
          ))}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">% do período (auto, base = acumulado)</Label>
            <ReadOnlyPct
              value={fat.pct_periodo}
              acima={fat.acima_periodo}
              sufixo={` ${fat.acima_periodo ? "acima da meta" : "abaixo da meta"}`}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">% da meta mensal (auto, base = acumulado)</Label>
            <ReadOnlyPct
              value={fat.pct_mensal}
              acima={fat.acima_mensal}
              sufixo=" da meta"
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">NPS / Google</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Respostas NPS</Label>
            <Input type="number" value={ng.respostas_nps ?? ""} placeholder="—"
              onChange={e => onNgChange({ respostas_nps: e.target.value === "" ? null : Number(e.target.value) })}
              className="text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Avaliações Google</Label>
            <Input type="number" value={ng.avaliacoes_google ?? ""} placeholder="—"
              onChange={e => onNgChange({ avaliacoes_google: e.target.value === "" ? null : Number(e.target.value) })}
              className="text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Meta NPS (alvo)</Label>
            <Input type="number" value={ng.meta_nps_meta ?? ""} placeholder="—"
              onChange={e => onNgChange({ meta_nps_meta: e.target.value === "" ? null : Number(e.target.value) })}
              className="text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Meta Google (alvo)</Label>
            <Input type="number" value={ng.meta_google_meta ?? ""} placeholder="—"
              onChange={e => onNgChange({ meta_google_meta: e.target.value === "" ? null : Number(e.target.value) })}
              className="text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">% NPS (auto)</Label>
            <ReadOnlyPct value={pctNps} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">% Google (auto)</Label>
            <ReadOnlyPct value={pctGoogle} />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Comercial &amp; Conversão</h3>
        <div className="grid grid-cols-2 gap-3">
          {(["conversao_leads", "conversao_orcamentos", "total_leads", "total_orcamentos"] as (keyof typeof com)[]).map(k => {
            const isPct   = k === "conversao_leads" || k === "conversao_orcamentos";
            const isMoney = k === "total_orcamentos";
            const LABELS: Record<string, string> = {
              conversao_leads:      "Conversão de leads",
              conversao_orcamentos: "Conversão de orçamentos",
              total_leads:          "Total de leads",
              total_orcamentos:     "Total de orçamentos (R$)",
            };
            const val = (com as unknown as Record<string, unknown>)[k] as string ?? "";
            return (
              <div key={k} className="space-y-1">
                <Label className="text-xs">{LABELS[k]}</Label>
                {isMoney ? (
                  <CampoMonetario
                    value={val === "N/A" ? "" : val}
                    onChange={v => onChange({ ...dados, visaoGeral: { ...visaoGeral, comercial: { ...com, [k]: v || "N/A" } } })}
                    className="text-sm" />
                ) : (
                  <Input
                    value={val}
                    placeholder={isPct ? "Ex: 25%" : "N/A"}
                    onChange={e => onChange({ ...dados, visaoGeral: { ...visaoGeral, comercial: { ...com, [k]: e.target.value } } })}
                    className="text-sm" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Principais Destaques</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleIA}
            disabled={loadingIA}
            className="gap-1.5 text-xs font-normal h-7 px-2.5"
          >
            {loadingIA
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Sparkles className="h-3 w-3" />}
            {loadingIA ? "Gerando…" : "✨ Preencher com IA"}
          </Button>
        </div>
        {erroIA && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 shrink-0" />{erroIA}
          </p>
        )}
        {iaUsada && !erroIA && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Sparkles className="h-3 w-3 shrink-0" />
            Sugestão gerada por IA — revise antes de enviar.
          </p>
        )}
        <ListaDestaques items={destaques} onChange={v => onChange({ ...dados, destaques: v })} />
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Alertas</h3>
        <ListaEditavel items={alertas} onChange={v => onChange({ ...dados, alertas: v })} placeholder="Texto do alerta…" />
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Ações Sugeridas</h3>
        <ListaEditavel items={acoes} onChange={v => onChange({ ...dados, acoes: v })} placeholder="Texto da ação…" />
      </div>
    </div>
  );
}

// ─── Card WhatsApp por clínica ────────────────────────────────────────────────
function ClinicaWhatsappCard({ resultado }: { resultado: ResultadoClinica }) {
  const blocos = resultado.texto.split(SEPARATOR).map(b => b.trim()).filter(Boolean);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">{resultado.clinicaNome}</CardTitle>
          {blocos.length > 0 && <CopyButton text={resultado.texto} label="Copiar tudo" />}
        </div>
        {resultado.erros.map((e, i) => (
          <div key={i} className="flex items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:border-yellow-800/50 dark:bg-yellow-900/20 dark:text-yellow-400 mt-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{e}
          </div>
        ))}
      </CardHeader>
      <CardContent className="pt-0">
        {blocos.length > 0 ? (
          <div className="space-y-3">
            {blocos.map((bloco, i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-medium">
                    Bloco {i + 1} de {blocos.length}
                  </span>
                  <CopyButton text={bloco} label="Copiar bloco" />
                </div>
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed bg-muted/50 rounded-md p-4">
                  {bloco}
                </pre>
              </div>
            ))}
          </div>
        ) : resultado.erros.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem conteúdo gerado.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ─── Painel de filtros da página de feedbacks ────────────────────────────────
function FiltroComentariosPanel({
  filtro, onChange,
}: {
  filtro: FiltroForm;
  onChange: (f: FiltroForm) => void;
}) {
  const campos: { chave: keyof FiltroForm; label: string; placeholder: string }[] = [
    { chave: "maxComentarios", label: "Máximo de comentários", placeholder: "Todos" },
    { chave: "minPalavras",    label: "Mínimo de palavras",    placeholder: "Sem mínimo" },
    { chave: "maxPalavras",    label: "Máximo de palavras",    placeholder: "Sem máximo" },
  ];

  const limpo =
    filtro.maxComentarios === "" && filtro.minPalavras === "" &&
    filtro.maxPalavras === ""    && filtro.palavras === "";

  return (
    <div className="rounded-md border bg-muted/30 px-4 py-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Filtros opcionais — definem quais comentários já vêm marcados. Você ajusta
          um a um na lista depois de coletar os dados.
        </p>
        {!limpo && (
          <Button type="button" variant="ghost" size="sm" className="text-xs h-7 shrink-0"
            onClick={() => onChange(FILTRO_FORM_VAZIO)}>
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {campos.map(({ chave, label, placeholder }) => (
          <div key={chave} className="space-y-1">
            <Label className="text-xs">{label}</Label>
            <Input
              type="number" min="1" inputMode="numeric"
              value={filtro[chave]}
              placeholder={placeholder}
              onChange={e => onChange({ ...filtro, [chave]: e.target.value })}
              className="text-sm"
            />
          </div>
        ))}
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Contém alguma destas palavras</Label>
        <Input
          value={filtro.palavras}
          placeholder="Ex: médico, acolhimento, recepção — separe por vírgula"
          onChange={e => onChange({ ...filtro, palavras: e.target.value })}
          className="text-sm"
        />
      </div>
    </div>
  );
}

// ─── Lista de comentários com seleção ────────────────────────────────────────
function ListaComentarios({
  comentarios, selecionados, onChange, filtroLigado,
}: {
  comentarios: ComentarioItem[];
  selecionados: number[];
  onChange: (sel: number[]) => void;
  filtroLigado: boolean;
}) {
  const sel = new Set(selecionados);
  const todosMarcados = comentarios.length > 0 && sel.size === comentarios.length;

  function alternar(i: number) {
    const novo = new Set(sel);
    if (novo.has(i)) novo.delete(i); else novo.add(i);
    onChange([...novo].sort((a, b) => a - b));
  }

  function alternarTodos() {
    onChange(todosMarcados ? [] : comentarios.map((_, i) => i));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={todosMarcados}
            onChange={alternarTodos}
            className="h-4 w-4 cursor-pointer accent-[#7B099C]"
          />
          <span className="text-sm font-medium">
            {todosMarcados ? "Desmarcar todos" : "Selecionar todos"}
          </span>
        </label>
        <span className="text-xs text-muted-foreground">
          {sel.size} de {comentarios.length} selecionado{sel.size !== 1 ? "s" : ""}
          {filtroLigado ? " (pré-seleção pelo filtro)" : ""}
        </span>
      </div>

      <div className="max-h-80 overflow-y-auto rounded-md border divide-y">
        {comentarios.map((c, i) => {
          const marcado = sel.has(i);
          return (
            <label
              key={i}
              className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                marcado ? "bg-primary/5" : "hover:bg-muted/50"
              }`}
            >
              <input
                type="checkbox"
                checked={marcado}
                onChange={() => alternar(i)}
                className="h-4 w-4 mt-0.5 shrink-0 cursor-pointer accent-[#7B099C]"
              />
              <span className="min-w-0 flex-1 space-y-1">
                <span className={`block text-sm leading-snug ${marcado ? "" : "text-muted-foreground"}`}>
                  {c.texto}
                </span>
                <span className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                  <span className="font-medium">{c.autor}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 uppercase tracking-wide">
                    {c.origem === "google" ? "Google" : "NPS"}
                    {c.nota !== null ? ` · ${c.nota}` : ""}
                  </span>
                  {c.critica && (
                    <span className="rounded-full bg-destructive/10 text-destructive px-2 py-0.5">
                      crítica
                    </span>
                  )}
                  <span>{contarPalavrasTexto(c.texto)} palavras</span>
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function contarPalavrasTexto(texto: string): number {
  const limpo = (texto ?? "").trim();
  return limpo ? limpo.split(/\s+/).length : 0;
}

// ─── Uma página gerada (imagem + botões) ─────────────────────────────────────
function PaginaImagem({
  titulo, url, nomeArquivo, alt,
}: {
  titulo: string;
  url: string;
  nomeArquivo: string;
  alt: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground">{titulo}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />Abrir
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <a href={url} download={nomeArquivo}>
              <Download className="h-3.5 w-3.5" />Baixar PNG
            </a>
          </Button>
        </div>
      </div>
      <div className="rounded-lg overflow-hidden border bg-muted/30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={alt} className="w-full max-w-sm mx-auto block" />
      </div>
    </div>
  );
}

// ─── Card Imagem por clínica ──────────────────────────────────────────────────
function ClinicaImagemCard({
  resultado, datas, onUpdate, gerarComentarios, filtroLigado,
}: {
  resultado: ResultadoClinica;
  datas: { ini: string; fim: string };
  onUpdate: (r: ResultadoClinica) => void;
  gerarComentarios: boolean;
  filtroLigado: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const dados = resultado.imagemDados;

  const comentarios = dados?.comentarios ?? [];
  // Seleção ainda não definida (ex: relatório reaberto) = tudo que foi coletado.
  const selecionados = resultado.comentariosSel ?? comentarios.map((_, i) => i);
  const escolhidos   = selecionados
    .filter(i => i >= 0 && i < comentarios.length)
    .map(i => comentarios[i]);
  const totalCriticas  = escolhidos.filter(c => c.critica).length;
  const temComentarios = escolhidos.length > 0;

  async function handleGerar() {
    if (!dados) return;
    setSaving(true);
    try {
      // Só os comentários marcados vão para o relatório — os demais nem são salvos.
      const dadosParaSalvar = gerarComentarios
        ? { ...dados, comentarios: escolhidos }
        : { ...dados, comentarios: undefined };

      const { id } = await salvarRelatorioImagem({
        clinicaId:   resultado.clinicaId,
        ini:         datas.ini,
        fim:         datas.fim,
        dados:       dadosParaSalvar,
        relatorioId: resultado.imagemId,
      });
      const t = Date.now();
      onUpdate({
        ...resultado,
        imagemId:  id,
        imagemUrl: `/api/relatorio-imagem/${id}?t=${t}`,
        comentariosUrl: gerarComentarios && temComentarios
          ? `/api/relatorio-comentarios/${id}?t=${t}`
          : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  const slugNome = slugificar(resultado.clinicaNome);

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">{resultado.clinicaNome}</CardTitle>
        {resultado.erros.map((e, i) => (
          <div key={i} className="flex items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:border-yellow-800/50 dark:bg-yellow-900/20 dark:text-yellow-400 mt-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{e}
          </div>
        ))}
      </CardHeader>
      <CardContent>
        {dados ? (
          <div className="space-y-4">
            <FormImagem dados={dados} onChange={d => onUpdate({ ...resultado, imagemDados: d })} />
            <Separator />
            {gerarComentarios && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <MessageSquareQuote className="h-3.5 w-3.5 shrink-0" />
                    Página 2 — comentários
                  </h3>
                  {temComentarios && (
                    <span className="text-xs text-muted-foreground">
                      {totalCriticas > 0
                        ? `${totalCriticas} em críticas/sugestões`
                        : "nenhuma crítica"}
                    </span>
                  )}
                </div>

                {comentarios.length > 0 ? (<>
                  <ListaComentarios
                    comentarios={comentarios}
                    selecionados={selecionados}
                    filtroLigado={filtroLigado}
                    onChange={sel => onUpdate({ ...resultado, comentariosSel: sel })}
                  />
                  {!temComentarios && (
                    <p className="text-xs text-muted-foreground">
                      Nenhum comentário marcado — a página 2 não será gerada.
                    </p>
                  )}
                </>) : (
                  <p className="text-xs text-muted-foreground">
                    Nenhum comentário no período — a página 2 não será gerada.
                  </p>
                )}
              </div>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={handleGerar} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                {saving
                  ? "Gerando…"
                  : gerarComentarios && temComentarios ? "Gerar imagens" : "Gerar imagem"}
              </Button>
            </div>

            {resultado.imagemUrl && (
              <PaginaImagem
                titulo="Página 1 — Infográfico"
                url={resultado.imagemUrl}
                nomeArquivo={`${slugNome}_${datas.ini}.png`}
                alt={`Infográfico ${resultado.clinicaNome}`}
              />
            )}
            {resultado.comentariosUrl && (
              <PaginaImagem
                titulo="Página 2 — Feedbacks dos pacientes"
                url={resultado.comentariosUrl}
                nomeArquivo={`${slugNome}_${datas.ini}_feedbacks.png`}
                alt={`Feedbacks ${resultado.clinicaNome}`}
              />
            )}
          </div>
        ) : resultado.erros.length > 0 ? (
          <p className="text-sm text-destructive">Não foi possível coletar dados para este cliente.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function RelatorioClient({
  clinicas,
  relatorioParaReabrir,
}: {
  clinicas: Clinica[];
  relatorioParaReabrir?: RelatorioGerado | null;
}) {
  const rea = relatorioParaReabrir;

  const [clinicasSel, setClinicasSel] = useState<Set<string>>(
    () => rea ? new Set([rea.clinica_id]) : new Set()
  );
  const [preset, setPreset] = useState<Preset>(
    () => rea ? "custom" : "semana_passada"
  );
  const [customIni, setCustomIni] = useState(
    () => (rea?.data_inicio) ?? format(new Date(), "yyyy-MM-dd")
  );
  const [customFim, setCustomFim] = useState(
    () => (rea?.data_fim) ?? format(new Date(), "yyyy-MM-dd")
  );
  const [formato, setFormato] = useState<Formato>(
    () => (rea?.formato as Formato | undefined) ?? "whatsapp_pesquisas"
  );

  // Página 2 opcional: feedbacks dos pacientes (NPS + Google)
  const [gerarComentarios, setGerarComentarios] = useState(false);
  const [filtroForm, setFiltroForm] = useState<FiltroForm>(FILTRO_FORM_VAZIO);

  // Per-clinic manual data (keyed by clinicaId)
  const [googleManualMap, setGoogleManualMap] = useState<Record<string, string>>({});
  const [leadsManualMap, setLeadsManualMap]   = useState<Record<string, LeadsManualDados>>({});

  const [resultados, setResultados] = useState<ResultadoClinica[]>(() => {
    if (!rea || rea.formato !== "imagem") return [];
    const dj = rea.dados_json;
    if (!dj || typeof dj !== "object" || Array.isArray(dj)) return [];
    const clinica = clinicas.find((c) => c.id === rea.clinica_id);
    return [{
      clinicaId:   rea.clinica_id,
      clinicaNome: clinica?.nome ?? rea.clinica_id,
      texto:       "",
      erros:       [],
      imagemId:    rea.id,
      imagemUrl:   `/api/relatorio-imagem/${rea.id}`,
      imagemDados: dj as unknown as RelatorioImagemData,
      comentariosUrl: ((dj as unknown as RelatorioImagemData).comentarios?.length ?? 0) > 0
        ? `/api/relatorio-comentarios/${rea.id}`
        : undefined,
      comentariosSel: ((dj as unknown as RelatorioImagemData).comentarios ?? [])
        .map((_, i) => i),
    }];
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [progresso, setProgresso]     = useState<{ done: number; total: number } | null>(null);
  const [datasGeradas, setDatasGeradas] = useState<{ ini: string; fim: string } | null>(
    () => rea?.data_inicio && rea.data_fim
      ? { ini: rea.data_inicio, fim: rea.data_fim }
      : null
  );
  const [isZipping, setIsZipping]     = useState(false);

  function getDatas(): { ini: string; fim: string } {
    return resolverPeriodo(preset, customIni, customFim);
  }

  /**
   * O filtro define a pré-seleção: ao mexer nele, as marcações de todas as
   * clínicas já coletadas são recalculadas (escolhas manuais são substituídas).
   */
  function atualizarFiltro(novo: FiltroForm) {
    setFiltroForm(novo);
    const filtro = formParaFiltro(novo);
    setResultados(prev => prev.map(r =>
      r.imagemDados
        ? { ...r, comentariosSel: filtrarComentarios(r.imagemDados.comentarios ?? [], filtro) }
        : r
    ));
  }

  function toggleClinica(id: string) {
    setClinicasSel(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleAll() {
    setClinicasSel(
      clinicasSel.size === clinicas.length
        ? new Set()
        : new Set(clinicas.map(c => c.id))
    );
  }

  const selectedClinics = clinicas.filter(c => clinicasSel.has(c.id));
  const multiClinica    = selectedClinics.length > 1;

  async function handleGerar() {
    const ids = selectedClinics.map(c => c.id);
    if (!ids.length) return;

    const datas = getDatas();
    setIsGenerating(true);
    setResultados([]);
    setDatasGeradas(datas);

    let doneCount = 0;
    setProgresso({ done: 0, total: ids.length });

    const tasks = ids.map(id => {
      const clinica = clinicas.find(c => c.id === id)!;
      const base: ResultadoClinica = { clinicaId: id, clinicaNome: clinica.nome, texto: "", erros: [] };

      return async (): Promise<ResultadoClinica> => {
        const googleAvaliacoes = parseGoogleTexto(googleManualMap[id] ?? "");
        const leadsManual      = parseLeadsManual(leadsManualMap[id]);

        if (formato === "imagem") {
          return prepararDadosImagem({
            clinicaId: id,
            ini: datas.ini,
            fim: datas.fim,
            leadsManual,
            incluirComentarios: gerarComentarios,
            googleManualAvaliacoes:
              gerarComentarios && googleAvaliacoes.length > 0 ? googleAvaliacoes : undefined,
          })
            .then(({ dados, erros }): ResultadoClinica => ({
              ...base,
              erros,
              imagemDados: dados,
              comentariosSel: filtrarComentarios(dados.comentarios ?? [], formParaFiltro(filtroForm)),
            }))
            .catch((e): ResultadoClinica => ({
              ...base,
              erros: [`Erro ao coletar dados: ${e instanceof Error ? e.message : String(e)}`],
            }));
        }
        return gerarRelatorioWhatsapp({
          clinicaId: id,
          ini: datas.ini,
          fim: datas.fim,
          formato,
          googleManualAvaliacoes: googleAvaliacoes.length > 0 ? googleAvaliacoes : undefined,
          leadsManual,
        })
          .then(({ texto, erros }): ResultadoClinica => ({ ...base, texto, erros }))
          .catch((e): ResultadoClinica => ({
            ...base,
            erros: [`Erro ao gerar relatório: ${e instanceof Error ? e.message : String(e)}`],
          }));
      };
    });

    await withConcurrency(tasks, 3, result => {
      doneCount++;
      setResultados(prev => [...prev, result]);
      setProgresso({ done: doneCount, total: ids.length });
    });

    setIsGenerating(false);
    setProgresso(null);
  }

  async function handleDownloadAll() {
    const comImagem = resultados.filter(r => r.imagemUrl);
    if (!comImagem.length) return;

    setIsZipping(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip  = new JSZip();
      const datas = datasGeradas ?? getDatas();

      for (const r of comImagem) {
        const slug = slugificar(r.clinicaNome);
        const paginas: { url: string; nome: string }[] = [
          { url: r.imagemUrl!, nome: `${slug}_${datas.ini}_${datas.fim}.png` },
        ];
        if (r.comentariosUrl) {
          paginas.push({
            url:  r.comentariosUrl,
            nome: `${slug}_${datas.ini}_${datas.fim}_feedbacks.png`,
          });
        }
        for (const pagina of paginas) {
          try {
            const res  = await fetch(pagina.url);
            const blob = await res.blob();
            zip.file(pagina.nome, blob);
          } catch {
            // uma imagem que falha nao aborta o zip
          }
        }
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url;
      a.download = `relatorios_${datas.ini}_${datas.fim}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsZipping(false);
    }
  }

  const imagensGeradas = resultados.filter(r => r.imagemUrl);
  const totalPaginas   = imagensGeradas.reduce(
    (acc, r) => acc + 1 + (r.comentariosUrl ? 1 : 0), 0
  );
  const podGerar       = clinicasSel.size > 0 && !isGenerating;
  const showLeadsPanel = formato === "whatsapp_pesquisas" || formato === "imagem";

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold font-heading">Gerar Report Semanal</h1>

      {/* ── Configurações ── */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Configurações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">

          <SelecaoClinicas
            clinicas={clinicas}
            selecionadas={clinicasSel}
            onToggle={toggleClinica}
            onToggleTodas={toggleAll}
          />

          <SelecaoPeriodo
            preset={preset}
            onPreset={setPreset}
            customIni={customIni}
            onCustomIni={setCustomIni}
            customFim={customFim}
            onCustomFim={setCustomFim}
          />

          {/* Formato */}
          <div className="space-y-2">
            <Label>Formato</Label>
            <div className="flex flex-wrap gap-2">
              {FORMATO_OPTIONS.map(f => (
                <Button key={f.value} type="button"
                  variant={formato === f.value ? "default" : "outline"}
                  size="sm" onClick={() => setFormato(f.value)}>
                  {f.value === "imagem" && <ImageIcon className="h-3.5 w-3.5 mr-1.5" />}
                  {f.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Página 2 opcional — feedbacks dos pacientes */}
          {formato === "imagem" && (
            <div className="space-y-2">
              <label className={`flex items-start gap-3 rounded-md border px-3 py-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                gerarComentarios ? "border-primary/50 bg-primary/5" : ""
              }`}>
                <input
                  type="checkbox"
                  checked={gerarComentarios}
                  onChange={e => setGerarComentarios(e.target.checked)}
                  className="h-4 w-4 mt-0.5 cursor-pointer accent-[#7B099C]"
                />
                <span className="space-y-0.5">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <MessageSquareQuote className="h-3.5 w-3.5 shrink-0" />
                    Gerar página de comentários (feedbacks)
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Gera uma segunda imagem com os comentários do NPS e as avaliações do Google.
                    Quem pediu sigilo aparece como &quot;Paciente (anônimo)&quot;.
                  </span>
                </span>
              </label>

              {gerarComentarios && (
                <FiltroComentariosPanel filtro={filtroForm} onChange={atualizarFiltro} />
              )}
            </div>
          )}

          {/* Google fallback — pesquisas sempre; imagem quando a página 2 está ligada */}
          {(formato === "whatsapp_pesquisas" || (formato === "imagem" && gerarComentarios)) && selectedClinics.length > 0 && (
            <div className="space-y-2">
              {multiClinica && (
                <Label className="text-sm text-muted-foreground">
                  Avaliações Google — por cliente (opcional)
                </Label>
              )}
              {selectedClinics.map(c => (
                <GoogleFallbackPanel
                  key={c.id}
                  clinicaNome={c.nome}
                  placeId={c.google_place_id}
                  textoManual={googleManualMap[c.id] ?? ""}
                  onChangeTexto={val => setGoogleManualMap(prev => ({ ...prev, [c.id]: val }))}
                  labelOverride={multiClinica ? `Avaliações Google — ${c.nome}` : undefined}
                />
              ))}
            </div>
          )}

          {/* Leads manual — para pesquisas e imagem, um painel por clínica selecionada */}
          {showLeadsPanel && selectedClinics.length > 0 && (
            <div className="space-y-2">
              {multiClinica && (
                <Label className="text-sm text-muted-foreground">
                  Leads — por cliente (opcional, sobrescreve planilha)
                </Label>
              )}
              {selectedClinics.map(c => (
                <LeadsManualPanel
                  key={c.id}
                  clinicaNome={c.nome}
                  dados={leadsManualMap[c.id]}
                  onChangeDados={d => setLeadsManualMap(prev => ({ ...prev, [c.id]: d }))}
                  labelOverride={multiClinica ? `Leads — ${c.nome}` : undefined}
                />
              ))}
            </div>
          )}

          <Separator />

          <div className="flex items-center gap-4">
            <Button onClick={handleGerar} disabled={!podGerar} className="gap-2">
              {isGenerating
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <FileText className="h-4 w-4" />}
              {isGenerating
                ? (progresso
                    ? `Gerando ${progresso.done + 1} de ${progresso.total}…`
                    : "Gerando…")
                : formato === "imagem"
                  ? `Coletar dados${clinicasSel.size > 1 ? ` (${clinicasSel.size})` : ""}`
                  : `Gerar${clinicasSel.size > 1 ? ` (${clinicasSel.size})` : ""}`}
            </Button>
            {!isGenerating && clinicasSel.size === 0 && (
              <p className="text-sm text-muted-foreground">Selecione ao menos um cliente.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Resultados ── */}
      {(resultados.length > 0 || isGenerating) && (
        <div className="space-y-4">

          {/* Progresso */}
          {isGenerating && progresso && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <span>
                {progresso.done === 0
                  ? `Iniciando geração para ${progresso.total} cliente${progresso.total !== 1 ? "s" : ""}…`
                  : `${progresso.done} de ${progresso.total} concluído${progresso.done !== 1 ? "s" : ""}${
                      progresso.done < progresso.total ? " — aguardando os demais…" : ""
                    }`}
              </span>
            </div>
          )}

          {/* Ações globais */}
          {resultados.length > 1 && formato !== "imagem" && (
            <div className="flex justify-end">
              <CopyButton
                text={resultados.map(r => `===== ${r.clinicaNome} =====\n\n${r.texto}`).join("\n\n")}
                label={`Copiar tudo (${resultados.length} clientes)`}
              />
            </div>
          )}
          {formato === "imagem" && imagensGeradas.length > 0 && (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={handleDownloadAll} disabled={isZipping} className="gap-1.5">
                {isZipping
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Archive className="h-3.5 w-3.5" />}
                {isZipping
                  ? "Preparando ZIP…"
                  : `Baixar todas (${totalPaginas} imagem${totalPaginas !== 1 ? "ns" : ""})`}
              </Button>
            </div>
          )}

          {/* Cards por clínica */}
          {resultados.map(r =>
            formato === "imagem" ? (
              <ClinicaImagemCard
                key={r.clinicaId}
                resultado={r}
                gerarComentarios={gerarComentarios}
                filtroLigado={filtroAtivo(formParaFiltro(filtroForm))}
                datas={datasGeradas ?? getDatas()}
                onUpdate={upd =>
                  setResultados(prev => prev.map(x => x.clinicaId === upd.clinicaId ? upd : x))
                }
              />
            ) : (
              <ClinicaWhatsappCard key={r.clinicaId} resultado={r} />
            )
          )}
        </div>
      )}
    </div>
  );
}
