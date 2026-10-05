-- ============================================================
-- Migration: 20261005120000_integrations_ai_gateway
-- Description: Platform Integrations framework + AI Gateway schema.
--   Customers connect external services (AI providers first) once at
--   organisation level; the AI Gateway (supabase/functions/_shared/ai/)
--   resolves provider, model and credentials per request and meters usage.
--     - integrations              org-owned connection per provider
--     - integration_credentials   pointer to the Vault secret (never the key)
--     - ai_models                 platform-managed model catalogue
--     - ai_capability_profiles    capability -> recommended model per provider
--     - ai_model_configuration    org/product/instance/feature model choices
--     - ai_usage_events           one row per AI request (Layercake-attributable)
--     - Vault helper RPCs (service_role only)
--     - feature flag ai_platform_provider (ON for every existing client so
--       nothing changes; OFF by default for new clients = no silent fallback
--       to Layercake's own AI account)
-- Affected tables: integrations, integration_credentials, ai_models,
--   ai_capability_profiles, ai_model_configuration, ai_usage_events (all new);
--   feature_flags, feature_flag_overrides (rows inserted)
-- Rollback: _20261005120000_integrations_ai_gateway.rollback.sql
-- Author: Claude Code
-- Date: 2026-10-05
-- ============================================================
--
-- DRY-RUN BLOCK (run this first -- it makes NO persistent changes):
--
--   BEGIN;
--   <paste THE MIGRATION section below>
--   ROLLBACK;
--
-- If no error appears, the dry run passed. Then apply for real.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- Run these BEFORE applying. Stop if any assertion fails.
-- ------------------------------------------------------------

-- A) Dependencies exist, new objects do not
do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'clients') then
    raise exception 'ABORT: public.clients does not exist';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'feature_flags') then
    raise exception 'ABORT: public.feature_flags does not exist';
  end if;
  if not exists (select 1 from pg_namespace where nspname = 'vault') then
    raise exception 'ABORT: vault schema does not exist (supabase_vault extension not enabled)';
  end if;
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name in ('integrations', 'integration_credentials', 'ai_models', 'ai_capability_profiles', 'ai_model_configuration', 'ai_usage_events')
  ) then
    raise exception 'ABORT: one of the integrations/ai_* tables already exists -- migration may have already run';
  end if;
end $$;

-- B) Row counts -- inspect before proceeding
select
  'clients'                as tbl, count(*) as rows from public.clients               union all
  select 'directories',    count(*) from public.directories                            union all
  select 'directory_entries', count(*) from public.directory_entries                   union all
  select 'feature_flags',  count(*) from public.feature_flags                          union all
  select 'feature_flag_overrides', count(*) from public.feature_flag_overrides
order by tbl;
-- Save this output. Only feature_flags (+1) and feature_flag_overrides (+ one row per client) may change.


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- 1) integrations -- one connected external service per organisation ---------
create table public.integrations (
  id               uuid primary key default gen_random_uuid(),
  client_id        text not null references public.clients(id) on delete cascade,
  integration_type text not null default 'ai',
  provider         text not null,
  status           text not null default 'connected',
  last_tested_at   timestamptz null,
  last_error       text null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint integrations_type_check check (integration_type in ('ai')),
  constraint integrations_status_check check (status in ('not_connected', 'connected', 'error')),
  constraint integrations_client_provider_unique unique (client_id, provider)
);

create index idx_integrations_client on public.integrations (client_id);

comment on table public.integrations is
  'An external service connected by an organisation (AI providers first). Belongs to the organisation, not to a product -- products decide how to use it via ai_model_configuration. Written only by the manage_client_integrations Edge Function (service role).';
comment on column public.integrations.status is 'not_connected | connected | error. error = the last connection test failed (see last_error).';
comment on column public.integrations.last_error is 'Short provider error text from the last failed test. Never contains credentials.';


