import type { ResultadoFechamento } from "@/lib/fechamentos/servidor";
import type { ResultadoPersonalizado } from "@/lib/fechamentos/fonte-personalizada";
import { brl0, num } from "../../(app)/fechamentos/_components/formato";
import { CINZA, Kpi, LINHA, Titulo, Var, mesDe, td } from "./relatorio";

/** Seção de uma fonte personalizada (contratos, cirurgias, recall…). */
export function SecFontePersonalizada({ r, fonte, nivel, cor, fundo }: { r: ResultadoFechamento; fonte: ResultadoPersonalizado; nivel?: string; cor: string; fundo?: string }) {
  const q = r.fechamento.tipo === "quinzenal";
  const vs = q ? `vs 1–15 de ${mesDe(r.anterior.periodo.inicio).slice(0, 3)}` : `vs ${mesDe(r.anterior.periodo.inicio)}`;
  const nota = (a: number | null, b: number | null) => <><Var atual={a} antes={b} /> {vs}</>;
  const m = fonte.medidas;
  const kpis = [
    m.quantidade && <Kpi key="q" fundo={fundo} rotulo="Quantidade" valor={num(fonte.atual.quantidade)} nota={nota(fonte.atual.quantidade, fonte.anterior.quantidade)} />,
    m.valor && <Kpi key="v" fundo={fundo} rotulo="Valor total" valor={brl0(fonte.atual.valor)} nota={nota(fonte.atual.valor, fonte.anterior.valor)} />,
    m.media && <Kpi key="m" fundo={fundo} rotulo="Valor médio" valor={brl0(fonte.atual.media)} nota={nota(fonte.atual.media, fonte.anterior.media)} />,
  ].filter(Boolean);
  const filtro = fonte.filtro ? `só ${fonte.filtro.valores.join(", ")}` : undefined;

  if (fonte.erro) {
    return (
      <div className="pdf-bloco">
        <Titulo cor={cor}>{fonte.nome}</Titulo>
        <p className="text-[11px]" style={{ color: CINZA }}>Planilha não lida neste fechamento.</p>
      </div>
    );
  }
  return (
    <div className="pdf-bloco space-y-3">
      <Titulo cor={cor} extra={filtro}>{fonte.nome}</Titulo>
      <div className="grid grid-cols-4 gap-2.5">{kpis}</div>
      {nivel !== "resumo" && fonte.quebras.some((x) => x.itens.length) && (
        <div className={`grid gap-6 ${fonte.quebras.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {fonte.quebras.filter((x) => x.itens.length).map((qb) => (
            <div key={qb.campo}>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: cor }}>{qb.rotulo}</p>
              <table className="w-full text-[11px]">
                <tbody>
                  {qb.itens.slice(0, 8).map((it) => (
                    <tr key={it.nome} className="border-b last:border-0" style={{ borderColor: LINHA }}>
                      <td className="py-[4px] pr-2">{it.nome}</td>
                      <td className={`${td} text-right`}>{num(it.quantidade)}</td>
                      {m.valor && <td className={`${td} pl-3 text-right`}>{brl0(it.valor)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              {qb.itens.length > 8 && <p className="mt-1 text-[10px]" style={{ color: CINZA }}>+ {qb.itens.length - 8} outros</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
