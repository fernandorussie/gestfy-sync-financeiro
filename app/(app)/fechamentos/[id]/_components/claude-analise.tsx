"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ClipboardPaste, Copy, FileText, Loader2, MessageSquareText, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ResultadoFechamento } from "@/lib/fechamentos/servidor";
import { fichaPreenchida } from "@/lib/fechamentos/ficha";
import { apelidosProfissionais, lerResposta, montarPacote, type RespostaLida } from "@/lib/fechamentos/pacote-ia";
import { gerarComClaude } from "../../actions";
import type { EstadoAnalise } from "./analise";

const NOMES = { observacao: "Observação", destaques: "Destaques", comercial: "Comercial", atencao: "Atenção" } as const;

/**
 * Análise com o Claude, sem integração: o app copia o fechamento em texto para
 * o projeto do cliente no Claude e lê a resposta de volta para a aba Análise.
 */
export function ClaudeAnalise({ r, estado, mudar }: { r: ResultadoFechamento; estado: EstadoAnalise; mudar: (e: EstadoAnalise) => void }) {
  const [anonimizar, setAnonimizar] = useState(false);
  const [colar, setColar] = useState<string | null>(null);
  const [lida, setLida] = useState<RespostaLida | null>(null);
  const [plano, setPlano] = useState<"substituir" | "adicionar">("substituir");
  const [origem, setOrigem] = useState<"app" | "projeto">("app");
  const [custo, setCusto] = useState<number | null>(null);
  const [gerando, iniciar] = useTransition();
  const ficha = r.ficha;
  const temFicha = fichaPreenchida(ficha);
  const apelidos = useMemo(() => apelidosProfissionais(r.indicadores, r.anterior), [r.indicadores, r.anterior]);

  const copiar = async () => {
    const texto = montarPacote({
      clinica: r.clinicaNome, tipo: r.fechamento.tipo, indicadores: r.indicadores, anterior: r.anterior, anual: r.anual, ritmo: r.ritmo,
      alertas: r.alertas, decisoes: r.decisoes, texto: estado.texto, acoes: estado.acoes, acompanhamento: estado.acompanhamento, ficha,
    }, { anonimizar });
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(`Fechamento copiado. Cole numa conversa do projeto da ${r.clinicaNome} no Claude.`);
    } catch { toast.error("Não foi possível copiar. Tente de novo."); }
  };

  const mostrar = (texto: string, de: "app" | "projeto") => {
    setLida(lerResposta(texto, { apelidos: anonimizar ? apelidos : undefined }));
    setOrigem(de);
    setPlano(estado.acoes.length ? "substituir" : "adicionar");
  };
  const ler = () => { setCusto(null); mostrar(colar ?? "", "projeto"); };
  const gerar = () => iniciar(async () => {
    const res = await gerarComClaude({ id: r.fechamento.id, anonimizar, texto: estado.texto, acoes: estado.acoes, acompanhamento: estado.acompanhamento });
    if (!res.ok) { toast.error(res.erro); return; }
    setColar(null); setCusto(res.dados.custoUsd);
    mostrar(res.dados.resposta, "app");
  });
  const aplicar = () => {
    if (!lida) return;
    const acoes = !lida.acoes.length ? estado.acoes : plano === "substituir" ? lida.acoes : [...estado.acoes, ...lida.acoes];
    mudar({ ...estado, texto: { ...estado.texto, ...lida.secoes }, acoes });
    toast.success(origem === "app" ? "Rascunho aplicado. Agora, se quiser, refine no projeto do cliente: Copiar para o projeto." : "Texto e plano preenchidos. Revise antes de concluir.");
    setLida(null); setColar(null);
  };
  const secoesLidas = lida ? (Object.keys(NOMES) as (keyof typeof NOMES)[]).filter((k) => lida.secoes[k]) : [];
  const sobrescreve = lida ? secoesLidas.filter((k) => estado.texto[k].trim()) : [];

  return (
    <section className="space-y-4 rounded-lg border border-primary/30 bg-primary/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><MessageSquareText className="h-4 w-4 text-primary" />Análise com o Claude</h2>
          <ol className="list-decimal space-y-0.5 pl-5 text-sm text-muted-foreground">
            <li><b className="font-medium text-foreground">Gerar com o Claude:</b> rascunho do texto e do plano de ação aqui no app, com os números e a ficha da clínica.</li>
            <li><b className="font-medium text-foreground">Refinar no projeto:</b> copie e cole numa conversa do projeto da {r.clinicaNome} no Claude, que conhece o histórico do cliente.</li>
            <li><b className="font-medium text-foreground">Colar resposta:</b> o app atualiza o texto e o plano.</li>
          </ol>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5" />
              {temFicha ? `Ficha da clínica incluída${ficha.atualizadoEm ? ` (atualizada em ${new Date(ficha.atualizadoEm).toLocaleDateString("pt-BR")})` : ""}` : "Sem ficha da clínica"}
            </span>
            <Link href={`/fechamentos/configurar/${r.fechamento.clinica_id}`} className="underline">{temFicha ? "Ver ficha" : "Preencher ficha"}</Link>
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={gerar} disabled={gerando || !r.iaLigada} title={r.iaLigada ? undefined : "IA não ligada: falta a chave ANTHROPIC_API_KEY na Vercel"}>
              {gerando ? <Loader2 className="animate-spin" /> : <Sparkles />}{gerando ? "Gerando…" : "Gerar com o Claude"}
            </Button>
            <Button size="sm" variant="outline" onClick={copiar}><Copy />Copiar para o projeto</Button>
            <Button size="sm" variant="outline" onClick={() => { setColar(colar === null ? "" : null); setLida(null); }}><ClipboardPaste />Colar resposta</Button>
          </div>
          {!r.iaLigada && <p className="text-xs text-amber-700 dark:text-amber-400">“Gerar com o Claude” liga quando a chave da API for cadastrada na Vercel.</p>}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={anonimizar} onChange={(e) => setAnonimizar(e.target.checked)} />
            Trocar nomes dos profissionais por “Profissional 1, 2…”
          </label>
        </div>
      </div>

      {colar !== null && !lida && (
        <div className="space-y-2">
          <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed" rows={10} value={colar} onChange={(e) => setColar(e.target.value)}
            placeholder="Cole aqui a resposta do Claude (com os títulos ### OBSERVAÇÃO, ### PRINCIPAIS DESTAQUES…)" aria-label="Resposta do Claude" />
          <div className="flex gap-2">
            <Button size="sm" onClick={ler} disabled={!colar.trim()}>Ler resposta</Button>
            <Button size="sm" variant="ghost" onClick={() => setColar(null)}>Cancelar</Button>
          </div>
        </div>
      )}

      {lida && (
        <div className="space-y-3 rounded-md border bg-background p-3 text-sm">
          {origem === "app" && <p className="font-medium">Rascunho gerado pelo Claude{custo !== null ? ` (custo aproximado: US$ ${custo.toFixed(3).replace(".", ",")})` : ""}.</p>}
          <p>
            Encontrei: {secoesLidas.length ? secoesLidas.map((k) => NOMES[k]).join(", ") : "nenhuma seção"}
            {lida.acoes.length ? ` e ${lida.acoes.length} ${lida.acoes.length === 1 ? "ação" : "ações"} no plano` : ""}.
          </p>
          {lida.avisos.map((a) => <p key={a} className="text-amber-700 dark:text-amber-400">{a}</p>)}
          {sobrescreve.length > 0 && <p className="text-muted-foreground">Vai substituir o que já está escrito em: {sobrescreve.map((k) => NOMES[k]).join(", ")}.</p>}
          {lida.acoes.length > 0 && estado.acoes.length > 0 && (
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-1.5"><input type="radio" checked={plano === "substituir"} onChange={() => setPlano("substituir")} />Substituir as {estado.acoes.length} ações atuais</label>
              <label className="flex items-center gap-1.5"><input type="radio" checked={plano === "adicionar"} onChange={() => setPlano("adicionar")} />Adicionar ao plano atual</label>
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={aplicar}>Aplicar no texto</Button>
            <Button size="sm" variant="ghost" onClick={() => setLida(null)}>{origem === "app" ? "Descartar" : "Voltar"}</Button>
          </div>
        </div>
      )}
    </section>
  );
}
