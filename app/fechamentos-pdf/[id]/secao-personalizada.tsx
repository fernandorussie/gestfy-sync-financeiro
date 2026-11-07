import type { ResultadoFechamento } from "@/lib/fechamentos/servidor";
import type { ResultadoIndicador, ResultadoPersonalizado } from "@/lib/fechamentos/fonte-personalizada";
import { formatarIndicador, variacaoIndicador } from "@/lib/fechamentos/formato-indicador";
import { num } from "../../(app)/fechamentos/_components/formato";
import { CINZA, Kpi, LINHA, Titulo, VERDE, VERMELHO, mesDe, td } from "./relatorio";

export interface IndicadorComFonte extends ResultadoIndicador { fonte: string }

/** Indicadores personalizados de todas as fontes que vão para uma seção ("fonte" fica fora: usa a seção da própria fonte). */
export function indicadoresDaSecao(r: ResultadoFechamento, secao: string): IndicadorComFonte[] {
  return r.personalizadas.filter((f) => !f.erro).flatMap((f) => f.indicadores.filter((d) => d.secao === secao).map((d) => ({ ...d, fonte: f.nome })));
}

function rotuloVs(r: ResultadoFechamento) {
  return r.fechamento.tipo === "quinzenal" ? `vs 1–15 de ${mesDe(r.anterior.periodo.inicio).slice(0, 3)}` : `vs ${mesDe(r.anterior.periodo.inicio)}`;
}

function Nota({ d, vs }: { d: ResultadoIndicador; vs: string }) {
  const v = variacaoIndicador(d.atual, d.anterior, d.formato, d.melhor);
  if (!v) return <>anterior {formatarIndicador(d.anterior, d.formato)}</>;
  const cor = v.tom === "bom" ? VERDE : v.tom === "ruim" ? VERMELHO : CINZA;
  return <><span className={v.tom === "ruim" ? "font-semibold" : ""} style={{ color: cor }}>{v.texto}</span> {vs}</>;
}

/** Boxes dos indicadores e, no nível completo, as tabelas dos agrupados. */
export function IndicadoresPdf({ r, itens, nivel, cor, fundo, comFonte }: { r: ResultadoFechamento; itens: (ResultadoIndicador & { fonte?: string })[]; nivel?: string; cor: string; fundo?: string; comFonte?: boolean }) {
  const vs = rotuloVs(r);
  const simples = itens.filter((d) => !d.grupos);
  const agrupados = nivel === "resumo" ? [] : itens.filter((d) => d.grupos?.length);
  if (!simples.length && !agrupados.length) return null;
  return (
    <div className="space-y-3">
      {simples.length > 0 && (
        <div className="grid grid-cols-4 gap-2.5">
          {simples.map((d) => (
            <Kpi key={`${d.fonte ?? ""}${d.id}`} fundo={fundo} rotulo={comFonte && d.fonte ? `${d.nome} · ${d.fonte}` : d.nome} valor={formatarIndicador(d.atual, d.formato)} nota={<Nota d={d} vs={vs} />} />
          ))}
        </div>
      )}
      {agrupados.length > 0 && (
        <div className={`grid gap-6 ${agrupados.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {agrupados.map((d) => (
            <div key={`${d.fonte ?? ""}${d.id}`} className="pdf-bloco">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: cor }}>{d.nome}{comFonte && d.fonte ? ` · ${d.fonte}` : ""}</p>
              <table className="w-full text-[11px]">
                <tbody>
                  {d.grupos!.slice(0, 8).map((g) => (
                    <tr key={g.nome} className="border-b last:border-0" style={{ borderColor: LINHA }}>
                      <td className="py-[4px] pr-2">{g.nome}</td>
                      {d.formato === "moeda" && <td className={`${td} pr-3 text-right`} style={{ color: CINZA }}>{num(g.linhas)}</td>}
                      <td className={`${td} text-right`}>{formatarIndicador(g.valor, d.formato)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {d.grupos!.length > 8 && <p className="mt-1 text-[10px]" style={{ color: CINZA }}>+ {d.grupos!.length - 8} outros</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Complemento compacto de uma seção padrão (resultado, funis, receitas…):
 * indicadores em linha, para não empurrar a página. Agrupados viram linhas com os 5 maiores.
 */
export function ComplementoPdf({ r, itens, colunas = 4 }: { r: ResultadoFechamento; itens: IndicadorComFonte[]; colunas?: number }) {
  if (!itens.length) return null;
  const vs = rotuloVs(r);
  return (
    <div className="pdf-bloco mt-2 grid gap-x-4 gap-y-1.5 border-t pt-2" style={{ borderColor: LINHA, gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` }}>
      {itens.map((d) => (
        <div key={`${d.fonte}${d.id}`} className="min-w-0 text-[10px]" style={{ gridColumn: d.grupos ? `span ${Math.min(colunas, 2)}` : undefined }}>
          <p className="truncate" style={{ color: CINZA }}>{d.nome} <span className="opacity-70">· {d.fonte}</span></p>
          {d.grupos ? (
            <p className="truncate">{d.grupos.slice(0, 5).map((g) => `${g.nome} ${formatarIndicador(g.valor, d.formato)}`).join(" · ") || "—"}</p>
          ) : (
            <p><b className="text-[12.5px] tabular-nums" >{formatarIndicador(d.atual, d.formato)}</b> <Nota d={d} vs={vs} /></p>
          )}
        </div>
      ))}
    </div>
  );
}

/** Seção de uma fonte personalizada (contratos, cirurgias, recall…): os indicadores que ficam na própria fonte. */
export function SecFontePersonalizada({ r, fonte, nivel, cor, fundo }: { r: ResultadoFechamento; fonte: ResultadoPersonalizado; nivel?: string; cor: string; fundo?: string }) {
  if (fonte.erro) {
    return (
      <div className="pdf-bloco">
        <Titulo cor={cor}>{fonte.nome}</Titulo>
        <p className="text-[11px]" style={{ color: CINZA }}>Planilha não lida neste fechamento.</p>
      </div>
    );
  }
  return (
    <div className="pdf-bloco space-y-2">
      <Titulo cor={cor}>{fonte.nome}</Titulo>
      <IndicadoresPdf r={r} itens={fonte.indicadores.filter((d) => d.secao === "fonte")} nivel={nivel} cor={cor} fundo={fundo} />
    </div>
  );
}

/** Seção criada no editor de estrutura, com indicadores de qualquer fonte. */
export function SecPersonalizada({ r, titulo, itens, nivel, cor, fundo }: { r: ResultadoFechamento; titulo: string; itens: IndicadorComFonte[]; nivel?: string; cor: string; fundo?: string }) {
  if (!itens.length) return null;
  return (
    <div className="pdf-bloco space-y-2">
      <Titulo cor={cor}>{titulo}</Titulo>
      <IndicadoresPdf r={r} itens={itens} nivel={nivel} cor={cor} fundo={fundo} />
    </div>
  );
}
