-- ============================================================
-- 010_metricas_fechamento.sql
-- Base padronizada de métricas: uma linha por indicador de cada fechamento
-- concluído. Serve aos comparativos e prepara o benchmarking entre clientes
-- (região, segmento, área de atuação e porte ficam no perfil do cliente,
-- em fechamento_config.ficha). Só números agregados, nenhum dado pessoal.
-- Não altera nenhuma tabela existente.
-- ============================================================

create table if not exists fechamento_metricas (
  fechamento_id uuid not null references fechamentos(id) on delete cascade,
  clinica_id    uuid not null references clinicas(id) on delete cascade,
  tipo          text not null check (tipo in ('mensal', 'quinzenal')),
  inicio        date not null,
  fim           date not null,
  versao        int  not null default 1,
  -- Indicador padrão ("faturamento", "ticket"…) ou personalizado ("pers:<fonte>:<indicador>").
  indicador     text not null,
  valor         numeric,
  -- Tipo comparável do catálogo Gestfy (contratos, recall…); vazio = só deste cliente.
  comparavel    text,
  formato       text,
  criado_em     timestamptz not null default now(),
  primary key (fechamento_id, indicador)
);

create index if not exists fechamento_metricas_indicador on fechamento_metricas (indicador, tipo, inicio);
create index if not exists fechamento_metricas_cliente on fechamento_metricas (clinica_id, tipo, inicio);

alter table fechamento_metricas enable row level security;

comment on table fechamento_metricas is 'Métricas padronizadas dos fechamentos concluídos (comparativos e benchmarking futuro).';
