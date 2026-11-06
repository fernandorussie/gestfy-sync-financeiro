-- Etapa 3 do ambiente de testes: tabelas de fechamento + cadastro da Claros.
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em Run.

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

-- Cadastro da Claros Clinic no ambiente de testes: clínica, planilhas de origem e meta de outubro/2026.
-- As planilhas precisam estar compartilhadas (Leitor) com a conta de serviço do ambiente.

insert into clinicas (nome, slug, tag_curta, ativa)
values ('Claros Clinic', 'claros-clinic', 'CLAROS', true)
on conflict (slug) do nothing;

insert into fechamento_config (clinica_id, fontes)
select id, '{
  "vendas":     { "sheetId": "1QCDep_llfCaeXv5JQzkr_S4fV7z60UjiosHwGJf_Wyw", "aba": "Base", "colunas": { "unidade": "R" } },
  "despesas":   { "sheetId": "1Eb-yiuMsJm5wgOvYZI7yOq1f1-kgXYMogRuO-r3ch0g", "aba": "Base" },
  "orcamentos": { "sheetId": "12plo3IyBlyruQCph-WnM1efy5cVSkcmBbFufqC8GZZY", "aba": "Base" },
  "leads":      { "sheetId": "1xTzevTwvI2QflfTKsYxIbo2ps_v7q0EnGC0n-kFuTlY", "aba": "Sistema" },
  "nps":        { "sheetId": "1hpCKJRU7SjdSG6TBAoAWifFsDbe9LizXuQLILiSIi_I", "aba": "Base" }
}'::jsonb
from clinicas where slug = 'claros-clinic'
on conflict (clinica_id) do update set fontes = excluded.fontes, atualizado_em = now();

insert into metas (clinica_id, tipo_meta_id, mes, ano, valor_meta_mensal)
select c.id, t.id, 10, 2026, 188000
from clinicas c, tipos_meta t
where c.slug = 'claros-clinic' and t.nome = 'Faturamento'
on conflict (clinica_id, tipo_meta_id, mes, ano) do nothing;
