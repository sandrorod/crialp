-- Segurança (Supabase): a Data API (PostgREST) expõe o schema public para os papéis anon/authenticated.
-- Estas três tabelas estavam sem RLS e com INSERT/UPDATE/DELETE liberados para a chave anon do projeto:
-- quem tivesse a chave podia ligar uma conta de cliente a qualquer página (lp_client_pages), mudar
-- níveis/preços (lp_client_levels) ou apagar o controle de migrations (o sistema cai na inicialização seguinte).
-- RLS ativa sem políticas = nada acessível pela Data API. O app conecta como dono das tabelas e não é
-- afetado (as demais tabelas do sistema já estão assim). Em Postgres sem Supabase (VPS) é inofensivo.
-- Reverter (não recomendado): alter table <tabela> disable row level security;
alter table if exists lp_client_levels enable row level security;
alter table if exists lp_client_pages enable row level security;
alter table if exists schema_migrations enable row level security;
