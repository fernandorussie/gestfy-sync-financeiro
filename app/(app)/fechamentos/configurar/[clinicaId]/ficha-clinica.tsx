"use client";

import { useState, useTransition } from "react";
import { ClipboardPaste, Copy, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { lerFichaGerada, MODELOS, pedidoFicha, type FichaClinica, type ModeloNegocio } from "@/lib/fechamentos/ficha";
import { salvarFicha } from "../../actions";

const campo = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed";

const TEXTOS: { k: "perfil" | "prioridades" | "pessoas" | "estilo" | "evitar"; titulo: string; ajuda: string; linhas: number }[] = [
  { k: "perfil", titulo: "Perfil e posicionamento", ajuda: "O que a clínica faz, para quem, carro-chefe", linhas: 4 },
  { k: "prioridades", titulo: "Prioridades e metas do momento", ajuda: "Projetos, campanhas, focos combinados com a Gestfy", linhas: 4 },
  { k: "pessoas", titulo: "Pessoas e papéis", ajuda: "Sócios, médicos, gestores, recepção, marketing", linhas: 4 },
  { k: "estilo", titulo: "Como escrever para este cliente", ajuda: "Tom, tratamento (“Drs.”), o que valorizam", linhas: 3 },
  { k: "evitar", titulo: "Assuntos a evitar", ajuda: "Temas sensíveis, o que não citar no relatório", linhas: 3 },
];

export function FichaClinicaCard({ clinicaId, clinicaNome, inicial }: { clinicaId: string; clinicaNome: string; inicial: FichaClinica }) {
  const [ficha, setFicha] = useState(inicial);
  const [colar, setColar] = useState<string | null>(null);
  const [mudou, setMudou] = useState(false);
  const [salvando, iniciar] = useTransition();
  const mudar = (p: Partial<FichaClinica>) => { setFicha({ ...ficha, ...p }); setMudou(true); };

  const copiarPedido = async () => {
    try { await navigator.clipboard.writeText(pedidoFicha(clinicaNome)); toast.success(`Pedido copiado. Cole numa conversa do projeto da ${clinicaNome} no Claude.`); }
    catch { toast.error("Não foi possível copiar."); }
  };
  const aplicar = () => {
    const { ficha: nova, achados } = lerFichaGerada(colar ?? "", ficha);
    if (!achados) { toast.error("Não encontrei os títulos da ficha no texto colado."); return; }
    setFicha(nova); setMudou(true); setColar(null);
    toast.success(`${achados} ${achados === 1 ? "item preenchido" : "itens preenchidos"}. Revise e salve.`);
  };
  const salvar = () => iniciar(async () => {
    const r = await salvarFicha({ clinicaId, ficha });
    if (!r.ok) { toast.error(r.erro); return; }
    setFicha(r.dados); setMudou(false); toast.success("Ficha salva.");
  });

  return (
    <section className="space-y-4 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <h2 className="font-semibold">Ficha da clínica</h2>
          <p className="text-sm text-muted-foreground">
            O que o Claude precisa saber do cliente além dos números. Vai junto no pacote da análise. Para preencher rápido, copie o pedido, cole numa conversa do projeto da clínica no Claude e cole a resposta aqui.
          </p>
          <p className="text-xs text-muted-foreground">{ficha.atualizadoEm ? `Atualizada em ${new Date(ficha.atualizadoEm).toLocaleDateString("pt-BR")}` : "Ainda não preenchida"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={copiarPedido}><Copy />Copiar pedido para o Claude</Button>
          <Button size="sm" variant="outline" onClick={() => setColar(colar === null ? "" : null)}><ClipboardPaste />Colar ficha gerada</Button>
        </div>
      </div>

      {colar !== null && (
        <div className="space-y-2 rounded-md border border-dashed p-3">
          <textarea className={campo} rows={8} value={colar} onChange={(e) => setColar(e.target.value)} placeholder="Cole aqui a resposta do Claude, com os títulos ### CIDADE/UF, ### SEGMENTO…" aria-label="Ficha gerada pelo Claude" />
          <div className="flex gap-2">
            <Button size="sm" onClick={aplicar} disabled={!colar.trim()}>Preencher a ficha</Button>
            <Button size="sm" variant="ghost" onClick={() => setColar(null)}>Cancelar</Button>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_90px_1fr_1fr]">
        <label className="flex flex-col gap-1.5 text-sm font-medium">Cidade
          <input className={`${campo} h-9 py-0`} value={ficha.cidade} onChange={(e) => mudar({ cidade: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">UF
          <input className={`${campo} h-9 py-0 uppercase`} maxLength={2} value={ficha.uf} onChange={(e) => mudar({ uf: e.target.value.toUpperCase() })} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">Segmento
          <input className={`${campo} h-9 py-0`} value={ficha.segmento} placeholder="Ex.: clínica médica, odontologia" onChange={(e) => mudar({ segmento: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">Modelo de negócio
          <select className={`${campo} h-9 py-0`} value={ficha.modelo} onChange={(e) => mudar({ modelo: e.target.value as ModeloNegocio })}>
            <option value="">Não informado</option>
            {Object.entries(MODELOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">Especialidades
        <input className={`${campo} h-9 py-0`} value={ficha.especialidades} placeholder="Ex.: nutrologia, ginecologia, dermatologia" onChange={(e) => mudar({ especialidades: e.target.value })} />
      </label>
      <div className="grid gap-4 lg:grid-cols-2">
        {TEXTOS.map((t) => (
          <label key={t.k} className="flex flex-col gap-1.5">
            <span className="flex flex-col"><span className="text-sm font-medium">{t.titulo}</span><span className="text-xs text-muted-foreground">{t.ajuda}</span></span>
            <textarea className={campo} rows={t.linhas} value={ficha[t.k]} onChange={(e) => mudar({ [t.k]: e.target.value })} />
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Não registre dados de pacientes aqui.</p>
      <div className="flex justify-end">
        <Button onClick={salvar} disabled={salvando || !mudou}>{salvando ? <Loader2 className="animate-spin" /> : <Save />}Salvar ficha</Button>
      </div>
    </section>
  );
}
