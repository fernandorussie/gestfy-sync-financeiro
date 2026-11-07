"use client";

import { useState } from "react";
import { CheckCircle2, ChevronRight, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Alerta, Gravidade } from "@/lib/fechamentos/conferencia";
import type { Decisao } from "@/lib/fechamentos/decisoes";
import { GRUPOS_DESPESA } from "@/lib/fechamentos/plano-contas";
import type { ResultadoFechamento } from "@/lib/fechamentos/servidor";
import { brl, dataBR } from "../../_components/formato";
import type { Decidir } from "./fechamento-client";

const GRAV: Record<Gravidade, { rotulo: string; faixa: string; selo: string }> = {
  grave: { rotulo: "Grave", faixa: "bg-red-500", selo: "bg-red-500/10 text-red-700 dark:text-red-400" },
  atencao: { rotulo: "Atenção", faixa: "bg-amber-500", selo: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  info: { rotulo: "Informativo", faixa: "bg-primary/50", selo: "bg-primary/10 text-primary" },
};

function descreverDecisao(d: Decisao): string {
  if (d.acao === "manter") return d.sugestao?.tipo === "citar-no-texto" ? "Não será citado no texto." : "Mantido como está.";
  const s = d.sugestao;
  if (!s) return "Decidido.";
  switch (s.tipo) {
    case "reclassificar": return `Reclassificado para ${s.categoria} (${s.grupo}). A planilha não muda.`;
    case "unificar": return `Unificado como “${s.para}”. Vale para este fechamento.`;
    case "escolher-meta": return `Meta usada: ${brl(d.escolha?.meta ?? 0)}.`;
    case "classificar": return `Grupos definidos: ${Object.entries(d.escolha?.grupos ?? {}).map(([c, g]) => `${c} → ${g}`).join("; ")}. Fica salvo para o clieca.`;
    case "citar-no-texto": return "Será citado no texto do fechamento.";
    default: return "Decidido.";
  }
}

function Evidencias({ a }: { a: Alerta }) {
  const [todas, setTodas] = useState(false);
  if (!a.evidencias.length) return null;
  const lista = todas ? a.evidencias : a.evidencias.slice(0, 8);
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <tbody>
          {lista.map((e, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">{e.linha ? `linha ${e.linha}` : ""}</td>
              <td className="px-3 py-1.5">{e.texto}</td>
              <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">{e.data ? dataBR(e.data) : ""}</td>
              <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{e.valor != null ? brl(e.valor) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {a.evidencias.length > 8 && (
        <button type="button" onClick={() => setTodas(!todas)} className="w-full border-t px-3 py-1.5 text-xs font-medium text-primary hover:bg-muted">
          {todas ? "Mostrar menos" : `Mostrar todas as ${a.evidencias.length}`}
        </button>
      )}
    </div>
  );
}

function Acoes({ a, decidir }: { a: Alerta; decidir: Decidir }) {
  const s = a.sugestao;
  const [grupos, setGrupos] = useState<Record<string, string>>({});
  if (!s) return <Button size="sm" variant="outline" onClick={() => decidir(a.chave, "manter")}>Ciente</Button>;
  switch (s.tipo) {
    case "reclassificar":
      return <><Button size="sm" onClick={() => decidir(a.chave, "aplicar")}>Reclassificar para {s.categoria}</Button><Button size="sm" variant="outline" onClick={() => decidir(a.chave, "manter")}>Manter como está</Button></>;
    case "unificar":
      return <><Button size="sm" onClick={() => decidir(a.chave, "aplicar")}>Unificar como “{s.para}”</Button><Button size="sm" variant="outline" onClick={() => decidir(a.chave, "manter")}>São diferentes</Button></>;
    case "escolher-meta":
      return <>{s.opcoes.map((o) => <Button key={o.origem} size="sm" variant="outline" onClick={() => decidir(a.chave, "aplicar", { meta: o.valor })}>{o.origem}: {brl(o.valor)}</Button>)}</>;
    case "citar-no-texto":
      return <><Button size="sm" onClick={() => decidir(a.chave, "aplicar")}>Citar no texto</Button><Button size="sm" variant="outline" onClick={() => decidir(a.chave, "manter")}>Não citar</Button></>;
    case "corrigir-na-origem":
      return <Button size="sm" variant="outline" onClick={() => decidir(a.chave, "manter")}>Seguir assim</Button>;
    case "classificar": {
      const completo = s.categorias.every((c) => grupos[c]);
      return (
        <div className="flex w-full flex-col gap-2">
          {s.categorias.map((c) => (
            <label key={c} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-[160px] font-medium">{c}</span>
              <select className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={grupos[c] ?? ""} onChange={(e) => setGrupos({ ...grupos, [c]: e.target.value })}>
                <option value="">Escolha o grupo</option>
                {GRUPOS_DESPESA.map((g) => <option key={g.grupo} value={g.grupo}>{g.grupo}</option>)}
              </select>
            </label>
          ))}
          <div><Button size="sm" disabled={!completo} onClick={() => decidir(a.chave, "aplicar", { grupos })}>Salvar grupos</Button></div>
        </div>
      );
    }
  }
}

export function Conferencia({ r, decidir, desfazer, irParaIndicadores, somenteLeitura = false }: { r: ResultadoFechamento; decidir: Decidir; desfazer: (chave: string) => void; irParaIndicadores: () => void; somenteLeitura?: boolean }) {
  const decisaoDe = new Map(r.decisoes.registro.map((d) => [d.chave, d]));
  const pendentes = r.alertas.filter((a) => !decisaoDe.has(a.chave));
  const decididos = r.alertas.filter((a) => decisaoDe.has(a.chave));
  const chavesAtuais = new Set(r.alertas.map((a) => a.chave));
  const resolvidos = r.decisoes.registro.filter((d) => !chavesAtuais.has(d.chave));
  const conta = (g: Gravidade) => pendentes.filter((a) => a.gravidade === g).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {(["grave", "atencao", "info"] as Gravidade[]).map((g) => (
          <div key={g} className="rounded-lg border p-4">
            <p className="text-xs font-medium text-muted-foreground">{g === "grave" ? "Graves pendentes" : g === "atencao" ? "Atenção pendentes" : "Informativos"}</p>
            <p className={`text-2xl font-semibold tabular-nums ${g === "grave" && conta(g) ? "text-red-600 dark:text-red-400" : ""}`}>{conta(g)}</p>
            <p className="text-xs text-muted-foreground">{g === "grave" ? "bloqueiam os indicadores" : g === "atencao" ? "podem seguir, viram pontos de atenção" : "para conhecimento"}</p>
          </div>
        ))}
      </div>

      {pendentes.length === 0 && (
        <div className="rounded-lg border p-5 text-sm">Nenhum alerta pendente.</div>
      )}

      {pendentes.map((a) => (
        <article key={a.chave} className="grid grid-cols-[4px_1fr] overflow-hidden rounded-lg border bg-card">
          <div className={GRAV[a.gravidade].faixa} />
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full px-2 py-0.5 font-semibold ${GRAV[a.gravidade].selo}`}>{GRAV[a.gravidade].rotulo}</span>
              <span className="text-muted-foreground">{a.area}</span>
            </div>
            <h3 className="font-semibold">{a.titulo}</h3>
            <p className="text-sm text-muted-foreground">{a.descricao}</p>
            <Evidencias a={a} />
            {!somenteLeitura && <div className="flex flex-wrap gap-2"><Acoes a={a} decidir={decidir} /></div>}
          </div>
        </article>
      ))}

      {(decididos.length > 0 || resolvidos.length > 0) && (
        <section className="space-y-2">
          <h2 className="pt-2 text-sm font-semibold text-muted-foreground">Decididos</h2>
          {[...decididos.map((a) => ({ chave: a.chave, titulo: a.titulo, d: decisaoDe.get(a.chave)! })), ...resolvidos.map((d) => ({ chave: d.chave, titulo: d.titulo, d }))].map((x) => (
            <div key={x.chave} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{x.titulo}</p>
                <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" />{descreverDecisao(x.d)}</p>
              </div>
              {!somenteLeitura && <Button size="sm" variant="ghost" onClick={() => desfazer(x.chave)}><Undo2 />Desfazer</Button>}
            </div>
          ))}
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">
          {r.pendentesGraves ? `Decida ${r.pendentesGraves === 1 ? "o alerta grave" : `os ${r.pendentesGraves} alertas graves`} para liberar os indicadores.` : "Conferência liberada. Alertas de atenção abertos podem virar pontos de atenção no texto."}
        </p>
        <Button onClick={irParaIndicadores} disabled={r.pendentesGraves > 0}>Ver indicadores<ChevronRight /></Button>
      </div>
    </div>
  );
}
