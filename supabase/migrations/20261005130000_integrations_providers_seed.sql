-- ============================================================
-- Migration: 20261005130000_integrations_providers_seed
-- Description: Stage 2 of the platform Integrations framework.
--   - Registers the 'integrations' feature flag (gates the Integrations
--     area in the client portal rail; off for customers by default, on for
--     admins and @layercake-cx.biz users, grantable per customer).
--   - Adds OpenAI and Google Gemini to the platform model catalogue and
--     capability profiles so customers can connect those providers.
--   Model IDs and cost tiers are taken from each vendor's published model
--   list as of 2026-10-05. They are data, not code: correct or retire them
--   with a plain UPDATE on ai_models / ai_capability_profiles, no release.
--   Prices are deliberately left NULL (estimated cost is skipped until a
--   maintained pricing source exists).
-- Affected tables: feature_flags, ai_models, ai_capability_profiles (rows inserted)
-- Rollback: _20261005130000_integrations_providers_seed.rollback.sql
-- Author: Claude Code
-- Date: 2026-10-05
-- ============================================================
--
-- DRY-RUN BLOCK (run this first -- it makes NO persistent changes):
--
--   BEGIN;
--   <paste THE MIGRATION section below>
--   ROLLBACK;
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'ai_models') then
    raise exception 'ABORT: public.ai_models does not exist -- apply 20261005120000_integrations_ai_gateway first';
  end if;
  if exists (select 1 from public.feature_flags where key = 'integrations') then
    raise exception 'ABORT: feature flag integrations already exists -- migration may have already run';
  end if;
  if exists (select 1 from public.ai_models where provider in ('openai', 'gemini')) then
    raise exception 'ABORT: openai/gemini models already seeded -- migration may have already run';
  end if;
end $$;

select 'feature_flags' as tbl, count(*) as rows from public.feature_flags union all
select 'ai_models', count(*) from public.ai_models union all
select 'ai_capability_profiles', count(*) from public.ai_capability_profiles
order by tbl;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

insert into public.feature_flags (key, description, default_enabled, internal_enabled)
values (
  'integrations',
  'Platform Integrations area (AI provider connections). Off for customers; on for admins and @layercake-cx.biz users; grantable per-customer.',
  false,
  true
);

insert into public.ai_models (provider, model_id, label, cost_tier, capabilities, recommended_for, guidance)
values
  ('openai', 'gpt-6-luna', 'GPT-6 Luna', 1, '{tools,vision}', '{ECONOMY_MODEL,FAST_MODEL,STANDARD_MODEL}',
   'OpenAI''s most efficient model for focused, high-volume tasks. Well suited to metadata, classification, search interpretation and listing copy.'),
  ('openai', 'gpt-6.1-sol', 'GPT-6.1 Sol', 3, '{tools,vision}', '{STANDARD_MODEL,ADVANCED_MODEL}',
   'A stronger general model at a higher cost. Worth it for long-form or analytical work, rarely needed for metadata or classification.'),
  ('openai', 'gpt-6-astra', 'GPT-6 Astra', 4, '{tools,vision}', '{ADVANCED_MODEL}',
   'OpenAI''s flagship, highest cost. Unlikely to improve results for routine directory tasks.'),
  ('gemini', 'gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite', 1, '{tools,vision}', '{ECONOMY_MODEL,FAST_MODEL,STANDARD_MODEL}',
   'Google''s fastest, most cost-effective model. Well suited to metadata, classification, search interpretation and listing copy.'),
  ('gemini', 'gemini-3.8-flash', 'Gemini 3.8 Flash', 2, '{tools,vision}', '{STANDARD_MODEL,ADVANCED_MODEL}',
   'A balanced, more capable model. Useful for longer or more analytical tasks; usually more than metadata or classification needs.'),
  ('gemini', 'gemini-3.1-pro-preview', 'Gemini 3.1 Pro (preview)', 3, '{tools,vision}', '{ADVANCED_MODEL}',
   'Advanced reasoning, higher cost. Unlikely to improve results for routine directory tasks.');

insert into public.ai_capability_profiles (capability, provider, model_id, rationale)
values
  ('ECONOMY_MODEL',  'openai', 'gpt-6-luna', 'A fast, low-cost model is sufficient for this task. A premium reasoning model is unlikely to materially improve the result.'),
  ('FAST_MODEL',     'openai', 'gpt-6-luna', 'Low latency matters more than depth for interactive search interpretation.'),
  ('STANDARD_MODEL', 'openai', 'gpt-6-luna', 'Matches the Anthropic default for listing content. Move to a stronger model here if content quality needs it.'),
  ('ADVANCED_MODEL', 'openai', 'gpt-6.1-sol', 'Interpretation across several data sources may benefit from a more capable reasoning model.'),
  ('ECONOMY_MODEL',  'gemini', 'gemini-3.5-flash-lite', 'A fast, low-cost model is sufficient for this task. A premium reasoning model is unlikely to materially improve the result.'),
  ('FAST_MODEL',     'gemini', 'gemini-3.5-flash-lite', 'Low latency matters more than depth for interactive search interpretation.'),
  ('STANDARD_MODEL', 'gemini', 'gemini-3.5-flash-lite', 'Matches the Anthropic default for listing content. Move to a stronger model here if content quality needs it.'),
  ('ADVANCED_MODEL', 'gemini', 'gemini-3.8-flash', 'Interpretation across several data sources may benefit from a more capable reasoning model.');


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from public.feature_flags where key = 'integrations' and default_enabled = false) then
    raise exception 'VERIFY FAILED: integrations flag missing or on by default';
  end if;
  if (select count(*) from public.ai_models where provider in ('openai', 'gemini')) <> 6 then
    raise exception 'VERIFY FAILED: expected 6 openai/gemini models';
  end if;
  if (select count(*) from public.ai_capability_profiles) <> 12 then
    raise exception 'VERIFY FAILED: expected 12 capability profiles (4 x 3 providers)';
  end if;
  raise notice 'VERIFY PASSED';
end $$;

select 'feature_flags' as tbl, count(*) as rows from public.feature_flags union all
select 'ai_models', count(*) from public.ai_models union all
select 'ai_capability_profiles', count(*) from public.ai_capability_profiles
order by tbl;
-- feature_flags +1, ai_models +6, ai_capability_profiles +8 (4 -> 12)
