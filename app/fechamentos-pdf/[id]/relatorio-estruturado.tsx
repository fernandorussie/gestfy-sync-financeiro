import { Fragment, type ReactNode } from "react";
import type { ResultadoFechamento } from "@/lib/fechamentos/servidor";
import { paginar, type ItemSecao } from "@/lib/fechamentos/estrutura";
import { Folha, ROXO, SecAnalise, SecDespesas, SecExperiencia, SecFunilLeadsMensal, SecFunilOrcamentosMensal, SecGrafico, SecReceitasMensal, SecRegimes, SecResultadoMensal, temAnalise } from "./relatorio";
import { COR_QUINZENAL, SecCaixaMes, SecFunilLeadsQuinzenal, SecFunilOrcamentosQuinzenal, SecReceitasQuinzenal, SecResultadoQuinzenal, SecRitmo } from "./relatorio-quinzenal";

/*
 * Monta o relatório a partir da estrutura da clínica (seções ligadas, ordem e
 * nível). Sem configuração, a estrutura padrão reproduz o relatório de sempre.
 */

function secao(r: ResultadoFechamento, s: ItemSecao, cor: string): ReactNode {
  const q = r.fechamento.tipo === "quinzenal";
  const p = { r, nivel: s.nivel };
  switch (s.id) {
    case "resultado": return q ? <SecResultadoQuinzenal {...p} /> : <SecResultadoMensal {...p} />;
    case "grafico": return <SecGrafico {...p} />;
    case "ritmo": return <SecRitmo {...p} />;
    case "caixaMes": return <SecCaixaMes {...p} />;
    case "funilLeads": return q ? <SecFunilLeadsQuinzenal {...p} /> : <SecFunilLeadsMensal {...p} />;
    case "funilOrcamentos": return q ? <SecFunilOrcamentosQuinzenal {...p} /> : <SecFunilOrcamentosMensal {...p} />;
    case "experiencia": return <SecExperiencia {...p} />;
    case "receitas": return q ? <SecReceitasQuinzenal {...p} /> : <SecReceitasMensal {...p} />;
    case "despesas": return <SecDespesas {...p} />;
    case "regimes": return <SecRegimes {...p} />;
    case "analise": return <SecAnalise r={r} cor={cor} />;
    default: return null;
  }
}

const FUNIS = new Set(["funilLeads", "funilOrcamentos"]);

/** Conteúdo de uma página: os dois funis lado a lado quando estão em sequência. */
function conteudo(r: ResultadoFechamento, secoes: ItemSecao[], cor: string): ReactNode[] {
  const out: ReactNode[] = [];
  for (let k = 0; k < secoes.length; k++) {
    const s = secoes[k], prox = secoes[k + 1];
    if (FUNIS.has(s.id) && prox && FUNIS.has(prox.id)) {
      out.push(<div key={s.id} className="grid grid-cols-2 gap-8">{secao(r, s, cor)}{secao(r, prox, cor)}</div>);
      k++;
      continue;
    }
    out.push(<Fragment key={s.id}>{secao(r, s, cor)}</Fragment>);
  }
  return out;
}

function tituloDaPagina(r: ResultadoFechamento, primeira: ItemSecao, padrao: string) {
  if (primeira.id === "regimes") return `Resultado em ${r.periodo.fim.slice(0, 4)}: caixa e competência`;
  if (primeira.id === "receitas" && r.fechamento.tipo === "quinzenal") return "Faturamento por categoria";
  return padrao;
}

export function RelatorioEstruturado({ r, estrutura }: { r: ResultadoFechamento; estrutura: ItemSecao[] }) {
  const cor = r.fechamento.tipo === "quinzenal" ? COR_QUINZENAL : ROXO;
  // A página de análise só entra se houver texto ou plano.
  const itens = estrutura.map((s) => (s.id === "analise" && !temAnalise(r) ? { ...s, ativa: false } : s));
  return (
    <>
      {paginar(itens, r.fechamento.tipo).map((pg) => (
        <Folha key={pg.secoes[0].id} r={r} titulo={tituloDaPagina(r, pg.secoes[0], pg.titulo)} cor={cor} compacta={pg.secoes[0].id === "despesas"}>
          {conteudo(r, pg.secoes, cor)}
        </Folha>
      ))}
    </>
  );
}
