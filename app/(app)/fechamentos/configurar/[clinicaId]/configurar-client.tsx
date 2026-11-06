"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, PlayCircle, Save, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { DefinicaoFonte } from "@/lib/fechamentos/colunas";
import type { FontesFechamento } from "@/lib/fechamentos/coleta";
import { DEF_DESPESAS, DEF_LEADS, DEF_NPS, DEF_ORCAMENTOS, DEF_VENDAS } from "@/lib/fechamentos/leitores";
import { salvarConfig, testarLeitura } from "../../actions";

type Nome = "vendas" | "despesas" | "orcamentos" | "leads" | "nps";
type Cfg = { sheetId: string; aba: string; colunas?: Record<string, string>; linhaCabecalho?: number };

const FONTES: { nome: Nome; titulo: string; ajuda: string; def: DefinicaoFonte<string>; obrigatoria?: boolean }[] = [
  { nome: "vendas", titulo: "Vendas", ajuda: "Faturamento, pacientes, grupos de receita", def: DEF_VENDAS, obrigatoria: true },
  { nome: "despesas", titulo: "Despesas", ajuda: "Saídas por grupo e categoria", def: DEF_DESPESAS, obrigatoria: true },
  { nome: "orcamentos", titulo: "Fechamentos / orçamentos", ajuda: "Orçamentos gerados e fechados", def: DEF_ORCAMENTOS },
  { nome: "leads", titulo: "Leads / CRM", ajuda: "Funil de leads, origem e objeções", def: DEF_LEADS },
  { nome: "nps", titulo: "NPS", ajuda: "Pesquisa de satisfação", def: DEF_NPS },
];

type Teste = Awaited<ReturnType<typeof testarLeitura>>;

function Fonte({ f, cfg, onChange }: { f: (typeof FONTES)[number]; cfg: Cfg; onChange: (c: Cfg) => void }) {
  const [teste, setTeste] = useState<Teste | null>(null);
  const [testando, iniciar] = useTransition();
  const testar = () => iniciar(async () => setTeste(await testarLeitura({ nome: f.nome, cfg: cfg as never })));
  const campo = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
  const origem = (teste?.leitura?.colunas.origem ?? {}) as Record<string, { letra: string; cabecalho: string; como: string } | undefined>;

  return (
    <section className="space-y-4 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">{f.titulo}{f.obrigatoria ? "" : <span className="ml-2 text-xs font-normal text-muted-foreground">opcional</span>}</h2>
        <span className="text-xs text-muted-foreground">{f.ajuda}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
        <label className="flex flex-col gap-1.5 text-sm font-medium">Link da planilha
          <input className={campo} value={cfg.sheetId} onChange={(e) => onChange({ ...cfg, sheetId: e.target.value })} placeholder="https://docs.google.com/spreadsheets/d/…" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">Nome da aba
          <input className={campo} value={cfg.aba} onChange={(e) => onChange({ ...cfg, aba: e.target.value })} placeholder="Base" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" onClick={testar} disabled={testando || !cfg.sheetId || !cfg.aba}>
          {testando ? <Loader2 className="animate-spin" /> : <PlayCircle />}Testar leitura
        </Button>
        {teste?.erro && <span className="flex items-center gap-1.5 text-sm text-destructive"><XCircle className="h-4 w-4" />{teste.erro}</span>}
        {teste && !teste.erro && teste.leitura && (
          <span className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" />{teste.leitura.linhas} linhas lidas{teste.leitura.avisos.length ? ` · ${teste.leitura.avisos.length} com data ou valor ilegível` : ""}</span>
        )}
      </div>
      {(teste?.leitura || Object.keys(cfg.colunas ?? {}).length > 0) && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2 font-medium">Campo</th><th className="px-3 py-2 font-medium">Coluna encontrada</th><th className="px-3 py-2 font-medium">Indicar coluna</th></tr></thead>
            <tbody>
              {Object.entries(f.def).map(([k, d]) => {
                const o = origem[k];
                return (
                  <tr key={k} className="border-t">
                    <td className="px-3 py-1.5">{d.rotulo}{d.obrigatorio ? <span className="text-destructive"> *</span> : ""}</td>
                    <td className="px-3 py-1.5">{o ? <span><b>{o.letra}</b> · {o.cabecalho || <i className="text-muted-foreground">sem título</i>}</span> : teste?.leitura ? <span className={d.obrigatorio ? "text-destructive" : "text-muted-foreground"}>não encontrada</span> : "—"}</td>
                    <td className="px-3 py-1.5">
                      <input className="h-8 w-28 rounded-md border border-input bg-background px-2 text-sm" placeholder="letra ou nome" aria-label={`Coluna de ${d.rotulo}`}
                        value={cfg.colunas?.[k] ?? ""} onChange={(e) => onChange({ ...cfg, colunas: { ...(cfg.colunas ?? {}), [k]: e.target.value } })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function ConfigurarClient({ clinicaId, inicial }: { clinicaId: string; inicial: FontesFechamento }) {
  const router = useRouter();
  const [fontes, setFontes] = useState<Record<Nome, Cfg>>(() =>
    Object.fromEntries(FONTES.map((f) => {
      const c = (inicial as Record<string, Cfg | undefined>)[f.nome];
      return [f.nome, { sheetId: c?.sheetId ? `https://docs.google.com/spreadsheets/d/${c.sheetId}` : "", aba: c?.aba ?? "", colunas: c?.colunas ?? {}, linhaCabecalho: c?.linhaCabecalho }];
    })) as Record<Nome, Cfg>,
  );
  const [salvando, iniciar] = useTransition();
  const salvar = () => iniciar(async () => {
    const r = await salvarConfig({ clinicaId, fontes: fontes as unknown as FontesFechamento });
    if (!r.ok) { toast.error(r.erro); return; }
    toast.success("Planilhas salvas.");
    router.push("/fechamentos");
  });

  return (
    <div className="space-y-4">
      {FONTES.map((f) => <Fonte key={f.nome} f={f} cfg={fontes[f.nome]} onChange={(c) => setFontes({ ...fontes, [f.nome]: c })} />)}
      <div className="flex justify-end">
        <Button onClick={salvar} disabled={salvando || !fontes.vendas.sheetId || !fontes.despesas.sheetId}>
          {salvando ? <Loader2 className="animate-spin" /> : <Save />}Salvar planilhas
        </Button>
      </div>
    </div>
  );
}
