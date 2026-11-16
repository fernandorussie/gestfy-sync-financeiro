import React from "react";
import { limparSemanal, ligado, tituloDaSecao, type KpiSemanal, type SecaoSemanal } from "./estrutura-semanal";
import { formatarIndicador, variacaoIndicador } from "@/lib/fechamentos/formato-indicador";
import type { RelatorioImagemData, DestaqueItem } from "./imagem-tipos";
import {
  C, col, row, txt, isNA, fundoRaiz, LARGURA_OG,
  DIVISOR_CABECALHO, DIVISOR_RODAPE,
} from "./og-tema";

export const INFOGRAFICO_LARGURA = LARGURA_OG;

// ─── Título de seção ─────────────────────────────────────────────────────────
function SecaoTitulo({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        fontSize: 26,
        fontWeight: 800,
        color: C.laranja,
        letterSpacing: 3,
        textTransform: "uppercase",
        marginBottom: 14,
      }}
    >
      {label}
    </div>
  );
}

// ─── Barra de progresso real (largura = % de atingimento) ────────────────────
function BarraProgresso({ pct }: { pct: number }) {
  const preenchido = Math.max(0, Math.min(100, pct));
  const completo = pct >= 100;
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: 8,
        borderRadius: 99,
        background: C.trilho,
        marginTop: 12,
        marginBottom: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          width: `${preenchido}%`,
          height: 8,
          borderRadius: 99,
          background: completo
            ? `linear-gradient(90deg, ${C.magenta}, ${C.verde})`
            : `linear-gradient(90deg, ${C.magenta}, ${C.laranja})`,
        }}
      />
    </div>
  );
}

// ─── Valor do card: monetário sai em duas linhas ("R$" em cima) ──────────────
function ValorCard({ valor, cor }: { valor: string; cor: string }) {
  const monetario = /^R\$\s*/.test(valor);
  const numero = monetario ? valor.replace(/^R\$\s*/, "") : valor;
  // Encolhe o número quando é longo (ex: "1.158.390")
  const tamanho = numero.length > 8 ? 28 : numero.length > 6 ? 32 : monetario ? 36 : 44;

  if (!monetario) {
    return (
      <div style={{ display: "flex", fontSize: tamanho, fontWeight: 800, color: cor, lineHeight: 1.1 }}>
        {numero}
      </div>
    );
  }

  return (
    <div style={col({ lineHeight: 1.05 })}>
      <div style={{ display: "flex", fontSize: tamanho, fontWeight: 800, color: cor }}>R$</div>
      <div style={{ display: "flex", fontSize: tamanho, fontWeight: 800, color: cor }}>{numero}</div>
    </div>
  );
}

// ─── Card de indicador (topo) ────────────────────────────────────────────────
function KpiCard({
  label,
  valor,
  sub,
  perigo = false,
  pct,
}: {
  label: string;
  valor: string;
  sub: string;
  perigo?: boolean;
  pct?: number | null;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minWidth: 0,
        background: perigo ? C.vermelhoBg : C.card,
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: perigo ? C.vermelhoBorda : C.cardBorda,
        borderRadius: 16,
        paddingTop: 18,
        paddingBottom: 18,
        paddingLeft: 18,
        paddingRight: 18,
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 12,
          color: C.lavanda,
          textTransform: "uppercase",
          letterSpacing: 1,
          lineHeight: 1.35,
          height: 33,
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      <ValorCard valor={valor} cor={perigo ? C.vermelho : C.branco} />
      {pct != null && <BarraProgresso pct={pct} />}
      {sub !== "" && (
        <div
          style={{
            display: "flex",
            fontSize: 12,
            color: C.lavanda,
            lineHeight: 1.4,
            marginTop: pct != null ? 0 : 10,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

// ─── Ícone de destaque ───────────────────────────────────────────────────────
function DestaqueIcone({ tipo }: { tipo: DestaqueItem["tipo"] }) {
  const map: Record<DestaqueItem["tipo"], { symbol: string; bg: string; color: string }> = {
    positivo:   { symbol: "+", bg: "rgba(63,191,110,0.18)", color: C.verde   },
    financeiro: { symbol: "$", bg: "rgba(245,135,47,0.18)", color: C.laranja },
    atencao:    { symbol: "!", bg: "rgba(230,167,0,0.18)",  color: C.ambar   },
  };
  const { symbol, bg, color } = map[tipo] ?? map.atencao;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        borderRadius: 8,
        background: bg,
        fontSize: 16,
        fontWeight: 800,
        color,
        flexShrink: 0,
      }}
    >
      {symbol}
    </div>
  );
}

// ─── Ícone de alerta ─────────────────────────────────────────────────────────
function AlertaIcone() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        borderRadius: 8,
        background: "rgba(240,71,71,0.2)",
        fontSize: 16,
        fontWeight: 800,
        color: C.vermelho,
        flexShrink: 0,
      }}
    >
      !
    </div>
  );
}

