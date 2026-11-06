"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, PlayCircle, Plus, Save, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CATALOGO_COMPARAVEL, ROTULOS_CAMPO, type CampoPersonalizado, type CampoQuebra, type FontePersonalizada } from "@/lib/fechamentos/fonte-personalizada";
import { salvarFontesExtras, testarFonteExtra } from "../../actions";

const campo = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
const CAMPOS: CampoPersonalizado[] = ["data", "valor", "categoria", "status", "profissional", "quantidade"];
const QUEBRAS: { k: CampoQuebra; rotulo: string }[] = [{ k: "categoria", rotulo: "Categoria" }, { k: "status", rotulo: "Status" }, { k: "profissional", rotulo: "Profissional" }];
const EXEMPLOS = ["Contratos", "Cirurgias", "Recall", "Entradas bancárias", "Procedimentos"];

type Teste = Awaited<ReturnType<typeof testarFonteExtra>>;

const nova = (): FontePersonalizada => ({
  id: crypto.randomUUID(), nome: "", sheetId: "", aba: "", colunas: {}, filtro: null,
  medidas: { quantidade: true, valor: false, media: false }, quebras: ["categoria"], comparavel: "",
});

function Editor({ f, onChange, onRemover }: { f: FontePersonalizada; onChange: (f: FontePersonalizada) => void; onRemover: () => void }) {
  const [teste, setTeste] = useState<Teste | null>(null);
  const [testando, iniciar] = useTransition();
  const testar = () => iniciar(async () => setTeste(await testarFonteExtra({ fonte: f })));
  const achadas = Object.fromEntries((teste?.leitura?.colunas ?? []).map((c) => [c.campo, c])) as Partial<Record<CampoPersonalizado, { letra: string; cabecalho: string }>>;
  const set = (p: Partial<FontePersonalizada>) => onChange({ ...f, ...p });

  return (
    <div className="space-y-4 border-t pt-4">
      <div className="grid gap-3 sm:grid-cols-[220px_1fr_180px]">
        <label className="flex flex-col gap-1.5 text-sm font-medium">Nome no relatório
          <input className={campo} value={f.nome} list="exemplos-fonte" placeholder="Ex.: Cirurgias" onChange={(e) => set({ nome: e.target.value })} />
          <datalist id="exemplos-fonte">{EXEMPLOS.map((x) => <option key={x} value={x} />)}</datalist>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">Link da planilha
          <input className={campo} value={f.sheetId} placeholder="https://docs.google.com/spreadsheets/d/…" onChange={(e) => set({ sheetId: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">Nome da aba
          <input className={campo} value={f.aba} placeholder="Ex.: Base" onChange={(e) => set({ aba: e.target.value })} />
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Colunas <span className="font-normal text-muted-foreground">· deixe em branco para o app procurar pelo nome; ou escreva o nome do cabeçalho ou a letra (ex.: C)</span></p>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {CAMPOS.map((c) => (
            <label key={c} className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {ROTULOS_CAMPO[c]}{c === "data" ? " *" : ""}
              <input className={`${campo} h-8 text-foreground`} value={f.colunas[c] ?? ""} onChange={(e) => set({ colunas: { ...f.colunas, [c]: e.target.value } })} />
              {teste?.leitura && <span className={achadas[c] ? "text-emerald-700 dark:text-emerald-400" : ""}>{achadas[c] ? `${achadas[c]!.letra} · ${achadas[c]!.cabecalho || "(sem título)"}` : "não usada"}</span>}
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <fieldset className="space-y-1.5 text-sm">
          <legend className="font-medium">O que medir</legend>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.medidas.quantidade} onChange={(e) => set({ medidas: { ...f.medidas, quantidade: e.target.checked } })} />Quantidade (linhas ou coluna Quantidade)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.medidas.valor} onChange={(e) => set({ medidas: { ...f.medidas, valor: e.target.checked } })} />Valor total</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.medidas.media} onChange={(e) => set({ medidas: { ...f.medidas, media: e.target.checked } })} />Valor médio</label>
        </fieldset>
        <fieldset className="space-y-1.5 text-sm">
          <legend className="font-medium">Quebrar por</legend>
          {QUEBRAS.map((q) => (
            <label key={q.k} className="flex items-center gap-2">
              <input type="checkbox" checked={f.quebras.includes(q.k)} onChange={(e) => set({ quebras: e.target.checked ? [...f.quebras, q.k] : f.quebras.filter((x) => x !== q.k) })} />{q.rotulo}
            </label>
          ))}
        </fieldset>
        <fieldset className="space-y-1.5 text-sm">
          <legend className="font-medium">Contar só quando</legend>
          <div className="flex gap-2">
            <select className={`${campo} w-36`} value={f.filtro?.campo ?? ""} onChange={(e) => set({ filtro: e.target.value ? { campo: e.target.value as CampoQuebra, valores: f.filtro?.valores ?? [] } : null })} aria-label="Campo do filtro">
              <option value="">Sem filtro</option>
              {QUEBRAS.map((q) => <option key={q.k} value={q.k}>{q.rotulo}</option>)}
            </select>
            <input className={campo} disabled={!f.filtro} placeholder="Ex.: Realizada, Fechado" value={f.filtro?.valores.join(", ") ?? ""} aria-label="Valores aceitos"
              onChange={(e) => f.filtro && set({ filtro: { ...f.filtro, valores: e.target.value.split(",").map((x) => x.trimStart()) } })} />
          </div>
          {teste?.leitura && f.filtro && (
            <p className="text-xs text-muted-foreground">Valores na planilha: {(f.filtro.campo === "status" ? teste.leitura.valoresStatus : teste.leitura.valoresCategoria).join(", ") || "—"}</p>
          )}
        </fieldset>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">Comparável entre clínicas (benchmarking futuro)
          <select className={`${campo} w-60 text-foreground`} value={f.comparavel ?? ""} onChange={(e) => set({ comparavel: e.target.value })}>
            {CATALOGO_COMPARAVEL.map((c) => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onRemover}><Trash2 />Remover</Button>
          <Button size="sm" variant="outline" onClick={testar} disabled={testando}>{testando ? <Loader2 className="animate-spin" /> : <PlayCircle />}Testar leitura</Button>
        </div>
      </div>

      {teste && (
        <div className={`rounded-md border p-3 text-sm ${teste.erro ? "border-destructive/40 bg-destructive/5" : "bg-muted/40"}`}>
          {teste.erro ? <p className="flex items-start gap-2"><XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />{teste.erro}</p> : (
            <p className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              {teste.leitura!.linhas} linhas lidas (cabeçalho na linha {teste.leitura!.linhaCabecalho}){teste.leitura!.totalIgnoradas ? ` · ${teste.leitura!.totalIgnoradas} ignoradas, ex.: linha ${teste.leitura!.ignoradas[0].linha} (${teste.leitura!.ignoradas[0].motivo})` : ""}.
            </p>
          )}
          {teste.leitura && teste.leitura.amostra.length > 0 && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground"><tr><th className="py-1 pr-3 font-medium">Data</th><th className="pr-3 font-medium">Valor</th><th className="pr-3 font-medium">Qtd.</th><th className="pr-3 font-medium">Categoria</th><th className="pr-3 font-medium">Status</th><th className="font-medium">Profissional</th></tr></thead>
                <tbody>
                  {teste.leitura.amostra.map((x, n) => (
                    <tr key={n} className="border-t"><td className="py-1 pr-3">{x.data.split("-").reverse().join("/")}</td><td className="pr-3">{x.valor ?? "—"}</td><td className="pr-3">{x.quantidade ?? "—"}</td><td className="pr-3">{x.categoria}</td><td className="pr-3">{x.status}</td><td>{x.profissional}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-muted-foreground">Últimas 5 linhas lidas. Cabeçalhos da aba: {teste.leitura.cabecalho.join(" · ")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FontesPersonalizadasCard({ clinicaId, inicial }: { clinicaId: string; inicial: FontePersonalizada[] }) {
  const router = useRouter();
  const [fontes, setFontes] = useState(inicial);
  const [aberta, setAberta] = useState<string | null>(null);
  const [mudou, setMudou] = useState(false);
  const [salvando, iniciar] = useTransition();
  const alterar = (lista: FontePersonalizada[]) => { setFontes(lista); setMudou(true); };
  const salvar = () => iniciar(async () => {
    const r = await salvarFontesExtras({ clinicaId, fontes: fontes.map((f) => ({ ...f, nome: f.nome.trim() || "Fonte personalizada" })) });
    if (!r.ok) { toast.error(r.erro); return; }
    setFontes(r.dados); setMudou(false); toast.success("Fontes salvas. Elas já aparecem na estrutura do relatório.");
    router.refresh();
  });

  return (
    <section className="space-y-4 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <h2 className="font-semibold">Fontes personalizadas</h2>
          <p className="text-sm text-muted-foreground">
            Controles específicos desta clínica: contratos, cirurgias, recall, entradas bancárias… Uma linha por acontecimento, com uma coluna de data. Cada fonte vira um bloco nos Indicadores, uma seção do PDF e entra na análise do Claude. O app só lê as colunas indicadas.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => { const n = nova(); alterar([...fontes, n]); setAberta(n.id); }} disabled={fontes.length >= 12}><Plus />Adicionar fonte</Button>
      </div>

      {fontes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma fonte personalizada.</p>}
      <ul className="divide-y rounded-md border">
        {fontes.map((f, k) => (
          <li key={f.id} className="px-4 py-3">
            <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setAberta(aberta === f.id ? null : f.id)} aria-expanded={aberta === f.id}>
              <span className="min-w-0">
                <span className="block font-medium">{f.nome || "Nova fonte"}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {f.aba ? `aba ${f.aba}` : "sem planilha"} · mede {[f.medidas.quantidade && "quantidade", f.medidas.valor && "valor", f.medidas.media && "valor médio"].filter(Boolean).join(", ") || "nada"}{f.filtro?.valores.length ? ` · só ${f.filtro.valores.join(", ")}` : ""}
                </span>
              </span>
              {aberta === f.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {aberta === f.id && <Editor f={f} onChange={(x) => alterar(fontes.map((y, j) => (j === k ? x : y)))} onRemover={() => { alterar(fontes.filter((_, j) => j !== k)); setAberta(null); }} />}
          </li>
        ))}
      </ul>
      {fontes.length > 0 && <p className="text-xs text-muted-foreground">Compartilhe cada planilha, como Leitor, com a conta de serviço do app.</p>}
      <div className="flex justify-end">
        <Button onClick={salvar} disabled={salvando || !mudou}>{salvando ? <Loader2 className="animate-spin" /> : <Save />}Salvar fontes</Button>
      </div>
    </section>
  );
}
