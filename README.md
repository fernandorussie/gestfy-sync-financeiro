# Gestfy Sync — Report Semanal para Clínicas

Ferramenta interna para consolidar pesquisas (Pré-Consulta, NPS), avaliações Google e metas em relatórios semanais prontos para WhatsApp e infográficos em PNG.

---

## Visão geral

| Seção | O que faz |
|---|---|
| **Relatório / WhatsApp Pesquisas** | Lê Google Sheets (Pré-Consulta + NPS) + Places API e monta 3 blocos prontos para copiar no WhatsApp |
| **Relatório / WhatsApp Metas** | Lê metas do Supabase e gera comparativo realizado × meta |
| **Relatório / Imagem** | Gera infográfico 800×1600 px com Next.js ImageResponse (next/og) |
| **Dashboard** | Histórico dos últimos 20 relatórios gerados com visualização e cópia |
| **Clínicas** | CRUD de clínicas e configuração de fontes de dados (Sheets) |
| **Configurações** | Tipos de meta, feriados nacionais |

---

## Rodar localmente

### Pré-requisitos

- Node.js 20+
- Conta Supabase (free tier funciona)
- Service Account Google Cloud com acesso à Sheets API e (opcional) Places API

### 1. Clonar e instalar dependências

```bash
git clone <repo>
cd report-semanal-clinicas
npm install
```

### 2. Variáveis de ambiente

```bash
cp .env.example .env.local
# Edite .env.local com seus valores reais
```

Veja `.env.example` para descrição de cada variável.

### 3. Criar tabelas no Supabase

Execute o schema abaixo no SQL Editor do Supabase:

```sql
create table clinicas (
  id uuid primary key default gen_random_uuid(),
  nome text not null, slug text not null unique,
  tag_curta text, google_place_id text,
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table fontes_dados (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  tipo text not null check (tipo in ('pre_consulta','nps')),
  sheet_id text not null, aba_nome text not null,
  coluna_data text not null, mapeamento jsonb not null default '{}',
  ativo boolean not null default true
);

create table tipos_meta (
  id uuid primary key default gen_random_uuid(),
  nome text not null, unidade text not null,
  formato text not null check (formato in ('moeda_brl','numero_inteiro','numero_decimal','percentual')),
  ordem_exibicao integer not null default 0,
  created_at timestamptz not null default now()
);

create table metas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  tipo_meta_id uuid not null references tipos_meta(id) on delete cascade,
  mes integer not null check (mes between 1 and 12),
  ano integer not null,
  valor_meta_mensal numeric not null default 0,
  valor_realizado numeric not null default 0,
  valor_realizado_semana numeric not null default 0,
  data_referencia date
);

create table feriados (
  data date primary key, descricao text not null, uf text
);

create table relatorios_gerados (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  formato text not null check (formato in ('whatsapp_pesquisas','whatsapp_metas','imagem')),
  data_inicio date, data_fim date,
  conteudo_markdown text, dados_json jsonb,
  gerado_em timestamptz not null default now()
);
```

> **Nota de segurança**: o projeto usa `SUPABASE_SERVICE_ROLE_KEY` exclusivamente no servidor. RLS está desativado intencionalmente — a proteção é feita via cookie HMAC (`APP_PASSWORD`) no middleware.

### 4. Rodar

```bash
npm run dev
# Acesse http://localhost:3000
# Usuário: admin (ou APP_LOGIN) · Senha: valor de APP_PASSWORD no .env.local
```

---

## Configurar Service Account Google

1. [Google Cloud Console](https://console.cloud.google.com/) → crie ou selecione um projeto.
2. Ative: **Google Sheets API** e **Places API (New)**.
3. **IAM & Admin → Service Accounts** → crie uma conta → gere chave JSON.
4. Cole o JSON (em uma linha) na variável `GOOGLE_SERVICE_ACCOUNT_JSON`.
5. Para cada planilha: clique em **Compartilhar** e adicione o `client_email` da service account como **Leitor**.

### Places API Key (avaliações Google)

1. **APIs & Services → Credentials → Create Credentials → API Key**.
2. Restrinja para **Places API (New)** e por IP do servidor em produção.
3. Cole em `GOOGLE_PLACES_API_KEY`.

### Obter `google_place_id`

1. Abra Google Maps, procure a clínica.
2. Na URL, copie o ID após `place/` (começa com `ChIJ...`).
3. Ou use a [Place ID Finder](https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder).

---

## Deploy na Vercel

1. Importe o repositório.
2. **Settings → Environment Variables** → adicione todas as variáveis do `.env.example`.
   - `GOOGLE_SERVICE_ACCOUNT_JSON`: JSON completo em uma única linha.
3. Defina `APP_PASSWORD` com senha forte (≥ 20 caracteres aleatórios). Login: usuário `admin` (ou o valor de `APP_LOGIN`).
4. Acesso dos consultores (opcional): defina `CONSULTOR_PASSWORD` (e, se quiser, `CONSULTOR_LOGIN`, padrão `consultor`). Sem ela, o login de consultor fica desligado. Trocar a senha derruba as sessões abertas daquele perfil.

---

## Troubleshooting

| Problema | Causa provável | Solução |
|---|---|---|
| `Sem permissão. Compartilhe a planilha com: ...` | Service account sem acesso | Compartilhe a planilha com o `client_email` |
| `Aba "X" não encontrada` | Nome digitado errado | Verifique o nome exato (case-sensitive) |
| `GOOGLE_PLACES_API_KEY não configurado` | Variável ausente | Adicione ao `.env.local` |
| `Places API: timeout de 30s` | Place ID inválido ou API desativada | Verifique o Place ID e se Places API (New) está ativa |
| `ERR_EMPTY_RESPONSE` na imagem | Crash no Satori | Acesse `/api/relatorio-imagem/{id}` — retorna o stack trace em texto |
| Senha não funciona | `APP_PASSWORD` não definida | Defina no `.env.local` e reinicie |
