export const revalidate = 0;
export const maxDuration = 30;

import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { FontesFechamento } from "@/lib/fechamentos/coleta";
import { limparFicha, type FichaClinica } from "@/lib/fechamentos/ficha";
import { ConfigurarClient } from "./configurar-client";
import { FichaClinicaCard } from "./ficha-clinica";
import { EstruturaRelatorioCard } from "./estrutura-relatorio";
import { FontesPersonalizadasCard } from "./fontes-personalizadas";
import { limparFontePersonalizada, type FontePersonalizada } from "@/lib/fechamentos/fonte-personalizada";
import { limparEstrutura, type EstruturaRelatorio } from "@/lib/fechamentos/estrutura";

export default async function ConfigurarPage({ params }: { params: Promise<{ clinicaId: string }> }) {
  const { clinicaId } = await params;
  const db = getSupabaseAdmin();
  const [{ data: clinica }, { data: config }] = await Promise.all([
    db.from("clinicas").select("id, nome").eq("id", clinicaId).maybeSingle(),
    db.from("fechamento_config").select("*").eq("clinica_id", clinicaId).maybeSingle(),
  ]);
  if (!clinica) notFound();
  const extrasBrutos = (config as { fontes_extras?: unknown } | null)?.fontes_extras;
  const extras: FontePersonalizada[] = (Array.isArray(extrasBrutos) ? extrasBrutos : []).map((x) => limparFontePersonalizada(x as Partial<FontePersonalizada>));
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground"><Link href="/fechamentos" className="hover:underline">Fechamentos</Link> / <Link href={`/fechamentos/clinica/${clinica.id}`} className="hover:underline">{clinica.nome}</Link> / Configurar</p>
        <h1 className="text-2xl font-semibold">Planilhas da {clinica.nome}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Cole o link de cada planilha e o nome exato da aba. O app encontra as colunas pelo nome do cabeçalho. Use “Testar leitura” para conferir o que ele encontrou e, se precisar, indique a coluna pela letra.
          Cada planilha precisa estar compartilhada, como Leitor, com a conta de serviço do app.
        </p>
      </div>
      <ConfigurarClient clinicaId={clinica.id} inicial={(config?.fontes ?? {}) as unknown as FontesFechamento} />
      <FontesPersonalizadasCard clinicaId={clinica.id} inicial={extras} />
      <EstruturaRelatorioCard key={extras.map((x) => x.id + x.nome).join("|")} clinicaId={clinica.id} extras={extras.map((x) => ({ id: x.id, nome: x.nome }))}
        inicial={limparEstrutura((config as { relatorio?: unknown } | null)?.relatorio, extras.map((x) => ({ id: x.id, nome: x.nome }))) as Required<EstruturaRelatorio>} />
      <FichaClinicaCard clinicaId={clinica.id} clinicaNome={clinica.nome} inicial={limparFicha(((config as { ficha?: unknown } | null)?.ficha ?? {}) as Partial<FichaClinica>)} />
    </div>
  );
}
