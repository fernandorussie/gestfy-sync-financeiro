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