-- 2) integration_credentials -- pointer to the Vault secret ------------------
create table public.integration_credentials (
  id               uuid primary key default gen_random_uuid(),
  integration_id   uuid not null unique references public.integrations(id) on delete cascade,
  vault_secret_id  uuid not null,
  key_hint         text null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.integration_credentials is
  'Reference to the Supabase Vault secret holding an integration''s API key. The key itself is never stored in this table. No client (anon/authenticated) access of any kind -- service role only.';
comment on column public.integration_credentials.key_hint is 'Last 4 characters of the key, for display ("...abcd") so an admin can tell keys apart. Never the full key.';


-- 3) ai_models -- platform-managed model catalogue ---------------------------
create table public.ai_models (
  id                    uuid primary key default gen_random_uuid(),
  provider              text not null,
  model_id              text not null,
  label                 text not null,
  cost_tier             smallint not null,
  capabilities          text[] not null default '{}',
  recommended_for       text[] not null default '{}',
  status                text not null default 'active',
  guidance              text null,
  price_input_per_mtok  numeric null,
  price_output_per_mtok numeric null,
  currency              text null,
  pricing_updated_at    timestamptz null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint ai_models_provider_model_unique unique (provider, model_id),
  constraint ai_models_cost_tier_check check (cost_tier between 1 and 4),
  constraint ai_models_status_check check (status in ('active', 'deprecated', 'disabled'))
);

comment on table public.ai_models is
  'Platform-managed catalogue of supported AI models. Editable without a release. cost_tier 1-4 maps to GBP / GBP GBP / GBP GBP GBP / GBP GBP GBP GBP in the UI. Prices are optional and only set when a reliable, maintained source exists -- estimated cost is skipped when they are null.';
comment on column public.ai_models.capabilities is 'Technical abilities of the model: tools, vision, web_search.';
comment on column public.ai_models.recommended_for is 'Capability profiles this model is a sensible choice for (ECONOMY_MODEL, FAST_MODEL, STANDARD_MODEL, ADVANCED_MODEL).';
comment on column public.ai_models.status is 'active | deprecated (still usable, flagged in UI) | disabled (temporarily unusable; the gateway refuses it).';


-- 4) ai_capability_profiles -- capability -> recommended model --------------
create table public.ai_capability_profiles (
  id         uuid primary key default gen_random_uuid(),
  capability text not null,
  provider   text not null,
  model_id   text not null,
  rationale  text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_capability_profiles_capability_check
    check (capability in ('ECONOMY_MODEL', 'FAST_MODEL', 'STANDARD_MODEL', 'ADVANCED_MODEL')),
  constraint ai_capability_profiles_unique unique (capability, provider),
  constraint ai_capability_profiles_model_fk
    foreign key (provider, model_id) references public.ai_models (provider, model_id)
);

comment on table public.ai_capability_profiles is
  'Which model Layercake recommends for each capability on each provider. Products request a capability, never a model name; the gateway resolves it here unless the organisation has chosen a model explicitly.';


-- 5) ai_model_configuration -- org / product / instance / feature choices -----
create table public.ai_model_configuration (
  id                  uuid primary key default gen_random_uuid(),
  client_id           text not null references public.clients(id) on delete cascade,
  product             text null,
  product_instance_id text null,
  feature             text null,
  capability          text null,
  integration_id      uuid null references public.integrations(id) on delete set null,
  provider            text null,
  model               text null,
  use_recommended     boolean not null default true,
  configuration       jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint ai_model_configuration_capability_check
    check (capability is null or capability in ('ECONOMY_MODEL', 'FAST_MODEL', 'STANDARD_MODEL', 'ADVANCED_MODEL')),
  constraint ai_model_configuration_scope_check
    check (product is not null or (product_instance_id is null and feature is null)),
  constraint ai_model_configuration_instance_check
    check (product_instance_id is null or product is not null),
  constraint ai_model_configuration_manual_check
    check (use_recommended or (provider is not null and model is not null))
);

-- One row per scope. NULL scopes are coalesced so (client, NULL, NULL, NULL) is also unique.
create unique index idx_ai_model_configuration_scope
  on public.ai_model_configuration (
    client_id,
    coalesce(product, ''),
    coalesce(product_instance_id, ''),
    coalesce(feature, '')
  );
create index idx_ai_model_configuration_client on public.ai_model_configuration (client_id);

comment on table public.ai_model_configuration is
  'Model/provider choices with inheritance. Most specific match wins: (product, instance, feature) > (product, instance) > (product, feature) > product > organisation default (product NULL). use_recommended = follow ai_capability_profiles for the provider; otherwise provider + model are explicit. V1 UI exposes product-level feature rows only; the schema and resolver already honour instance and organisation levels.';

