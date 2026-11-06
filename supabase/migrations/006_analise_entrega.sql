-- ============================================================
-- 006_analise_entrega.sql
-- Análise, plano de ação e entrega do fechamento.
-- snapshot = retrato congelado ao concluir (só totais): números, alertas,
-- período anterior e resumo anual. Fechamento concluído não relê planilhas.
-- ============================================================

alter table fechamentos add column if not exists texto          jsonb not null default '{}';
alter table fechamentos add column if not exists acoes          jsonb not null default '[]';
alter table fechamentos add column if not exists acompanhamento jsonb not null default '[]';
alter table fechamentos add column if not exists snapshot       jsonb;
alter table fechamentos add column if not exists concluido_em   timestamptz;
alter table fechamentos add column if not exists enviado_em     timestamptz;

comment on column fechamentos.texto          is '{ contexto, observacao, destaques, comercial, atencao } — texto do fechamento, editado pelo consultor';
comment on column fechamentos.acoes          is 'Plano de ação: [{ id, titulo, descricao, responsaveis[], prazo, indicador }]';
comment on column fechamentos.acompanhamento is 'Andamento das ações do fechamento anterior: [{ id, titulo, responsaveis[], status, nota }]';

alter table fechamento_config add column if not exists equipe jsonb not null default '[]';
comment on column fechamento_config.equipe is 'Nomes usados como responsáveis nos planos de ação da clínica';
