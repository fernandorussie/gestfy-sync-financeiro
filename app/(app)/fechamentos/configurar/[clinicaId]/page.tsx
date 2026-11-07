export const revalidate = 0;
export const maxDuration = 30;

import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { FontesFechamento } from "@/lib/fechamentos/coleta";
import { limparFicha, type FichaClinica } from "@/lib/fechamentos/ficha";
import { limparFontePersonalizada, type FontePersonalizada } from "@/lib/fechamentos/fonte-personalizada";
import { CATALOGO, SECOES_DESTINO, extrasDe, limparEstrutura, type EstruturaRelatorio } from "@/lib/fechamentos/estrutura";
import { migracoesPendentes } from "@/lib/fechamentos/banco";
import { AvisoBanco } from "../../_components/aviso-banco";
import { AbasConfig, type AbaConfig } from "./abas-config";
import { FontesDados } from "./fontes-dados";
import { EstruturaRelatorioCard } from "./estrutura-relatorio";
import { FichaClinicaCard } from "./ficha-clinica";

export default async function ConfigurarPage({ params, searchParams }: { params: Promise<{ clinicaId: string }>; searchParams: Promise<{ aba?: string }> }) {
  const [{ clinicaId }, { aba }] = await Promise.all([params, searchParams]);
  const db = getSupabaseAdmin();
  const [{ data: clinica }, { data: config }, pendentes] = await Promise.all([
    db.from("clinicas").select("id, nome").eq("id", clinicaId).maybeSingle(),
    db.from("fechamento_config").select("*").eq("clinica_id", clinicaId).maybeSingle(),
    migracoesPendentes(db),
  ]);
  if (!clinica) notFound();
  const cfg = (config ?? {}) as { fontes?: unknown; fontes_extras?: unknown; relatorio?: unknown; ficha?: unknown };
  const extras: FontePersonalizada[] = (Array.isArray(cfg.fontes_extras) ? cfg.fontes_extras : []).map((x) => limparFontePersonalizada(x as Partial<FontePersonalizada>));
  const estrutura = limparEstrutura(cfg.relatorio, extrasDe(extras)) as Required<EstruturaRelatorio>;

  // Onde um indicador personalizado pode aparecer: seção da fonte, seções padrão ou seções criadas no editor.
  const soDe = (id: string) => { const d = CATALOGO.find((s) => s.id === id)!; return d.tipos.length === 1 ? ` (só ${d.tipos[0]})` : ""; };
  const destinos = [
    { id: "fonte", rotulo: "Seção da própria fonte" },
    ...SECOES_DESTINO.map((id) => ({ id, rotulo: `Dentro de: ${CATALOGO.find((s) => s.id === id)!.titulo}${soDe(id)}` })),
    ...estrutura.secoes.map((s) => ({ id: `sec:${s.id}`, rotulo: `Seção nova: ${s.titulo}` })),
  ];
  const porSecao: Record<string, string[]> = {};
  for (const f of extras) for (const d of f.indicadores.filter((x) => !x.oculto)) {
    const k = d.secao === "fonte" ? `fonte:${f.id}` : d.secao;
    (porSecao[k] ??= []).push(d.secao === "fonte" ? d.nome : `${d.nome} (${f.nome})`);
  }
  const abaInicial: AbaConfig = aba === "estrutura" || aba === "perfil" ? aba : "fontes";
  const fontesPadrao = (cfg.fontes ?? {}) as FontesFechamento;
  const pronto = !!(fontesPadrao.vendas && fontesPadrao.despesas);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground"><Link href="/fechamentos/clientes" className="hover:underline">Clientes e configurações</Link> / {clinica.nome}</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{clinica.nome}</h1>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${pronto ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"}`}>
            {pronto ? "Pronto para fechar" : "Fontes pendentes: vendas e despesas"}
          </span>
        </div>
      </div>
      <AvisoBanco pendentes={pendentes} />
      <AbasConfig
        inicial={abaInicial}
        fontes={<FontesDados clinicaId={clinica.id} padraoInicial={fontesPadrao} extrasIniciais={extras} destinos={destinos} />}
        estrutura={<EstruturaRelatorioCard key={JSON.stringify(extrasDe(extras))} clinicaId={clinica.id} extrasFontes={extrasDe(extras)} inicial={estrutura} porSecao={porSecao} />}
        perfil={<FichaClinicaCard clinicaId={clinica.id} clinicaNome={clinica.nome} inicial={limparFicha((cfg.ficha ?? {}) as Partial<FichaClinica>)} />}
      />
    </div>
  );
}
