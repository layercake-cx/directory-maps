-- ============================================================
-- ROLLBACK: 20261005120000_integrations_ai_gateway
-- Reverses: Platform Integrations framework + AI Gateway schema.
-- WARNING: drops ai_usage_events (all recorded AI usage) and any
--   customer integrations / credentials created since the migration.
--   Take a backup first if either table holds data you want to keep:
--     select * from public.ai_usage_events;
--     select id, client_id, provider, status from public.integrations;
-- Deploy order: roll back the Edge Functions that call the AI Gateway
--   (restore the previous commit's functions) BEFORE running this, or
--   they will fail when the tables disappear.
-- ============================================================

-- Delete any Vault secrets created for integrations (no-op if none).
do $$
begin
  delete from vault.secrets where name like 'integration\_%' escape '\';
end $$;

delete from public.feature_flag_overrides where flag_key = 'ai_platform_provider';
delete from public.feature_flags where key = 'ai_platform_provider';

drop function if exists public.store_integration_secret(uuid, text, text);
drop function if exists public.read_integration_secret(uuid);
drop function if exists public.delete_integration_secret(uuid);

drop table if exists public.ai_usage_events;
drop table if exists public.ai_model_configuration;
drop function if exists public.enforce_ai_model_configuration_same_client();
drop table if exists public.ai_capability_profiles;
drop table if exists public.ai_models;
drop table if exists public.integration_credentials;
drop table if exists public.integrations;

-- Verify
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name in ('integrations', 'integration_credentials', 'ai_models', 'ai_capability_profiles', 'ai_model_configuration', 'ai_usage_events')
  ) then
    raise exception 'ROLLBACK FAILED: tables still present';
  end if;
  raise notice 'ROLLBACK VERIFIED';
end $$;
