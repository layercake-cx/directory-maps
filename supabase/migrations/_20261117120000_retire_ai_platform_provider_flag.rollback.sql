-- Rollback for 20261117120000_retire_ai_platform_provider_flag
-- Restores the flag row and an ON override for every current client, as the original
-- 20261005120000 migration created them. Note: this restores the ROWS only. The gateway
-- no longer reads the flag, so restoring the fallback behaviour also needs the code
-- change reverted (PR "remove the Layercake AI account fallback") and ANTHROPIC_API_KEY re-set.
-- Clients created since 2026-10-05 get an override too; delete those by hand if unwanted.

insert into public.feature_flags (key, description, default_enabled, internal_enabled)
values (
  'ai_platform_provider',
  'Allow this organisation''s AI features to use Layercake''s own AI provider account when it has not connected its own. Off by default; on for clients that predate customer-managed AI. Resolved server-side by the AI Gateway.',
  false,
  false
)
on conflict (key) do nothing;

insert into public.feature_flag_overrides (flag_key, client_id, enabled)
select 'ai_platform_provider', c.id, true
from public.clients c
on conflict (flag_key, client_id) do nothing;
