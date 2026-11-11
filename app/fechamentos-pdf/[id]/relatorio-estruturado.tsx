import { Fragment, type ReactNode } from "react";
import type { ResultadoFechamento } from "@/lib/fechamentos/servidor";
import { defSecao, extrasDe, paginar, type ExtraSecao, type ItemSecao } from "@/lib/fechamentos/estrutura";
import { blocosLigados } from "@/lib/fechamentos/blocos";
import { Folha, ROXO, SecAnalise, SecDespesas, SecDistribuicao, SecEntradas, SecExperiencia, SecFunilLeadsMensal, SecFunilOrcamentosMensal, SecGrafico, SecReceitasMensal, SecRegimes, SecResultadoMensal, temAnalise } from "./relatorio";
import { ComplementoPdf, SecFontePersonalizada, SecPersonalizada, indicadoresDaSecao } from "./secao-personalizada";
import { COR_QUINZENAL, SecCaixaMes, SecFunilLeadsQuinzenal, SecFunilOrcamentosQuinzenal, SecReceitasQuinzenal, SecResultadoQuinzenal, SecRitmo } from "./relatorio-quinzenal";

/*
 * Monta o relatório a partir da estrutura da clínica (seções ligadas, ordem e
 * nível). Sem configuração, a estrutura padrão reproduz o relatório de sempre.
 */

/** Seção padrão seguida dos indicadores personalizados colocados nela (e dos órfãos, no resultado). */
function secao(r: ResultadoFechamento, s: ItemSecao, cor: string, orfaos: string[]): ReactNode {
  const base = secaoBase(r, s, cor);
  if (s.id.startsWith("fonte:") || s.id.startsWith("sec:")) return base;
  const extras = [...indicadoresDaSecao(r, s.id), ...(s.id === "resultado" ? orfaos.flatMap((o) => indicadoresDaSecao(r, o)) : [])];
  if (!extras.length) return base;
  return <>{base}<ComplementoPdf r={r} itens={extras} /></>;
}

function secaoBase(r: ResultadoFechamento, s: ItemSecao, cor: string): ReactNode {
  const q = r.fechamento.tipo === "quinzenal";
  const p = { r, nivel: s.nivel, blocos: blocosLigados(s, r.fechamento.tipo, { real: !!r.indicadores.caixa?.real }) };
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
    case "entradas": return <SecEntradas {...p} />;
    case "distribuicao": return <SecDistribuicao {...p} />;
    case "regimes": return <SecRegimes {...p} />;
    case "analise": return <SecAnalise r={r} cor={cor} />;
    default: {
      const fundo = q ? "#FFF3EC" : undefined;
      if (s.id.startsWith("sec:")) {
        const titulo = r.secoes.find((x) => `sec:${x.id}` === s.id)?.titulo ?? "";
        return <SecPersonalizada r={r} titulo={titulo} itens={indicadoresDaSecao(r, s.id)} nivel={s.nivel} cor={cor} fundo={fundo} />;
      }
      const fonte = s.id.startsWith("fonte:") ? r.personalizadas.find((x) => `fonte:${x.id}` === s.id) : undefined;
      return fonte ? <SecFontePersonalizada r={r} fonte={fonte} nivel={s.nivel} cor={cor} fundo={fundo} /> : null;
    }
  }
}

const FUNIS = new Set(["funilLeads", "funilOrcamentos"]);

/** Conteúdo de uma página: os dois funis lado a lado quando estão em sequência. */
function conteudo(r: ResultadoFechamento, secoes: ItemSecao[], cor: string, orfaos: string[], extras: ExtraSecao[]): ReactNode[] {
  const out: ReactNode[] = [];
  for (let k = 0; k < secoes.length; k++) {
    const s = secoes[k], prox = secoes[k + 1];
    // Seção que entrou no meio da página (sem abrir página própria) ganha o título dela.
    const d = defSecao(s.id, extras);
    if (k > 0 && d && !d.tituloProprio && !s.id.startsWith("fonte:") && !s.id.startsWith("sec:")) {
      out.push(<h3 key={`t-${s.id}`} className="font-heading mt-2 border-b pb-1 text-base font-semibold" style={{ color: cor, borderColor: "#E7E2EC" }}>{s.id === "resultado" ? "Resultado do período" : d.titulo}</h3>);
    }
    if (FUNIS.has(s.id) && prox && FUNIS.has(prox.id)) {
      // Funis lado a lado: o complemento de cada um fica embaixo dele, na mesma coluna.
      out.push(
        <div key={s.id} className="grid grid-cols-2 gap-8">
          <div>{secaoBase(r, s, cor)}<ComplementoPdf r={r} itens={indicadoresDaSecao(r, s.id)} colunas={2} /></div>
          <div>{secaoBase(r, prox, cor)}<ComplementoPdf r={r} itens={indicadoresDaSecao(r, prox.id)} colunas={2} /></div>
        </div>,
      );
      k++;
      continue;
    }
    out.push(<Fragment key={s.id}>{secao(r, s, cor, orfaos)}</Fragment>);
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
  // Entradas detalhadas só entram quando o cliente tem a fonte de Entradas.
  const semDados = (id: string) => (id === "analise" && !temAnalise(r)) || (id === "entradas" && !r.indicadores.entradas);
  const itens = estrutura.map((s) => (semDados(s.id) ? { ...s, ativa: false } : s));
  // Indicador colocado numa seção que não está no relatório (desligada, ou só do mensal) vai para o resultado.
  const ligadas = new Set(itens.filter((s) => s.ativa).map((s) => s.id));
  const destinos = new Set(r.personalizadas.flatMap((f) => f.indicadores.map((d) => d.secao)).filter((x) => x !== "fonte"));
  const orfaos = [...destinos].filter((d) => !ligadas.has(d) && d !== "resultado");
  const extras = extrasDe(r.personalizadas, r.secoes);
  return (
    <>
      {paginar(itens, r.fechamento.tipo, extras).map((pg) => (
        <Folha key={pg.secoes[0].id} r={r} titulo={tituloDaPagina(r, pg.secoes[0], pg.titulo)} cor={cor} compacta={pg.secoes[0].id === "despesas"}>
          {conteudo(r, pg.secoes, cor, orfaos, extras)}
        </Folha>
      ))}
    </>
  );
}
