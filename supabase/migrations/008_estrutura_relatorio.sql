-- ============================================================
-- 008_estrutura_relatorio.sql
-- Estrutura do relatório por clínica: seções ligadas, ordem e nível de
-- detalhe, separadas por tipo (mensal e quinzenal). Vazio = padrão Gestfy.
-- ============================================================

alter table fechamento_config add column if not exists relatorio jsonb not null default '{}';
comment on column fechamento_config.relatorio is '{ mensal: [{ id, ativa, nivel }], quinzenal: [...] } — ordem do array = ordem no relatório';
