import React from "react";
import type { RelatorioImagemData, ComentarioItem } from "./imagem-tipos";
import {
  C, col, row, txt, fundoRaiz, LARGURA_OG,
  DIVISOR_CABECALHO, DIVISOR_RODAPE,
} from "./og-tema";

export const COMENTARIOS_LARGURA = LARGURA_OG;

const FONTE_TEXTO = 21;

// ─── Título de seção ─────────────────────────────────────────────────────────
function SecaoTitulo({ label, cor = C.laranja }: { label: string; cor?: string }) {
  return (
    <div
      style={{
        display: "flex",
        fontSize: 26,
        fontWeight: 800,
        color: cor,
        letterSpacing: 3,
        textTransform: "uppercase",
        marginBottom: 14,
      }}
    >
      {label}
    </div>
  );
}

// ─── Avatar: carinha desenhada com divs (Satori não renderiza emoji offline) ──
function Avatar({ critica = false }: { critica?: boolean }) {
  const cor = critica ? C.vermelho : C.roxo;
  const fundo = critica ? "rgba(240,71,71,0.14)" : "rgba(181,123,247,0.16)";
  const olho = { display: "flex", width: 6, height: 6, borderRadius: 99, background: cor };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: 50,
        height: 50,
        borderRadius: 99,
        background: fundo,
        borderWidth: 2,
        borderStyle: "solid",
        borderColor: cor,
        flexShrink: 0,
      }}
    >
      <div style={row({ gap: 11, marginBottom: 5 })}>
        <div style={olho} />
        <div style={olho} />
      </div>
      {/* Boca: meia-lua para elogio, invertida para crítica */}
      <div
        style={{
          display: "flex",
          width: 22,
          height: 11,
          borderBottomWidth: critica ? 0 : 4,
          borderTopWidth: critica ? 4 : 0,
          borderLeftWidth: 0,
          borderRightWidth: 0,
          borderStyle: "solid",
          borderColor: cor,
          borderBottomLeftRadius: critica ? 0 : 22,
          borderBottomRightRadius: critica ? 0 : 22,
          borderTopLeftRadius: critica ? 22 : 0,
          borderTopRightRadius: critica ? 22 : 0,
        }}
      />
    </div>
  );
}

// ─── Selo da origem do comentário ────────────────────────────────────────────
function OrigemSelo({ origem, nota }: { origem: ComentarioItem["origem"]; nota: number | null }) {
  const label = origem === "google" ? "GOOGLE" : "NPS";
  const notaTxt =
    typeof nota === "number" && Number.isFinite(nota)
      ? origem === "google" ? ` · ${nota}★` : ` · nota ${nota}`
      : "";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        background: "rgba(255,255,255,0.07)",
        borderRadius: 99,
        paddingTop: 4,
        paddingBottom: 4,
        paddingLeft: 12,
        paddingRight: 12,
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: 1,
        color: C.lavanda,
        flexShrink: 0,
      }}
    >
      {label}{notaTxt}
    </div>
  );
}

// ─── Card de comentário (altura orgânica: acompanha o texto) ─────────────────
function ComentarioCard({ item }: { item: ComentarioItem }) {
  const critica = item.critica === true;
  return (
    <div
      style={row({
        gap: 16,
        alignItems: "flex-start",
        background: critica ? C.vermelhoBg : C.card,
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: critica ? C.vermelhoBorda : C.cardBorda,
        borderRadius: 14,
        paddingTop: 18,
        paddingBottom: 18,
        paddingLeft: 20,
        paddingRight: 20,
      })}
    >
      <Avatar critica={critica} />
      <div style={col({ flex: 1, minWidth: 0, gap: 10 })}>
        <div
          style={{
            display: "flex",
            fontSize: FONTE_TEXTO,
            color: C.branco,
            lineHeight: 1.5,
          }}
        >
          {item.texto}
        </div>
        <div style={row({ alignItems: "center", gap: 12, flexWrap: "wrap" })}>
          <div
            style={{
              display: "flex",
              fontSize: 17,
              fontWeight: 600,
              color: critica ? C.vermelho : C.roxo,
            }}
          >
            — {item.autor}
          </div>
          <OrigemSelo origem={item.origem} nota={item.nota} />
        </div>
      </div>
    </div>
  );
}

