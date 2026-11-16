import React from "react";
import {
  C, col, row, txt, fundoRaiz, LARGURA_OG,
  DIVISOR_CABECALHO, DIVISOR_RODAPE,
} from "@/lib/relatorio/og-tema";
import type { StatusCheckpoint } from "./avaliar";

export const CHECKPOINT_LARGURA = LARGURA_OG;

export interface IndicadorImagem {
  label: string;
  status: StatusCheckpoint;
  observacao: string;
}

export interface ClinicaImagem {
  clinicaNome: string;
  indicadores: IndicadorImagem[];
  semIndicadores?: boolean;
}

export interface CheckpointImagemData {
  /** "19/10/2026" — já formatado pelo chamador. */
  data: string;
  clinicas: ClinicaImagem[];
}

const FONTE_ITEM = 19;

// ─── Marca de status, desenhada (Satori não renderiza emoji offline) ─────────
function Marca({ status }: { status: StatusCheckpoint }) {
  if (status === "ok") {
    return (
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 28, height: 28, borderRadius: 99, flexShrink: 0,
          background: "rgba(63,191,110,0.18)",
          borderWidth: 2, borderStyle: "solid", borderColor: C.verde,
        }}
      >
        {/* Check: duas barras giradas formando o "V" */}
        <div style={{ display: "flex", width: 14, height: 8, position: "relative" }}>
          <div style={{
            display: "flex", position: "absolute", left: 0, top: 3,
            width: 7, height: 3, borderRadius: 2, background: C.verde,
            transform: "rotate(45deg)",
          }} />
          <div style={{
            display: "flex", position: "absolute", left: 4, top: 1,
            width: 11, height: 3, borderRadius: 2, background: C.verde,
            transform: "rotate(-45deg)",
          }} />
        </div>
      </div>
    );
  }

  if (status === "atencao") {
    return (
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 28, height: 28, borderRadius: 99, flexShrink: 0,
          background: "rgba(230,167,0,0.20)",
          borderWidth: 2, borderStyle: "solid", borderColor: C.ambar,
          fontSize: 16, fontWeight: 800, color: C.ambar,
        }}
      >
        !
      </div>
    );
  }

  // Em branco: ainda não confirmado
  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 28, height: 28, borderRadius: 99, flexShrink: 0,
        background: "rgba(255,255,255,0.06)",
        borderWidth: 2, borderStyle: "solid", borderColor: "rgba(255,255,255,0.25)",
        fontSize: 16, fontWeight: 800, color: C.lavanda,
      }}
    >
      ?
    </div>
  );
}

function corDoStatus(status: StatusCheckpoint): string {
  if (status === "ok") return C.verde;
  if (status === "atencao") return C.ambar;
  return C.lavanda;
}

// ─── Pílula de contagem do cabeçalho ─────────────────────────────────────────
function Contador({ valor, label, cor }: { valor: number; label: string; cor: string }) {
  return (
    <div
      style={row({
        alignItems: "center",
        gap: 10,
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: C.cardBorda,
        background: C.card,
        borderRadius: 99,
        paddingTop: 8,
        paddingBottom: 8,
        paddingLeft: 16,
        paddingRight: 18,
      })}
    >
      <div style={{ display: "flex", fontSize: 22, fontWeight: 800, color: cor }}>{valor}</div>
      <div style={{ display: "flex", fontSize: 14, color: C.lavanda }}>{label}</div>
    </div>
  );
}

function normalizar(dados: CheckpointImagemData): {
  data: string;
  clinicas: ClinicaImagem[];
  ok: number; atencao: number; branco: number;
} {
  const clinicas = (dados?.clinicas ?? []).map((c) => ({
    clinicaNome: txt(c?.clinicaNome) || "Cliente",
    semIndicadores: c?.semIndicadores === true,
    indicadores: (c?.indicadores ?? [])
      .map((i) => ({
        label: txt(i?.label),
        status: (i?.status === "ok" || i?.status === "atencao" ? i.status : null) as StatusCheckpoint,
        observacao: txt(i?.observacao),
      }))
      .filter((i) => i.label !== ""),
  }));

  let ok = 0, atencao = 0, branco = 0;
  for (const c of clinicas) {
    if (c.semIndicadores) continue;
    for (const i of c.indicadores) {
      if (i.status === "ok") ok++;
      else if (i.status === "atencao") atencao++;
      else branco++;
    }
  }

  return { data: txt(dados?.data), clinicas, ok, atencao, branco };
}

