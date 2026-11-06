-- ============================================================
-- 009_fontes_personalizadas.sql
-- Fontes de dados personalizadas por clínica (contratos, cirurgias, recall,
-- entradas bancárias…): planilha, aba, colunas indicadas, filtro, medidas e
-- quebras. Os números calculados vão no retrato congelado do fechamento.
-- ============================================================

alter table fechamento_config add column if not exists fontes_extras jsonb not null default '[]';
comment on column fechamento_config.fontes_extras is '[{ id, nome, sheetId, aba, linhaCabecalho, colunas, filtro, medidas, quebras, comparavel }]';
