"use client";

import { useState } from "react";
import { Check, Loader2, AlertTriangle, FileSpreadsheet, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { salvarIndicadores } from "../actions";
import {
  INDICADORES, INDICADOR_LABEL, INDICADOR_FONTE, INDICADOR_TEM_CATEGORIA,
  INDICADOR_CADENCIA, CADENCIA_LABEL, INDICADOR_LIMITE_DIAS_UTEIS,
} from "@/lib/checkpoint/indicadores";
import type { NomeIndicador, TipoFonte } from "@/lib/supabase/types";

const FONTE_LABEL: Record<TipoFonte, string> = {
  pre_consulta: "Pré-consulta",
  nps:          "NPS",
  leads:        "Leads",
  faturamento:  "Faturamento",
  despesa:      "Despesas",
};

export function IndicadoresForm({
  clinicaId, ativosIniciais, tiposFonte, jaSalvo,
}: {
  clinicaId: string;
  ativosIniciais: NomeIndicador[];
  tiposFonte: TipoFonte[];
  jaSalvo: boolean;
}) {
  const [ativos, setAtivos] = useState<Set<NomeIndicador>>(new Set(ativosIniciais));
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const temFonte = new Set(tiposFonte);

  function alternar(ind: NomeIndicador) {
    setAtivos(prev => {
      const n = new Set(prev);
      if (n.has(ind)) n.delete(ind); else n.add(ind);
      return n;
    });
    setSalvo(false);
  }

  async function handleSalvar() {
    setSalvando(true);
    setErro(null);
    try {
      const res = await salvarIndicadores(clinicaId, [...ativos]);
      if (res.ok) setSalvo(true);
      else setErro(res.erro ?? "Não foi possível salvar.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Indicadores do checkpoint</CardTitle>
        {!jaSalvo && (
          <p className="text-sm text-muted-foreground">
            Sugestão inicial: os indicadores que já têm planilha configurada vêm ligados.
            Ligue os demais se o cliente acompanha esses números por fora.
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="divide-y rounded-md border">
          {INDICADORES.map(ind => {
            const fonte     = INDICADOR_FONTE[ind];
            const configurada = fonte !== null && temFonte.has(fonte);
            const ligado    = ativos.has(ind);

            return (
              <div key={ind} className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">{INDICADOR_LABEL[ind]}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {configurada ? (
                      <>
                        <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
                        Planilha de {FONTE_LABEL[fonte!]} — {CADENCIA_LABEL[INDICADOR_CADENCIA[ind]]}
                        {" "}(alerta com mais de {INDICADOR_LIMITE_DIAS_UTEIS[ind]} dias úteis sem lançamento)
                        {INDICADOR_TEM_CATEGORIA[ind] ? " e categoria preenchida" : ""}
                      </>
                    ) : (
                      <>
                        <PencilLine className="h-3.5 w-3.5 shrink-0" />
                        {fonte === null
                          ? "Sem planilha própria — preenchimento manual"
                          : `Planilha de ${FONTE_LABEL[fonte]} não configurada — preenchimento manual`}
                      </>
                    )}
                  </p>
                </div>
                <Switch
                  checked={ligado}
                  onCheckedChange={() => alternar(ind)}
                  aria-label={`Ativar ${INDICADOR_LABEL[ind]}`}
                  className="mt-0.5 shrink-0"
                />
              </div>
            );
          })}
        </div>

        {erro && (
          <p className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />{erro}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={handleSalvar} disabled={salvando} className="gap-2">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {salvando ? "Salvando…" : "Salvar indicadores"}
          </Button>
          {salvo && !salvando && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
              <Check className="h-4 w-4" />Salvo
            </span>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {ativos.size} de {INDICADORES.length} ativo{ativos.size !== 1 ? "s" : ""}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