export function temConteudo(dados: CheckpointImagemData): boolean {
  return normalizar(dados).clinicas.length > 0;
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function CheckpointOG({
  dados,
  logoSrc,
  largura = CHECKPOINT_LARGURA,
}: {
  dados: CheckpointImagemData;
  logoSrc?: string | null;
  largura?: number;
}) {
  const { data, clinicas, ok, atencao, branco } = normalizar(dados);

  return (
    <div style={fundoRaiz(largura)}>
      {/* ── Cabeçalho ── */}
      <div style={row({ alignItems: "center", gap: 18 })}>
        {logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoSrc} width={44} height={44} alt="Gestfy"
            style={{ objectFit: "contain", flexShrink: 0 }} />
        ) : null}

        <div style={col({ flex: 1, minWidth: 0, gap: 6 })}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 800, color: C.laranja, letterSpacing: 1 }}>
            CHECKPOINT DAS PLANILHAS
          </div>
          <div style={{ display: "flex", fontSize: 16, color: C.lavanda }}>
            {clinicas.length === 1
              ? "1 cliente conferido"
              : `${clinicas.length} clientes conferidos`}
            {data ? ` · ${data}` : ""}
          </div>
        </div>
      </div>

      <div style={DIVISOR_CABECALHO} />

      {/* ── Contadores ── */}
      <div style={row({ gap: 12 })}>
        <Contador valor={ok}      label="em dia"     cor={C.verde}   />
        <Contador valor={atencao} label="atenção"    cor={C.ambar}   />
        {branco > 0 && <Contador valor={branco} label="a confirmar" cor={C.lavanda} />}
      </div>

      {/* ── Clínicas ── */}
      <div style={col({ gap: 14, marginTop: 28 })}>
        {clinicas.map((clinica, i) => (
          <div
            key={i}
            style={col({
              background: C.card,
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: C.cardBorda,
              borderRadius: 14,
              paddingTop: 18,
              paddingBottom: 18,
              paddingLeft: 20,
              paddingRight: 20,
              gap: 14,
            })}
          >
            <div style={{ display: "flex", fontSize: 22, fontWeight: 800, color: C.branco }}>
              {clinica.clinicaNome}
            </div>

            {clinica.semIndicadores || clinica.indicadores.length === 0 ? (
              <div style={{ display: "flex", fontSize: FONTE_ITEM, color: C.lavanda }}>
                Sem indicadores ativos.
              </div>
            ) : (
              <div style={col({ gap: 10 })}>
                {clinica.indicadores.map((ind, j) => (
                  <div key={j} style={row({ gap: 14, alignItems: "flex-start" })}>
                    <Marca status={ind.status} />
                    <div style={col({ flex: 1, minWidth: 0, gap: 3 })}>
                      <div
                        style={{
                          display: "flex",
                          fontSize: FONTE_ITEM,
                          fontWeight: 600,
                          color: corDoStatus(ind.status),
                        }}
                      >
                        {ind.label}
                      </div>
                      {ind.observacao !== "" && (
                        <div
                          style={{
                            display: "flex",
                            fontSize: 16,
                            color: C.lavanda,
                            lineHeight: 1.45,
                          }}
                        >
                          {ind.observacao}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Rodapé ── */}
      <div style={DIVISOR_RODAPE} />
      <div style={row({ justifyContent: "space-between", alignItems: "center" })}>
        <div style={{ display: "flex", fontSize: 16, fontWeight: 800, color: C.branco, opacity: 0.35 }}>
          gestfy
        </div>
        <div style={{ display: "flex", fontSize: 14, color: C.lavanda, opacity: 0.85 }}>
          {data}
        </div>
      </div>
    </div>
  );
}
