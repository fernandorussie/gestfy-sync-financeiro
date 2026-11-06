-- ============================================================
-- 003_alinhar_schema.sql
-- Alinha os arquivos de migração com o banco que o código usa.
-- O código já trabalha com fontes de leads, faturamento e despesa
-- e com o campo "comportamento" dos tipos de meta, mas 001 e 002
-- não criavam isso. Sem este arquivo, um banco novo recusa essas fontes.
-- ============================================================

alter table fontes_dados drop constraint if exists fontes_dados_tipo_check;
alter table fontes_dados add constraint fontes_dados_tipo_check
  check (tipo in ('pre_consulta', 'nps', 'leads', 'faturamento', 'despesa'));

alter table tipos_meta add column if not exists comportamento text not null default 'acumulativa';
alter table tipos_meta drop constraint if exists tipos_meta_comportamento_check;
alter table tipos_meta add constraint tipos_meta_comportamento_check
  check (comportamento in ('acumulativa', 'media'));

comment on column tipos_meta.comportamento is 'acumulativa = soma ao longo do mês (faturamento); media = média do período (nota NPS)';