// ─── Normalização: nunca renderizar null/undefined/NaN ───────────────────────
function normalizar(lista: ComentarioItem[] | undefined): ComentarioItem[] {
  return (lista ?? [])
    .map((c) => ({
      texto:   txt(c?.texto),
      autor:   txt(c?.autor) || "Paciente",
      origem:  c?.origem === "google" ? ("google" as const) : ("nps" as const),
      nota:    typeof c?.nota === "number" && Number.isFinite(c.nota) ? c.nota : null,
      critica: c?.critica === true,
    }))
    .filter((c) => c.texto !== "");
}

/** Há conteúdo suficiente para gerar a página 2? */
export function temComentarios(dados: RelatorioImagemData): boolean {
  return normalizar(dados?.comentarios).length > 0;
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function ComentariosOG({
  dados,
  logoSrc,
  largura = COMENTARIOS_LARGURA,
}: {
  dados: RelatorioImagemData;
  logoSrc?: string | null;
  largura?: number;
}) {
  const todos    = normalizar(dados?.comentarios);
  const elogios  = todos.filter((c) => !c.critica);
  const criticas = todos.filter((c) => c.critica);

  const nome = txt(dados?.cabecalho?.clinica_nome) || "Cliente";
  const nomeTruncado = nome.length > 28 ? nome.slice(0, 27) + "…" : nome;
  const semana = dados?.cabecalho?.semana;
  const selo = semana != null && Number.isFinite(semana)
    ? `SEMANA ${semana}`
    : txt(dados?.cabecalho?.tag);
  const ini = txt(dados?.cabecalho?.periodo_ini);
  const fim = txt(dados?.cabecalho?.periodo_fim);
  const periodo = ini && fim ? `${ini} até ${fim}` : "";

  const plural = todos.length === 1 ? "comentário" : "comentários";
  const subtitulo = periodo
    ? `${periodo} · ${todos.length} ${plural} de quem vive a experiência`
    : `${todos.length} ${plural} de quem vive a experiência`;

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
              FEEDBACKS —
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
            {subtitulo}
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

      <div style={DIVISOR_CABECALHO} />

      {/* ── Elogios ── */}
      {elogios.length > 0 && (
        <div style={col()}>
          <SecaoTitulo label="O que os pacientes disseram" />
          <div style={col({ gap: 12 })}>
            {elogios.map((c, i) => (
              <ComentarioCard key={i} item={c} />
            ))}
          </div>
        </div>
      )}

      {/* ── Críticas / Sugestões (some quando não há nenhuma) ── */}
      {criticas.length > 0 && (
        <div style={col({ marginTop: elogios.length > 0 ? 32 : 0 })}>
          <SecaoTitulo label="Críticas / Sugestões" cor={C.vermelho} />
          <div style={col({ gap: 12 })}>
            {criticas.map((c, i) => (
              <ComentarioCard key={i} item={c} />
            ))}
          </div>
        </div>
      )}

      {/* ── Rodapé ── */}
      <div style={DIVISOR_RODAPE} />
      <div style={row({ justifyContent: "space-between", alignItems: "center" })}>
        <div style={{ display: "flex", fontSize: 16, fontWeight: 800, color: C.branco, opacity: 0.35 }}>
          gestfy
        </div>
        <div style={{ display: "flex", fontSize: 14, color: C.lavanda, opacity: 0.85 }}>
          {txt(dados?.rodape?.mes_ano)}
        </div>
      </div>
    </div>
  );
}
