import type { FontesFechamento } from "@/lib/fechamentos/coleta";
import type { FonteDados, TipoFonte } from "@/lib/supabase/types";

/**
 * Quadro "Planilhas deste cliente": cada tipo de planilha uma vez, com quem a
 * usa. Hoje o Report Semanal/Checkpoint e os Relatórios Financeiros guardam a
 * configuração separada (cada um lê do seu jeito); o quadro mostra as duas lado
 * a lado e diz quando apontam para a mesma planilha.
 */
type Linha = { rotulo: string; semanal: TipoFonte | null; financeiro: keyof FontesFechamento | null; checkpoint?: string };

const LINHAS: Linha[] = [
  { rotulo: "Vendas / faturamento", semanal: "faturamento", financeiro: "vendas", checkpoint: "faturamento" },
  { rotulo: "Despesas", semanal: "despesa", financeiro: "despesas", checkpoint: "despesas" },
  { rotulo: "Leads", semanal: "leads", financeiro: "leads", checkpoint: "leads" },
  { rotulo: "NPS", semanal: "nps", financeiro: "nps", checkpoint: "nps" },
  { rotulo: "Pré-consulta", semanal: "pre_consulta", financeiro: null },
  { rotulo: "Entradas", semanal: null, financeiro: "entradas" },
  { rotulo: "Orçamentos", semanal: null, financeiro: "orcamentos" },
];

function abaSemanal(f: FonteDados): string {
  const m = (f.mapeamento ?? {}) as { abas_mensais?: Record<string, string> };
  const n = m.abas_mensais ? Object.keys(m.abas_mensais).length : 0;
  if (n) return `uma aba por mês (${n} ${n === 1 ? "mês" : "meses"})`;
  return `aba “${f.aba_nome}”`;
}

export function PlanilhasCliente({ semanal, financeiro, extras, checkpoint }: {
  semanal: FonteDados[];
  financeiro: FontesFechamento;
  extras: { nome: string; aba: string }[];
  checkpoint: Set<string>;
}) {
  const linhas = LINHAS.map((l) => {
    const s = l.semanal ? semanal.find((f) => f.tipo === l.semanal) : undefined;
    const f = l.financeiro ? financeiro[l.financeiro] : undefined;
    const mesma = s && f?.sheetId ? s.sheet_id === f.sheetId : null;
    return { ...l, s, f, mesma };
  });
  const usadas = linhas.filter((l) => l.s || l.f);
  const cel = (texto: string | null, nao: string) => texto ? <span className="text-foreground">{texto}</span> : <span className="text-muted-foreground">{nao}</span>;

  return (
    <section className="space-y-3 rounded-lg border bg-card p-5">
      <div className="space-y-1">
        <h2 className="font-semibold">Planilhas deste cliente</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Cada planilha aparece uma vez, com os relatórios que a usam. Por enquanto, o Report Semanal e o Checkpoint guardam a própria leitura (colunas por letra e, em vendas e despesas, uma aba por mês), separada da leitura dos relatórios Quinzenal e Mensal. As duas configurações ficam logo abaixo.
        </p>
      </div>
      {usadas.length === 0 && extras.length === 0
        ? <p className="text-sm text-muted-foreground">Nenhuma planilha configurada ainda.</p>
        : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Planilha</th>
                  <th className="px-3 py-2 font-medium">Report Semanal</th>
                  <th className="px-3 py-2 font-medium">Checkpoint</th>
                  <th className="px-3 py-2 font-medium">Quinzenal e Mensal</th>
                  <th className="px-3 py-2 font-medium"><span className="sr-only">Observação</span></th>
                </tr>
              </thead>
              <tbody>
                {usadas.map((l) => (
                  <tr key={l.rotulo} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">{l.rotulo}</td>
                    <td className="px-3 py-2 text-xs">{l.semanal ? cel(l.s ? abaSemanal(l.s) : null, "não configurada") : <span className="text-muted-foreground">não usa</span>}</td>
                    <td className="px-3 py-2 text-xs">{l.checkpoint ? (l.s && checkpoint.has(l.checkpoint) ? <span className="text-foreground">confere</span> : <span className="text-muted-foreground">não confere</span>) : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2 text-xs">{l.financeiro ? cel(l.f ? `aba “${l.f.aba}”` : null, "não configurada") : <span className="text-muted-foreground">não usa</span>}</td>
                    <td className="px-3 py-2 text-xs">
                      {l.mesma === true && <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">mesma planilha</span>}
                      {l.mesma === false && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">planilhas diferentes</span>}
                    </td>
                  </tr>
                ))}
                {extras.map((x) => (
                  <tr key={x.nome} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">{x.nome} <span className="text-xs font-normal text-muted-foreground">(personalizada)</span></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">não usa</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">—</td>
                    <td className="px-3 py-2 text-xs">aba “{x.aba}”</td>
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </section>
  );
}