-- A configuration may only point at an integration of the same client.
create or replace function public.enforce_ai_model_configuration_same_client()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.integration_id is not null and not exists (
    select 1 from public.integrations i where i.id = new.integration_id and i.client_id = new.client_id
  ) then
    raise exception 'ai_model_configuration.integration_id must belong to the same client';
  end if;
  return new;
end;
$$;

create trigger trg_ai_model_configuration_same_client
  before insert or update on public.ai_model_configuration
  for each row execute function public.enforce_ai_model_configuration_same_client();


-- 6) ai_usage_events -- one row per AI request -------------------------------
create table public.ai_usage_events (
  id                      uuid primary key default gen_random_uuid(),
  client_id               text not null references public.clients(id) on delete cascade,
  product                 text not null,
  product_instance_id     text null,
  feature                 text not null,
  provider                text not null,
  model                   text not null,
  connection_source       text not null,
  input_tokens            integer not null default 0,
  output_tokens           integer not null default 0,
  cached_input_tokens     integer not null default 0,
  total_tokens            integer not null default 0,
  estimated_cost          numeric null,
  estimated_cost_currency text null,
  duration_ms             integer null,
  status                  text not null,
  error                   text null,
  batch_job_id            uuid null,
  created_at              timestamptz not null default now(),
  constraint ai_usage_events_source_check check (connection_source in ('customer', 'platform')),
  constraint ai_usage_events_status_check check (status in ('success', 'error'))
);

create index idx_ai_usage_events_client_created on public.ai_usage_events (client_id, created_at desc);
create index idx_ai_usage_events_client_feature on public.ai_usage_events (client_id, product, feature);
create index idx_ai_usage_events_instance on public.ai_usage_events (product_instance_id, created_at desc) where product_instance_id is not null;
create index idx_ai_usage_events_batch on public.ai_usage_events (batch_job_id) where batch_job_id is not null;

comment on table public.ai_usage_events is
  'One row per request through the AI Gateway (success or failure). Layercake-attributable consumption only -- not total provider-account usage. estimated_cost is informational (published pricing, may be NULL); the provider account is the authoritative source for billing. Insert by service role only.';
comment on column public.ai_usage_events.connection_source is 'customer = the organisation''s own connected provider; platform = Layercake''s own AI account (only while the ai_platform_provider flag is on for the client).';
comment on column public.ai_usage_events.product_instance_id is 'For Directory Maps, the directory id.';
comment on column public.ai_usage_events.batch_job_id is 'entry_content_jobs.id / entry_seo_metadata_jobs.id when the request came from a queue worker.';


-- 7) Row level security + grants ---------------------------------------------
-- New tables get broad default privileges in Supabase; revoke first, then grant
-- only what each table needs.
revoke all on table
  public.integrations, public.integration_credentials, public.ai_models,
  public.ai_capability_profiles, public.ai_model_configuration, public.ai_usage_events
  from anon, authenticated;

alter table public.integrations             enable row level security;
alter table public.integration_credentials  enable row level security;
alter table public.ai_models                enable row level security;
alter table public.ai_capability_profiles   enable row level security;
alter table public.ai_model_configuration   enable row level security;
alter table public.ai_usage_events          enable row level security;

-- integrations: members of the org may read; all writes go through the Edge Function.
create policy "integrations_admin_all"
  on public.integrations for all to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));
create policy "integrations_own_client_select"
  on public.integrations for select to authenticated
  using (client_id = public.current_user_client_id());
grant select on table public.integrations to authenticated;
grant select, insert, update, delete on table public.integrations to service_role;

-- integration_credentials: RLS on, NO policies, NO client grants -> service role only.
grant select, insert, update, delete on table public.integration_credentials to service_role;

-- ai_models / ai_capability_profiles: readable catalogue; admin-managed.
create policy "ai_models_read" on public.ai_models for select to authenticated using (true);
create policy "ai_models_admin_write"
  on public.ai_models for all to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));
grant select, insert, update, delete on table public.ai_models to authenticated, service_role;

