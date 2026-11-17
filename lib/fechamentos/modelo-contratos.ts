import { indicadorVazio, type Filtro, type IndicadorDef } from "./fonte-personalizada";
import { normalizar } from "./texto";

/**
 * Modelo pronto "Contratos e unidades" para fontes personalizadas em posição
 * atual (locação, salas, lojas). Procura as colunas pelo cabeçalho e os valores
 * de status pelo que existe na planilha; o que não encontrar fica de fora e
 * a lista de faltas volta para a tela avisar.
 */
export interface ModeloContratos {
  indicadores: IndicadorDef[];
  colunas: { unidade?: string; localidade?: string; status?: string; termino?: string; statusContrato?: string };
  faltando: string[];
}

const achar = (cab: string[], ...testes: RegExp[]) => {
  for (const t of testes) { const h = cab.find((x) => t.test(normalizar(x))); if (h) return h; }
  return undefined;
};
const valorQue = (lista: string[] | undefined, re: RegExp) => (lista ?? []).find((v) => re.test(normalizar(v)));

export function modeloContratos(cabecalho: string[], valores: Record<string, string[]>, diasVencer = 60): ModeloContratos {
  const cab = cabecalho.filter(Boolean);
  const statusContrato = achar(cab, /^status (do )?contrato/, /^situacao (do )?contrato/);
  const colunas: ModeloContratos["colunas"] = {
    unidade: achar(cab, /^loja/, /^unidade/, /^sala/, /^imovel/, /^n[ºo°]?\s*$|^numero/),
    localidade: achar(cab, /^localidade/, /^local\b/, /^empreendimento/, /^predio/, /^bloco/),
    status: cab.find((h) => h !== statusContrato && /^(status|situacao|ocupacao)$/.test(normalizar(h))),
    termino: achar(cab, /^termino/, /^fim do contrato/, /^vencimento do contrato/, /^data (de )?termino/),
    statusContrato,
  };
  const faltando: string[] = [];
  if (!colunas.unidade) faltando.push("coluna da unidade (ex.: Loja/Nº, Unidade, Sala)");
  if (!colunas.status) faltando.push("coluna Status (Ocupada/Desocupada)");
  if (!colunas.termino) faltando.push("coluna Término do contrato");
  if (!colunas.unidade) return { indicadores: [], colunas, faltando };

  const u = colunas.unidade;
  // Ids com sufixo: aplicar o modelo duas vezes não mistura as fórmulas.
  const sfx = Math.random().toString(36).slice(2, 6);
  const id = (x: string) => `${x}-${sfx}`;
  // Localidade "Outros" (casa, terreno) fica fora da base de unidades, quando existir.
  // Sem valores lidos ainda, usa os nomes usuais (o filtro compara sem maiúsculas nem acentos; se não existir, não tira nada).
  const outros = colunas.localidade ? valorQue(valores[colunas.localidade], /^outros?$/) ?? "Outros" : undefined;
  const base: Filtro[] = outros && colunas.localidade ? [{ coluna: colunas.localidade, op: "diferente", valor: outros }] : [];
  const vago = colunas.status ? valorQue(valores[colunas.status], /desocupad|vag[oa]|livre|disponivel/) ?? "Desocupada" : undefined;
  const ocupado = colunas.status ? valorQue(valores[colunas.status], /^ocupad|alugad|locad/) ?? "Ocupada" : undefined;
  const atraso = colunas.statusContrato ? valorQue(valores[colunas.statusContrato], /atras/) ?? "Atrasado" : undefined;

  const ind = (chave: string, nome: string, filtros: Filtro[], melhor: IndicadorDef["melhor"] = "neutro") =>
    indicadorVazio({ id: id(chave), nome, operacao: "distintos", coluna: u, filtros: [...base, ...filtros], melhor });
  const out: IndicadorDef[] = [ind("unidades", "Unidades", [])];
  if (colunas.status) {
    out.push(ind("ocupadas", "Unidades ocupadas", [{ coluna: colunas.status, op: "igual", valor: ocupado! }], "maior"));
    out.push(ind("vagas", "Unidades vagas", [{ coluna: colunas.status, op: "igual", valor: vago! }], "menor"));
    out.push(indicadorVazio({ id: id("vacancia"), nome: "Vacância", tipo: "formula", termos: [id("vagas"), id("unidades")], ops: ["%"], formato: "percentual", melhor: "menor" }));
  }
  if (colunas.termino) {
    const ocup: Filtro[] = colunas.status ? [{ coluna: colunas.status, op: "igual", valor: ocupado! }] : [];
    out.push(ind("vencer", `Contratos vencendo em ${diasVencer} dias`, [{ coluna: colunas.termino, op: "proximos", valor: String(diasVencer) }, ...ocup], "menor"));
    out.push(ind("vencidos", "Contratos vencidos", [{ coluna: colunas.termino, op: "passou" }, ...ocup], "menor"));
  }
  if (colunas.statusContrato && atraso) out.push(ind("atraso", "Contratos em atraso", [{ coluna: colunas.statusContrato, op: "igual", valor: atraso }], "menor"));
  return { indicadores: out, colunas, faltando };
}