// ─── Linha de item (altura orgânica: acompanha o texto) ──────────────────────
// Sempre menor que o título de seção (26), para preservar a hierarquia visual.
const FONTE_ITEM = 21;
const FONTE_NUM_ACAO = 25;

function ItemCard({
  icone,
  texto,
  perigo = false,
}: {
  icone: React.ReactNode;
  texto: string;
  perigo?: boolean;
}) {
  return (
    <div
      style={row({
        gap: 14,
        alignItems: "flex-start",
        background: perigo ? C.vermelhoBg : C.card,
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: perigo ? C.vermelhoBorda : C.cardBorda,
        borderRadius: 12,
        paddingTop: 14,
        paddingBottom: 14,
        paddingLeft: 18,
        paddingRight: 18,
      })}
    >
      {icone}
      <div
        style={{
          display: "flex",
          flex: 1,
          minWidth: 0,
          fontSize: FONTE_ITEM,
          color: C.branco,
          lineHeight: 1.45,
          paddingTop: 3,
        }}
      >
        {texto}
      </div>
    </div>
  );
}

// ─── Defaults seguros para dados que possam vir incompletos do JSON ───────────
function withDefaults(raw: RelatorioImagemData): RelatorioImagemData {
  const f = raw.visaoGeral?.faturamento;
  const n = raw.visaoGeral?.npsGoogle;
  const com = raw.visaoGeral?.comercial;
  return {
    cabecalho: {
      clinica_nome: raw.cabecalho?.clinica_nome ?? "Cliente",
      tag: raw.cabecalho?.tag ?? "",
      semana: raw.cabecalho?.semana ?? null,
      periodo_ini: raw.cabecalho?.periodo_ini ?? "--",
      periodo_fim: raw.cabecalho?.periodo_fim ?? "--",
    },
    rodape: { mes_ano: raw.rodape?.mes_ano ?? "" },
    visaoGeral: {
      faturamento: {
        is_media:                       f?.is_media                       ?? false,
        realizado_filtro:               f?.realizado_filtro,
        realizado_filtro_from_planilha: f?.realizado_filtro_from_planilha ?? false,
        acumulado:                      f?.acumulado                      ?? "N/A",
        acumulado_from_planilha:        f?.acumulado_from_planilha        ?? false,
        meta_periodo:                   f?.meta_periodo                   ?? "N/A",
        pct_periodo:                    f?.pct_periodo                    ?? null,
        acima_periodo:                  f?.acima_periodo                  ?? false,
        meta_mensal:                    f?.meta_mensal                    ?? "N/A",
        pct_mensal:                     f?.pct_mensal                     ?? null,
        acima_mensal:                   f?.acima_mensal                   ?? false,
      },
      npsGoogle: {
        respostas_nps:     n?.respostas_nps     ?? null,
        avaliacoes_google: n?.avaliacoes_google ?? null,
        meta_nps_meta:     n?.meta_nps_meta     ?? null,
        meta_google_meta:  n?.meta_google_meta  ?? null,
      },
      comercial: {
        conversao_leads:      com?.conversao_leads      ?? "N/A",
        conversao_orcamentos: com?.conversao_orcamentos ?? "N/A",
        total_leads:          com?.total_leads          ?? "N/A",
        total_orcamentos:     com?.total_orcamentos     ?? "N/A",
      },
    },
    destaques: raw.destaques ?? [],
    alertas:   raw.alertas   ?? [],
    acoes:     raw.acoes     ?? [],
    estrutura: raw.estrutura,
    financeiro: raw.financeiro,
    personalizados: raw.personalizados ?? [],
    despesasRelevantes: raw.despesasRelevantes ?? [],
    contratos: raw.contratos ?? [],
  };
}

const moedaCard = (v: number) => (v < 0 ? "−" : "") + formatarIndicador(Math.abs(v), "moeda");

