-- ============================================================
-- 007_ficha_clinica.sql
-- Ficha da clínica: contexto do cliente para a análise com o Claude
-- (perfil, prioridades, pessoas, como escrever, o que evitar) e
-- atributos estruturados (cidade, UF, segmento, especialidades, modelo
-- de negócio) que também preparam o benchmarking futuro.
-- ============================================================

alter table fechamento_config add column if not exists ficha jsonb not null default '{}';
comment on column fechamento_config.ficha is '{ cidade, uf, segmento, especialidades, modelo, perfil, prioridades, pessoas, estilo, evitar, atualizadoEm }';
