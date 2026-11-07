"use client";

import { useState, useTransition } from "react";
import { ClipboardPaste, Copy, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { lerFichaGerada, MODELOS, PORTES, pedidoFicha, type FichaClinica, type ModeloNegocio, type Porte } from "@/lib/fechamentos/ficha";
import { CAMPOS_VOCAB, SEGMENTOS, cap, vocabularioDe, type SegmentoId } from "@/lib/fechamentos/vocabulario";
import { salvarFicha } from "../../actions";

const campo = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed";

const TEXTOS: { k: "perfil" | "prioridades" | "pessoas" | "estilo" | "evitar"; titulo: string; ajuda: string; linhas: number }[] = [
  { k: "perfil", titulo: "Perfil e posicionamento", ajuda: "O que o cliente faz, para quem, carro-chefe", linhas: 4 },
  { k: "prioridades", titulo: "Prioridades e metas do momento", ajuda: "Projetos, campanhas, focos combinados com a Gestfy", linhas: 4 },
  { k: "pessoas", titulo: "Pessoas e papéis", ajuda: "Sócios, gestores, equipe, marketing", linhas: 4 },
  { k: "estilo", titulo: "Como escrever para este cliente", ajuda: "Tom, forma de tratamento, o que valorizam", linhas: 3 },
  { k: "evitar", titulo: "Assuntos a evitar", ajuda: "Temas sensíveis, o que não citar no relatório", linhas: 3 },
];

export function FichaClinicaCard({ clinicaId, clinicaNome, inicial }: { clinicaId: string; clinicaNome: string; inicial: FichaClinica }) {
  const [ficha, setFicha] = useState(inicial);
  const [colar, setColar] = useState<string | null>(null);
  const [mudou, setMudou] = useState(false);
  const [salvando, iniciar] = useTransition();
  const mudar = (p: Partial<FichaClinica>) => { setFicha({ ...ficha, ...p }); setMudou(true); };
  const vocab = vocabularioDe({ ...ficha, vocabulario: {} });
  // Particular / convênio só faz sentido em saúde.
  const saude = ficha.segmentoTipo === "clinica" || ficha.segmentoTipo === "odontologia" || (!ficha.segmentoTipo && !!ficha.modelo);

  const copiarPedido = async () => {
    try { await navigator.clipboard.writeText(pedidoFicha(clinicaNome)); toast.success(`Pedido copiado. Cole numa conversa do projeto de ${clinicaNome} no Claude.`); }
    catch { toast.error("Não foi possível copiar."); }
  };
  const aplicar = () => {
    const { ficha: nova, achados } = lerFichaGerada(colar ?? "", ficha);
    if (!achados) { toast.error("Não encontrei os títulos do perfil no texto colado."); return; }
    setFicha(nova); setMudou(true); setColar(null);
    toast.success(`${achados} ${achados === 1 ? "item preenchido" : "itens preenchidos"}. Revise e salve.`);
  };
  const salvar = () => iniciar(async () => {
    const r = await salvarFicha({ clinicaId, ficha });
    if (!r.ok) { toast.error(r.erro); return; }
    setFicha(r.dados); setMudou(false); toast.success("Perfil salvo.");
  });

  return (
    <section className="space-y-4 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <h2 className="font-semibold">Perfil do cliente</h2>
          <p className="text-sm text-muted-foreground">
            Segmento, palavras do relatório e o que o Claude precisa saber além dos números. Vai junto no pacote da análise. Para preencher rápido, copie o pedido, cole numa conversa do projeto do cliente no Claude e cole a resposta aqui.
          </p>
          <p className="text-xs text-muted-foreground">{ficha.atualizadoEm ? `Atualizado em ${new Date(ficha.atualizadoEm).toLocaleDateString("pt-BR")}` : "Ainda não preenchido"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={copiarPedido}><Copy />Copiar pedido para o Claude</Button>
          <Button size="sm" variant="outline" onClick={() => setColar(colar === null ? "" : null)}><ClipboardPaste />Colar perfil gerado</Button>
        </div>
      </div>

      {colar !== null && (
        <div className="space-y-2 rounded-md border border-dashed p-3">
          <textarea className={campo} rows={8} value={colar} onChange={(e) => setColar(e.target.value)} placeholder="Cole aqui a resposta do Claude, com os títulos ### CIDADE/UF, ### SEGMENTO…" aria-label="Perfil gerado pelo Claude" />
          <div className="flex gap-2">
            <Button size="sm" onClick={aplicar} disabled={!colar.trim()}>Preencher o perfil</Button>
            <Button size="sm" variant="ghost" onClick={() => setColar(null)}>Cancelar</Button>
          </div>
        </div>
      )}

      <div className="space-y-3 rounded-md border p-3">
        <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
          <label className="flex flex-col gap-1.5 text-sm font-medium">Tipo de negócio
            <select className={`${campo} h-9 py-0`} value={ficha.segmentoTipo} onChange={(e) => mudar({ segmentoTipo: e.target.value as SegmentoId | "", vocabulario: {} })}>
              <option value="">Não informado (palavras neutras)</option>
              {SEGMENTOS.map((x) => <option key={x.id} value={x.id}>{x.rotulo}</option>)}
            </select>
          </label>
          <div className="text-sm">
            <p className="font-medium">Palavras do relatório</p>
            <p className="text-xs text-muted-foreground">Usadas na tela, no PDF, no WhatsApp e nas instruções do Claude. Vêm do tipo de negócio; ajuste se o cliente fala diferente.</p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          {CAMPOS_VOCAB.map((c) => (
            <label key={c.k} className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">{c.rotulo}
              <input className={`${campo} h-8 py-0 text-foreground`} value={ficha.vocabulario[c.k] ?? ""} placeholder={vocab[c.k]}
                onChange={(e) => mudar({ vocabulario: { ...ficha.vocabulario, [c.k]: e.target.value } })} />
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Exemplo: “{cap(vocab.clientes)} atendidos”, “Faturamento por {vocab.profissional}”, “{cap(vocab.servicos)} mais vendidos”.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_90px_1fr_1fr]">
        <label className="flex flex-col gap-1.5 text-sm font-medium">Cidade
          <input className={`${campo} h-9 py-0`} value={ficha.cidade} onChange={(e) => mudar({ cidade: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">UF
          <input className={`${campo} h-9 py-0 uppercase`} maxLength={2} value={ficha.uf} onChange={(e) => mudar({ uf: e.target.value.toUpperCase() })} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">Segmento (descrição)
          <input className={`${campo} h-9 py-0`} value={ficha.segmento} placeholder="Ex.: clínica de dermatologia, shopping regional" onChange={(e) => mudar({ segmento: e.target.value })} />
        </label>
        {saude ? (
          <label className="flex flex-col gap-1.5 text-sm font-medium">Modelo de atendimento
            <select className={`${campo} h-9 py-0`} value={ficha.modelo} onChange={(e) => mudar({ modelo: e.target.value as ModeloNegocio })}>
              <option value="">Não informado</option>
              {Object.entries(MODELOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        ) : <span />}
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_260px]">
        <label className="flex flex-col gap-1.5 text-sm font-medium">{cap(vocab.areas)}
          <input className={`${campo} h-9 py-0`} value={ficha.especialidades} placeholder="Ex.: dermatologia e estética; ou moda, alimentação e serviços" onChange={(e) => mudar({ especialidades: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">Porte
          <select className={`${campo} h-9 py-0`} value={ficha.porte} onChange={(e) => mudar({ porte: e.target.value as Porte })}>
            <option value="">Calcular pelo faturamento</option>
            {Object.entries(PORTES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {TEXTOS.map((t) => (
          <label key={t.k} className="flex flex-col gap-1.5">
            <span className="flex flex-col"><span className="text-sm font-medium">{t.titulo}</span><span className="text-xs text-muted-foreground">{t.ajuda}</span></span>
            <textarea className={campo} rows={t.linhas} value={ficha[t.k]} onChange={(e) => mudar({ [t.k]: e.target.value })} />
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Não registre dados pessoais dos clientes dele aqui.</p>
      <div className="flex justify-end">
        <Button onClick={salvar} disabled={salvando || !mudou}>{salvando ? <Loader2 className="animate-spin" /> : <Save />}Salvar perfil</Button>
      </div>
    </section>
  );
}