// ─── Monta os cards de indicador a partir dos dados (oculta os N/A) ──────────
interface KpiSpec {
  id: KpiSemanal;
  label: string;
  valor: string;
  sub: string;
  perigo?: boolean;
  pct?: number | null;
}

function montarKpis(dados: RelatorioImagemData): KpiSpec[] {
  const fat = dados.visaoGeral.faturamento;
  const ng  = dados.visaoGeral.npsGoogle;
  const com = dados.visaoGeral.comercial;

  const kpis: KpiSpec[] = [];
  const numOk = (v: number | null | undefined): v is number =>
    typeof v === "number" && Number.isFinite(v);

  // 1 — Faturamento no período selecionado
  if (!isNA(fat.realizado_filtro)) {
    kpis.push({
      id: "faturamentoPeriodo",
      label: "Faturamento no período",
      valor: txt(fat.realizado_filtro),
      sub: isNA(fat.meta_periodo) ? "Período avaliado" : `Meta do período: ${txt(fat.meta_periodo)}`,
    });
  }

  // 2 — Acumulado no mês, com barra de progresso real da meta mensal
  if (!isNA(fat.acumulado)) {
    const pct = numOk(fat.pct_mensal) ? fat.pct_mensal : null;
    kpis.push({
      id: "acumuladoMes",
      label: "Acumulado no mês",
      valor: txt(fat.acumulado),
      pct,
      sub: pct != null ? `${pct}% da meta mensal` : "Sem meta mensal definida",
    });
  }

  // 3 — Respostas NPS
  if (numOk(ng.respostas_nps)) {
    const meta = numOk(ng.meta_nps_meta) && ng.meta_nps_meta > 0 ? ng.meta_nps_meta : null;
    const pct = meta ? Math.round((ng.respostas_nps / meta) * 100) : null;
    kpis.push({
      id: "respostasNps",
      label: "Respostas NPS",
      valor: String(ng.respostas_nps),
      sub: pct != null ? `${pct}% da meta (${meta})` : "No período avaliado",
      perigo: ng.respostas_nps === 0,
    });
  }

  // 4 — Avaliações Google
  if (numOk(ng.avaliacoes_google)) {
    const meta = numOk(ng.meta_google_meta) && ng.meta_google_meta > 0 ? ng.meta_google_meta : null;
    const pct = meta ? Math.round((ng.avaliacoes_google / meta) * 100) : null;
    kpis.push({
      id: "avaliacoesGoogle",
      label: "Avaliações Google",
      valor: String(ng.avaliacoes_google),
      sub: ng.avaliacoes_google === 0
        ? "Nenhuma nova avaliação"
        : pct != null ? `${pct}% da meta (${meta})` : "No período avaliado",
      perigo: ng.avaliacoes_google === 0,
    });
  }

  // 5 — Total de leads
  if (!isNA(com.total_leads)) {
    const zero = txt(com.total_leads) === "0";
    kpis.push({
      id: "totalLeads",
      label: "Total de leads",
      valor: txt(com.total_leads),
      sub: zero
        ? "Sem registro no CRM"
        : isNA(com.conversao_leads)
          ? "No período avaliado"
          : `Conversão de ${txt(com.conversao_leads)}`,
      perigo: zero,
    });
  }

  // 6 a 8 — Financeiro (entradas, saídas pagas, saldo)
  const fin = dados.financeiro;
  if (fin) {
    const noMes = (v: number | null) => (v === null ? "" : `No mês: ${moedaCard(v)}`);
    if (numOk(fin.entradas)) kpis.push({ id: "entradasPeriodo", label: fin.origemEntradas === "vendas" ? "Entradas do período (vendas)" : "Entradas do período", valor: moedaCard(fin.entradas), sub: noMes(fin.entradasMes) });
    if (numOk(fin.saidas)) kpis.push({ id: "saidasPagas", label: "Saídas pagas", valor: moedaCard(fin.saidas), sub: noMes(fin.saidasMes) });
    if (numOk(fin.entradas) && numOk(fin.saidas)) {
      const saldo = fin.entradas - fin.saidas;
      const saldoMes = numOk(fin.entradasMes) && numOk(fin.saidasMes) ? fin.entradasMes - fin.saidasMes : null;
      kpis.push({ id: "saldoPeriodo", label: "Saldo do período", valor: moedaCard(saldo), sub: noMes(saldoMes) || "Entradas − saídas pagas", perigo: saldo < 0 });
    }
  }

  // Cards de indicadores personalizados (ex.: unidades ocupadas, vacância)
  for (const p of dados.personalizados ?? []) {
    if (!numOk(p.atual)) continue;
    const v = variacaoIndicador(p.atual, p.anterior, p.formato, p.melhor);
    kpis.push({
      id: p.id as KpiSemanal,
      label: p.nome,
      valor: formatarIndicador(p.atual, p.formato),
      sub: p.anterior == null ? "Situação atual" : `Semana anterior: ${formatarIndicador(p.anterior, p.formato)}${v && v.sentido !== "igual" ? ` (${v.texto})` : ""}`,
    });
  }

  // Ordem e blocos escolhidos na estrutura do cliente (sem estrutura salva: todos, na ordem padrão).
  const est = limparSemanal(dados.estrutura);
  const pos = (id: KpiSemanal) => est.kpis.findIndex((k) => k.id === id);
  return kpis.filter((k) => ligado(est.kpis, k.id)).sort((a, b) => pos(a.id) - pos(b.id));
}