create policy "ai_capability_profiles_read" on public.ai_capability_profiles for select to authenticated using (true);
create policy "ai_capability_profiles_admin_write"
  on public.ai_capability_profiles for all to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));
grant select, insert, update, delete on table public.ai_capability_profiles to authenticated, service_role;

-- ai_model_configuration: own-org read/write (same convention as messaging_profiles).
create policy "ai_model_configuration_admin_all"
  on public.ai_model_configuration for all to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));
create policy "ai_model_configuration_own_client"
  on public.ai_model_configuration for all to authenticated
  using (client_id = public.current_user_client_id())
  with check (client_id = public.current_user_client_id());
grant select, insert, update, delete on table public.ai_model_configuration to authenticated, service_role;

-- ai_usage_events: read-only for admins and the owning org; inserts are service role only.
create policy "ai_usage_events_admin_select"
  on public.ai_usage_events for select to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));
create policy "ai_usage_events_own_client_select"
  on public.ai_usage_events for select to authenticated
  using (client_id = public.current_user_client_id());
grant select on table public.ai_usage_events to authenticated;
grant select, insert, update, delete on table public.ai_usage_events to service_role;


-- 8) Vault helpers -- service_role only --------------------------------------
-- The key goes into Vault; integration_credentials keeps only the secret id and a hint.
create or replace function public.store_integration_secret(
  p_integration_id uuid,
  p_secret         text,
  p_hint           text
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_existing uuid;
  v_secret_id uuid;
begin
  if p_secret is null or length(btrim(p_secret)) = 0 then
    raise exception 'secret must not be blank';
  end if;

  select vault_secret_id into v_existing
  from public.integration_credentials where integration_id = p_integration_id;

  if v_existing is not null then
    perform vault.update_secret(v_existing, p_secret);
    update public.integration_credentials
       set key_hint = p_hint, updated_at = now()
     where integration_id = p_integration_id;
  else
    v_secret_id := vault.create_secret(
      p_secret,
      'integration_' || p_integration_id::text,
      'Customer API key for integration ' || p_integration_id::text
    );
    insert into public.integration_credentials (integration_id, vault_secret_id, key_hint)
    values (p_integration_id, v_secret_id, p_hint);
  end if;
end;
$$;

create or replace function public.read_integration_secret(p_integration_id uuid)
returns text
language sql
security definer
stable
set search_path = public, vault
as $$
  select s.decrypted_secret
  from public.integration_credentials c
  join vault.decrypted_secrets s on s.id = c.vault_secret_id
  where c.integration_id = p_integration_id;
$$;

create or replace function public.delete_integration_secret(p_integration_id uuid)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
begin
  select vault_secret_id into v_secret_id
  from public.integration_credentials where integration_id = p_integration_id;
  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;
  delete from public.integration_credentials where integration_id = p_integration_id;
end;
$$;

revoke all on function public.store_integration_secret(uuid, text, text) from public, anon, authenticated;
revoke all on function public.read_integration_secret(uuid)              from public, anon, authenticated;
revoke all on function public.delete_integration_secret(uuid)            from public, anon, authenticated;
grant execute on function public.store_integration_secret(uuid, text, text) to service_role;
grant execute on function public.read_integration_secret(uuid)              to service_role;
grant execute on function public.delete_integration_secret(uuid)            to service_role;


-- 9) Platform fallback flag --------------------------------------------------
-- ai_platform_provider = this organisation may use Layercake's own AI account.
-- Existing clients keep working (override ON); new clients default OFF so a
-- customer product never silently consumes Layercake AI resources.
insert into public.feature_flags (key, description, default_enabled, internal_enabled)
values (
  'ai_platform_provider',
  'Allow this organisation''s AI features to use Layercake''s own AI provider account when it has not connected its own. Off by default; on for clients that predate customer-managed AI. Resolved server-side by the AI Gateway.',
  false,
  false
);

insert into public.feature_flag_overrides (flag_key, client_id, enabled)
select 'ai_platform_provider', c.id, true
from public.clients c;


