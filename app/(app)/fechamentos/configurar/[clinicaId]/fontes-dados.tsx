"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, CircleCheck, CircleDashed, CircleX, Loader2, Plus, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { FontesFechamento } from "@/lib/fechamentos/coleta";
import type { FontePersonalizada } from "@/lib/fechamentos/fonte-personalizada";
import { salvarConfig, salvarFontesExtras, previaFonte } from "../../actions";
import { CorpoFontePadrao, FONTES_PADRAO, cfgInicial, testarPadrao, type CfgPadrao, type EstadoConexao, type NomePadrao } from "./configurar-client";
import { EditorFontePersonalizada, novaFonte, type Destino } from "./fontes-personalizadas";

/*
 * Todas as fontes do cliente numa lista só: as planilhas padrão do fechamento
 * e as personalizadas, cada uma num card recolhido com selo e status.
 */

function Selo({ padrao }: { padrao: boolean }) {
  return padrao
    ? <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">Padrão</span>
    : <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Personalizada</span>;
}

function Status({ configurada, estado, obrigatoria }: { configurada: boolean; estado: EstadoConexao; obrigatoria?: boolean }) {
  if (estado?.tipo === "erro") return <span className="flex items-center gap-1 text-xs text-destructive" title={estado.texto}><CircleX className="h-3.5 w-3.5" />Com erro</span>;
  if (estado?.tipo === "ok") return <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400"><CircleCheck className="h-3.5 w-3.5" />Conectada · {estado.texto}</span>;
  if (configurada) return <span className="flex items-center gap-1 text-xs text-muted-foreground"><CircleCheck className="h-3.5 w-3.5" />Configurada</span>;
  return <span className={`flex items-center gap-1 text-xs ${obrigatoria ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}><CircleDashed className="h-3.5 w-3.5" />{obrigatoria ? "Pendente (obrigatória)" : "Não configurada"}</span>;
}

function Card({ titulo, tipo, padrao, aberto, onAbrir, status, children }: { titulo: string; tipo: string; padrao: boolean; aberto: boolean; onAbrir: () => void; status: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="rounded-lg border bg-card">
      <button type="button" onClick={onAbrir} aria-expanded={aberto} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-muted/40">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2"><span className="font-medium">{titulo}</span><Selo padrao={padrao} /></span>
          <span className="block truncate text-xs text-muted-foreground">{tipo}</span>
        </span>
        {status}
        {aberto ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {aberto && <div className="border-t px-4 py-4">{children}</div>}
    </li>
  );
}

export function FontesDados({ clinicaId, padraoInicial, extrasIniciais, destinos }: { clinicaId: string; padraoInicial: FontesFechamento; extrasIniciais: FontePersonalizada[]; destinos: Destino[] }) {
  const router = useRouter();
  const [padrao, setPadrao] = useState<Record<NomePadrao, CfgPadrao>>(() => cfgInicial(padraoInicial));
  const [extras, setExtras] = useState(extrasIniciais);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [estados, setEstados] = useState<Record<string, EstadoConexao>>({});
  const [mudouPadrao, setMudouPadrao] = useState(false);
  const [mudouExtras, setMudouExtras] = useState(false);
  const [salvando, iniciarSalvar] = useTransition();
  const [testando, iniciarTeste] = useTransition();

  const alternar = (id: string) => setAbertos((a) => { const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const estado = (id: string, e: EstadoConexao) => setEstados((x) => ({ ...x, [id]: e }));
  const alterarExtras = (lista: FontePersonalizada[]) => { setExtras(lista); setMudouExtras(true); };
  const mudou = mudouPadrao || mudouExtras;

  const testarTodas = () => iniciarTeste(async () => {
    const tarefas: Promise<void>[] = [];
    for (const f of FONTES_PADRAO) {
      const c = padrao[f.nome];
      if (c.sheetId && c.aba) tarefas.push(testarPadrao(f.nome, c).then((r) => estado(f.nome, r.estado)));
    }
    for (const f of extras) {
      if (f.sheetId && f.aba) tarefas.push(previaFonte({ clinicaId, fonte: f }).then((r) => estado(f.id, r.erro ? { tipo: "erro", texto: r.erro } : r.leitura ? { tipo: "ok", texto: `${r.leitura.linhas} linhas` } : null)));
    }
    await Promise.all(tarefas);
    toast.success("Teste concluído.");
  });

  const salvar = () => iniciarSalvar(async () => {
    if (mudouPadrao) {
      if (!padrao.vendas.sheetId || !padrao.despesas.sheetId) { toast.error("Vendas e Despesas são obrigatórias para gerar fechamentos."); return; }
      const r = await salvarConfig({ clinicaId, fontes: padrao as unknown as FontesFechamento });
      if (!r.ok) { toast.error(r.erro); return; }
      setMudouPadrao(false);
    }
    if (mudouExtras) {
      const r = await salvarFontesExtras({ clinicaId, fontes: extras.map((f) => ({ ...f, nome: f.nome.trim() || "Fonte personalizada" })) });
      if (!r.ok) { toast.error(r.erro); return; }
      setExtras(r.dados); setMudouExtras(false);
    }
    toast.success("Fontes salvas.");
    router.refresh();
  });

  const configuradas = FONTES_PADRAO.filter((f) => padrao[f.nome].sheetId && padrao[f.nome].aba).length + extras.filter((f) => f.sheetId && f.aba).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          {configuradas} {configuradas === 1 ? "fonte configurada" : "fontes configuradas"}. Cada planilha precisa estar compartilhada, como Leitor, com a conta de serviço do app. O app só lê as colunas que usa.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={testarTodas} disabled={testando}>{testando ? <Loader2 className="animate-spin" /> : <RefreshCw />}{testando ? "Lendo as planilhas…" : "Testar todas"}</Button>
          <Button size="sm" variant="outline" onClick={() => { const n = novaFonte(); alterarExtras([...extras, n]); setAbertos((a) => new Set(a).add(n.id)); }} disabled={extras.length >= 12}><Plus />Fonte personalizada</Button>
        </div>
      </div>

      <ul className="space-y-2">
        {FONTES_PADRAO.map((f) => {
          const c = padrao[f.nome];
          return (
            <Card key={f.nome} titulo={f.titulo} tipo={f.ajuda + (f.obrigatoria ? "" : " · opcional")} padrao aberto={abertos.has(f.nome)} onAbrir={() => alternar(f.nome)}
              status={<Status configurada={!!(c.sheetId && c.aba)} estado={estados[f.nome] ?? null} obrigatoria={f.obrigatoria} />}>
              <CorpoFontePadrao f={f} cfg={c} onChange={(x) => { setPadrao({ ...padrao, [f.nome]: x }); setMudouPadrao(true); }} onEstado={(e) => estado(f.nome, e)} />
            </Card>
          );
        })}
        {extras.map((f, k) => {
          const visiveis = f.indicadores.filter((d) => !d.oculto).length;
          return (
            <Card key={f.id} titulo={f.nome || "Nova fonte"} tipo={`${f.aba ? `aba ${f.aba}` : "sem planilha"} · ${visiveis} ${visiveis === 1 ? "indicador" : "indicadores"}`} padrao={false}
              aberto={abertos.has(f.id)} onAbrir={() => alternar(f.id)} status={<Status configurada={!!(f.sheetId && f.aba)} estado={estados[f.id] ?? null} />}>
              <EditorFontePersonalizada clinicaId={clinicaId} f={f} todas={extras} destinos={destinos}
                onChange={(x) => alterarExtras(extras.map((y, j) => (j === k ? x : y)))}
                onRemover={() => alterarExtras(extras.filter((_, j) => j !== k))}
                onEstado={(e) => estado(f.id, e)} />
            </Card>
          );
        })}
      </ul>

      <div className="sticky bottom-0 -mx-1 flex items-center justify-end gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur">
        <span className={`text-xs ${mudou ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`} aria-live="polite">{mudou ? "Alterações não salvas" : "Sem alterações"}</span>
        <Button onClick={salvar} disabled={salvando || !mudou}>{salvando ? <Loader2 className="animate-spin" /> : <Save />}Salvar fontes</Button>
      </div>
    </div>
  );
}
