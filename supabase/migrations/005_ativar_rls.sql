-- ============================================================
-- 005_ativar_rls.sql
-- Liga a proteção por linha (RLS) em todas as tabelas, sem regras de acesso.
-- Efeito: a chave pública (anon) não lê nem altera nada.
-- O app não é afetado: ele acessa o banco só pelo servidor, com a
-- service_role, que ignora o RLS.
-- ============================================================

alter table clinicas               enable row level security;
alter table fontes_dados           enable row level security;
alter table tipos_meta             enable row level security;
alter table metas                  enable row level security;
alter table feriados               enable row level security;
alter table relatorios_gerados     enable row level security;
alter table checkpoint_indicadores enable row level security;
alter table fechamento_config      enable row level security;
alter table fechamentos            enable row level security;
