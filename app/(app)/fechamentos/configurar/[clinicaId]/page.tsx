export const revalidate = 0;
export const maxDuration = 30;

import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { FontesFechamento } from "@/lib/fechamentos/coleta";
import { ConfigurarClient } from "./configurar-client";

export default async function ConfigurarPage({ params }: { params: Promise<{ clinicaId: string }> }) {
  const { clinicaId } = await params;
  const db = getSupabaseAdmin();
  const [{ data: clinica }, { data: config }] = await Promise.all([
    db.from("clinicas").select("id, nome").eq("id", clinicaId).maybeSingle(),
    db.from("fechamento_config").select("fontes").eq("clinica_id", clinicaId).maybeSingle(),
  ]);
  if (!clinica) notFound();
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground"><Link href="/fechamentos" className="hover:underline">Fechamentos</Link> / Planilhas</p>
        <h1 className="text-2xl font-semibold">Planilhas da {clinica.nome}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Cole o link de cada planilha e o nome exato da aba. O app encontra as colunas pelo nome do cabeçalho. Use “Testar leitura” para conferir o que ele encontrou e, se precisar, indique a coluna pela letra.
          Cada planilha precisa estar compartilhada, como Leitor, com a conta de serviço do app.
        </p>
      </div>
      <ConfigurarClient clinicaId={clinica.id} inicial={(config?.fontes ?? {}) as unknown as FontesFechamento} />
    </div>
  );
}