/** Até 5 cards numa linha; mais que isso, linhas equilibradas (6 = 3+3, 7 = 4+3, 8 = 4+4). */
function linhasDeKpis<T>(xs: T[]): T[][] {
  if (xs.length <= 5) return [xs];
  const n = Math.ceil(xs.length / 2);
  return [xs.slice(0, n), xs.slice(n)];
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function InfograficoOG({
  dados: rawDados,
  logoSrc,
  largura = INFOGRAFICO_LARGURA,
}: {
  dados: RelatorioImagemData;
  logoSrc?: string | null;
  largura?: number;
}) {
  const dados = withDefaults(rawDados);
  const { cabecalho, rodape } = dados;

  const kpis = montarKpis(dados);
  // Renderiza exatamente os itens existentes; seção sem item não aparece.
  const destaques = dados.destaques.filter((d) => txt(d?.texto) !== "");
  const alertas   = dados.alertas.map(txt).filter((a) => a !== "");
  const acoes     = dados.acoes.map(txt).filter((a) => a !== "");
  const despesas  = (dados.despesasRelevantes ?? []).map(txt).filter((a) => a !== "");
  const contratos = (dados.contratos ?? []).map(txt).filter((a) => a !== "");

  const nome = txt(cabecalho.clinica_nome) || "Cliente";
  const nomeTruncado = nome.length > 28 ? nome.slice(0, 27) + "…" : nome;
  const selo = cabecalho.semana != null && Number.isFinite(cabecalho.semana)
    ? `SEMANA ${cabecalho.semana}`
    : txt(cabecalho.tag);
  const periodo = `${txt(cabecalho.periodo_ini)} até ${txt(cabecalho.periodo_fim)}`;

  const est = limparSemanal(dados.estrutura);
  const ordem = est.secoes.filter((x) => x.ligado && x.id !== "feedbacks").map((x) => x.id) as Exclude<SecaoSemanal, "feedbacks">[];
  const blocos: Record<Exclude<SecaoSemanal, "feedbacks">, React.ReactNode> = {
    indicadores: kpis.length > 0 ? (
        <div key="indicadores" style={col({ gap: 12, marginTop: ordem[0] === "indicadores" ? 0 : 30 })}>
          {linhasDeKpis(kpis).map((linha, j) => (
            <div key={j} style={row({ gap: 12 })}>
              {linha.map((k, i) => (
                <KpiCard key={i} label={k.label} valor={k.valor} sub={k.sub} perigo={k.perigo} pct={k.pct} />
              ))}
            </div>
          ))}
        </div>
    ) : null,
    despesas: despesas.length > 0 ? (
        <div key="despesas" style={col({ marginTop: 30 })}>
          <SecaoTitulo label={tituloDaSecao(est, "despesas")} />
          <div style={col({ gap: 10 })}>
            {despesas.map((d, i) => (
              <ItemCard key={i} icone={<DestaqueIcone tipo="financeiro" />} texto={d} />
            ))}
          </div>
        </div>
    ) : null,
    contratos: contratos.length > 0 ? (
        <div key="contratos" style={col({ marginTop: 30 })}>
          <SecaoTitulo label={tituloDaSecao(est, "contratos")} />
          <div style={col({ gap: 10 })}>
            {contratos.map((c, i) => (
              <ItemCard key={i} icone={<DestaqueIcone tipo="atencao" />} texto={c} />
            ))}
          </div>
        </div>
    ) : null,
    destaques: destaques.length > 0 ? (
        <div key="destaques" style={col({ marginTop: 30 })}>
          <SecaoTitulo label={tituloDaSecao(est, "destaques")} />
          <div style={col({ gap: 10 })}>
            {destaques.map((d, i) => (
              <ItemCard key={i} icone={<DestaqueIcone tipo={d.tipo} />} texto={txt(d.texto)} />
            ))}
          </div>
        </div>
    ) : null,
    alertas: alertas.length > 0 ? (
        <div key="alertas" style={col({ marginTop: 30 })}>
          <SecaoTitulo label={tituloDaSecao(est, "alertas")} />
          <div style={col({ gap: 10 })}>
            {alertas.map((a, i) => (
              <ItemCard key={i} icone={<AlertaIcone />} texto={a} perigo />
            ))}
          </div>
        </div>
    ) : null,
    acoes: acoes.length > 0 ? (
        <div key="acoes" style={col({ marginTop: 30 })}>
          <SecaoTitulo label={tituloDaSecao(est, "acoes")} />
          <div style={col()}>
            {acoes.map((a, i) => (
              <div
                key={i}
                style={row({
                  gap: 20,
                  alignItems: "flex-start",
                  paddingTop: i === 0 ? 2 : 14,
                  paddingBottom: 14,
                  // Linha sutil apenas entre as ações, sem card em volta
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopStyle: "solid",
                  borderTopColor: "rgba(255,255,255,0.08)",
                })}
              >
                <div
                  style={{
                    display: "flex",
                    width: 46,
                    flexShrink: 0,
                    fontSize: FONTE_NUM_ACAO,
                    fontWeight: 800,
                    color: C.roxo,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div
                  style={{
                    display: "flex",
                    flex: 1,
                    minWidth: 0,
                    fontSize: FONTE_ITEM,
                    color: C.branco,
                    lineHeight: 1.45,
                    paddingTop: 4,
                  }}
                >
                  {a}
                </div>
              </div>
            ))}
          </div>
        </div>
    ) : null,
  };

  return (
    <div style={fundoRaiz(largura)}>
      {/* ── Cabeçalho ── */}
      <div style={row({ alignItems: "center", gap: 18 })}>
        {logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoSrc}
            width={44}
            height={44}
            alt="Gestfy"
            style={{ objectFit: "contain", flexShrink: 0 }}
          />
        ) : null}

        <div style={col({ flex: 1, minWidth: 0, gap: 6 })}>
          <div style={row({ alignItems: "baseline", gap: 10 })}>
            <div style={{ display: "flex", fontSize: 30, fontWeight: 800, color: C.laranja, letterSpacing: 1 }}>
              REPORT SEMANAL —
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 30,
                fontWeight: 800,
                color: C.branco,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              {nomeTruncado}
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 16, color: C.lavanda }}>
            {kpis.some((k) => k.id === "faturamentoPeriodo" || k.id === "acumuladoMes") ? `${periodo} · Comparativo com meta do período` : periodo}
          </div>
        </div>

        {selo !== "" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
              borderWidth: 2,
              borderStyle: "solid",
              borderColor: C.laranja,
              borderRadius: 99,
              background: "rgba(245,135,47,0.10)",
              paddingTop: 9,
              paddingBottom: 9,
              paddingLeft: 20,
              paddingRight: 20,
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: 2,
              color: C.laranja,
              textTransform: "uppercase",
            }}
          >
            {selo}
          </div>
        )}
      </div>

      {/* ── Divisor ── */}
      <div style={DIVISOR_CABECALHO} />

      {/* ── Blocos na ordem da estrutura do cliente ── */}
      {ordem.map((id) => blocos[id])}

      {/* ── Rodapé ── */}
      <div style={DIVISOR_RODAPE} />
      <div style={row({ justifyContent: "space-between", alignItems: "center" })}>
        <div style={{ display: "flex", fontSize: 16, fontWeight: 800, color: C.branco, opacity: 0.35 }}>
          gestfy
        </div>
        <div style={{ display: "flex", fontSize: 14, color: C.lavanda, opacity: 0.85 }}>
          {txt(rodape.mes_ano)}
        </div>
      </div>
    </div>
  );
}