-- 10) Seed the Anthropic catalogue + recommendations -------------------------
-- Prices deliberately left NULL: set pricing_updated_at + price columns only
-- from a maintained source. OpenAI / Gemini models arrive with their adapters.
insert into public.ai_models (provider, model_id, label, cost_tier, capabilities, recommended_for, guidance)
values
  ('anthropic', 'claude-haiku-4-5', 'Claude Haiku 4.5', 1, '{tools,vision,web_search}', '{ECONOMY_MODEL,FAST_MODEL,STANDARD_MODEL}',
   'Fast and low cost. Well suited to metadata, classification, search interpretation and listing copy.'),
  ('anthropic', 'claude-sonnet-5-5', 'Claude Sonnet 5.5', 3, '{tools,vision,web_search}', '{STANDARD_MODEL,ADVANCED_MODEL}',
   'Stronger writing and reasoning at a higher cost. Worth it for long-form or analytical work, rarely needed for metadata or classification.'),
  ('anthropic', 'claude-opus-5-5', 'Claude Opus 5.5', 4, '{tools,vision,web_search}', '{ADVANCED_MODEL}',
   'Most capable, highest cost. Unlikely to improve results for routine directory tasks.');

insert into public.ai_capability_profiles (capability, provider, model_id, rationale)
values
  ('ECONOMY_MODEL',  'anthropic', 'claude-haiku-4-5',  'A fast, low-cost model is sufficient for this task. A premium reasoning model is unlikely to materially improve the result.'),
  ('FAST_MODEL',     'anthropic', 'claude-haiku-4-5',  'Low latency matters more than depth for interactive search interpretation.'),
  ('STANDARD_MODEL', 'anthropic', 'claude-haiku-4-5',  'Current Layercake default for listing content. Move to a stronger model here if content quality needs it.'),
  ('ADVANCED_MODEL', 'anthropic', 'claude-sonnet-5-5', 'Interpretation across several data sources may benefit from a more capable reasoning model.');


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- Run immediately after applying. All assertions must pass.
-- ------------------------------------------------------------

do $$
declare
  v_clients int;
  v_overrides int;
begin
  if (select count(*) from information_schema.tables
      where table_schema = 'public'
        and table_name in ('integrations', 'integration_credentials', 'ai_models', 'ai_capability_profiles', 'ai_model_configuration', 'ai_usage_events')) <> 6 then
    raise exception 'VERIFY FAILED: expected 6 new tables';
  end if;

  select count(*) into v_clients from public.clients;
  select count(*) into v_overrides from public.feature_flag_overrides where flag_key = 'ai_platform_provider' and enabled;
  if v_overrides <> v_clients then
    raise exception 'VERIFY FAILED: ai_platform_provider override rows (%) <> clients (%)', v_overrides, v_clients;
  end if;

  if (select count(*) from public.ai_capability_profiles) <> 4 then
    raise exception 'VERIFY FAILED: expected 4 capability profiles';
  end if;

  -- Credentials must be unreachable for client roles.
  if has_table_privilege('authenticated', 'public.integration_credentials', 'select')
     or has_table_privilege('anon', 'public.integration_credentials', 'select') then
    raise exception 'VERIFY FAILED: integration_credentials is readable by a client role';
  end if;
  if has_function_privilege('authenticated', 'public.read_integration_secret(uuid)', 'execute')
     or has_function_privilege('anon', 'public.read_integration_secret(uuid)', 'execute') then
    raise exception 'VERIFY FAILED: read_integration_secret is executable by a client role';
  end if;

  raise notice 'VERIFY PASSED';
end $$;

-- Row counts -- compare to pre-migration output.
select
  'clients'                as tbl, count(*) as rows from public.clients               union all
  select 'directories',    count(*) from public.directories                            union all
  select 'directory_entries', count(*) from public.directory_entries                   union all
  select 'feature_flags',  count(*) from public.feature_flags                          union all
  select 'feature_flag_overrides', count(*) from public.feature_flag_overrides
order by tbl;
-- clients/directories/directory_entries unchanged; feature_flags +1; feature_flag_overrides + clients.

-- RLS enabled on every new table
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('integrations', 'integration_credentials', 'ai_models', 'ai_capability_profiles', 'ai_model_configuration', 'ai_usage_events')
order by tablename;
-- All rows must show rowsecurity = true

-- Orphan check
select count(*) as orphaned_integrations from public.integrations i where not exists (select 1 from public.clients c where c.id = i.client_id);
-- Must return 0
