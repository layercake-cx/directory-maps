-- ============================================================
-- ROLLBACK: 20261005130000_integrations_providers_seed
-- Removes the 'integrations' flag (and any per-customer overrides) and the
-- OpenAI / Gemini catalogue rows. Refuses to run while a customer is
-- connected to openai/gemini or has configuration pointing at them:
-- disconnect those first (Integrations page) -- otherwise they would be left
-- with a connection to a provider the catalogue no longer knows.
-- ============================================================

do $$
begin
  if exists (select 1 from public.integrations where provider in ('openai', 'gemini')) then
    raise exception 'ABORT: customers are connected to openai/gemini -- disconnect them first';
  end if;
  if exists (select 1 from public.ai_model_configuration where provider in ('openai', 'gemini')) then
    raise exception 'ABORT: ai_model_configuration references openai/gemini -- remove those rows first';
  end if;
end $$;

delete from public.feature_flag_overrides where flag_key = 'integrations';
delete from public.feature_flags where key = 'integrations';
delete from public.ai_capability_profiles where provider in ('openai', 'gemini');
delete from public.ai_models where provider in ('openai', 'gemini');

do $$
begin
  if exists (select 1 from public.ai_models where provider in ('openai', 'gemini'))
     or exists (select 1 from public.feature_flags where key = 'integrations') then
    raise exception 'ROLLBACK FAILED';
  end if;
  raise notice 'ROLLBACK VERIFIED';
end $$;
