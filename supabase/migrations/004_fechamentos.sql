-- ============================================================
-- 004_fechamentos.sql
-- Módulo Fechamentos: mapa de planilhas por clínica e fechamentos.
-- Nenhuma linha de paciente é gravada: só configuração, decisões
-- da conferência e os totais calculados.
-- ============================================================

create table if not exists fechamento_config (
  clinica_id    uuid        primary key references clinicas (id) on delete cascade,
  fontes        jsonb       not null default '{}',
  regras        jsonb       not null default '{}',
  atualizado_em timestamptz not null default now()
);

comment on table  fechamento_config        is 'Mapa de planilhas de origem e regras de cada clínica para os fechamentos';
comment on column fechamento_config.fontes is 'Por fonte (vendas, despesas, orcamentos, leads, nps): { sheetId, aba, colunas?, linhaCabecalho? }';
comment on column fechamento_config.regras is 'Regras fixas da clínica: categoriasDespesa, gruposReceita, status de lead e de orçamento';

create table if not exists fechamentos (
  id            uuid        primary key default gen_random_uuid(),
  clinica_id    uuid        not null references clinicas (id) on delete cascade,
  tipo          text        not null check (tipo in ('mensal', 'quinzenal')),
  inicio        date        not null,
  fim           date        not null,
  status        text        not null default 'conferencia' check (status in ('conferencia', 'analise', 'concluido', 'enviado')),
  versao        int         not null default 1,
  meta_ajustada numeric,
  decisoes      jsonb       not null default '{"registro": []}',
  indicadores   jsonb,
  alertas       jsonb,
  calculado_em  timestamptz,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (clinica_id, tipo, inicio, fim, versao),
  check (fim >= inicio)
);

comment on table  fechamentos             is 'Fechamentos mensais e quinzenais. indicadores/alertas = último cálculo (só totais)';
comment on column fechamentos.decisoes    is '{ registro: [{ chave, acao, sugestao, em }] } — decisões da conferência; os ajustes são derivados daqui';

create index if not exists idx_fechamentos_clinica on fechamentos (clinica_id, inicio desc);
