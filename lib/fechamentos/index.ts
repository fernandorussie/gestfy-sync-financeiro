/**
 * Módulo Fechamentos — ponto de entrada.
 *
 * Fluxo: coletar (planilhas → registros) → conferir (alertas) → decisões do
 * consultor viram Ajustes → calcularIndicadores (números do fechamento).
 * Documentação: docs/FECHAMENTOS.md.
 */
export * from "./texto";
export * from "./colunas";
export * from "./leitores";
export * from "./plano-contas";
export * from "./indicadores";
export * from "./conferencia";
export * from "./coleta";
