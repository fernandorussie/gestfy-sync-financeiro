"use client";

import { useState } from "react";
import { CheckCircle2, Copy, FileDown, History, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ResultadoFechamento } from "@/lib/fechamentos/servidor";
import { textoWhatsApp } from "@/lib/fechamentos/texto-fechamento";
import { nomePeriodo } from "../../_components/formato";
import type { EstadoAnalise } from "./analise";

export function Entrega({ r, estado, onConcluir, onEnviado, onReabrir, ocupado }: {
  r: ResultadoFechamento; estado: EstadoAnalise; onConcluir: () => void; onEnviado: () => void; onReabrir: () => void; ocupado: boolean;
}) {
  const [confirmar, setConfirmar] = useState(false);
  const f = r.fechamento;
  const texto = textoWhatsApp({
    clinica: r.clinicaNome, tipo: f.tipo, periodoNome: nomePeriodo(f.tipo, f.inicio, f.fim),
    indicadores: r.indicadores, anterior: r.anterior, texto: estado.texto, acoes: estado.acoes, ritmo: r.ritmo, ocultas: r.estrutura.filter((x) => !x.ativa).map((x) => x.id),
  });
  const semTexto = !estado.texto.observacao.trim();

  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); toast.success("Texto copiado. Cole no WhatsApp."); }
    catch { toast.error("Não foi possível copiar. Selecione o texto e use Ctrl+C."); }
  };

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        {r.congelado ? (
          <div className="flex items-start gap-2 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span>
              {f.status === "enviado" ? "Enviado" : "Concluído"} em {new Date((f.status === "enviado" ? f.enviado_em : f.concluido_em) ?? "").toLocaleDateString("pt-BR")}.
              Números, texto e plano estão congelados nesta versão (v{f.versao}).
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Ao concluir, os números, o texto e o plano de ação ficam congelados. Para mudar depois, reabra: o app cria a versão {f.versao + 1} e mantém esta no histórico.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {!r.congelado && (confirmar ? (
            <>
              <Button onClick={() => { setConfirmar(false); onConcluir(); }} disabled={ocupado}>Confirmar conclusão</Button>
              <Button variant="outline" onClick={() => setConfirmar(false)}>Cancelar</Button>
            </>
          ) : (
            <Button onClick={() => setConfirmar(true)} disabled={ocupado || r.pendentesGraves > 0 || semTexto}
              title={r.pendentesGraves ? "Há alertas graves sem decisão" : semTexto ? "Escreva a observação na aba Análise" : undefined}>
              <CheckCircle2 />Concluir fechamento
            </Button>
          ))}
          {f.status === "concluido" && <Button onClick={onEnviado} disabled={ocupado}><Send />Marcar como enviado</Button>}
          {r.congelado && <Button variant="outline" onClick={onReabrir} disabled={ocupado}><History />Reabrir (nova versão)</Button>}
        </div>
      </section>
      {semTexto && !r.congelado && <p className="text-sm text-amber-700 dark:text-amber-400">Escreva ao menos a observação na aba Análise para concluir.</p>}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <section className="space-y-3 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Texto do WhatsApp</h2>
            <Button size="sm" variant="outline" onClick={copiar}><Copy />Copiar texto</Button>
          </div>
          <pre className="max-h-[640px] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-4 font-sans text-sm leading-relaxed">{texto}</pre>
        </section>
        <section className="space-y-3 rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold">Relatório em PDF</h2>
          <p className="text-sm text-muted-foreground">Abre o relatório em páginas A4, na estrutura padrão Gestfy. Na tela que abrir, use “Salvar PDF”. A página com a análise e o plano de ação é opcional e pode ser incluída por lá.</p>
          <Button asChild variant="outline">
            <a href={`/fechamentos-pdf/${f.id}`} target="_blank" rel="noopener noreferrer"><FileDown />Abrir PDF</a>
          </Button>
          {!r.congelado && <p className="text-xs text-muted-foreground">Antes de concluir, o PDF usa o texto salvo até agora.</p>}
        </section>
      </div>
    </div>
  );
}
