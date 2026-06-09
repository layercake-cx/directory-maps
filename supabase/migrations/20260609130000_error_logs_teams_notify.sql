-- Notify a Teams channel via Power Automate webhook whenever a row is inserted
-- into error_logs. Fires only for production environment rows. Webhook URL is
-- read from Supabase Vault so it never appears in code or git history.
--
-- BEFORE applying this migration, store the webhook URL in the Vault:
--   select vault.create_secret('<YOUR_TEAMS_WEBHOOK_URL>', 'teams_webhook_url');
-- Run that in Supabase Dashboard → SQL Editor (never commit the URL to git).
--
-- Requires: pg_net, supabase_vault (both available in Supabase projects by default)

-- ── Dry-run block ────────────────────────────────────────────────────────────
-- BEGIN;
-- <paste migration body here>
-- ROLLBACK;
-- ────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_net;

create or replace function public.error_logs_notify_teams()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_webhook_url text;
  v_source      text;
  v_map_id      text;
  v_message     text;
begin
  -- Skip local development noise; fire for staging and production
  if new.environment = 'development' then
    return new;
  end if;

  -- Read webhook URL from Vault; skip silently if not configured
  select decrypted_secret into v_webhook_url
  from vault.decrypted_secrets
  where name = 'teams_webhook_url'
  limit 1;

  if v_webhook_url is null or v_webhook_url = '' then
    return new;
  end if;

  -- Resolve human-readable source from context or type
  v_source  := coalesce(new.context->>'fn', new.context->>'source', new.type);
  v_map_id  := coalesce(new.context->>'map_id', '—');

  -- Format message body sent to Power Automate
  v_message := format(
    '[%s] %s' || chr(10) ||
    'Message: %s' || chr(10) ||
    'Source: %s' || chr(10) ||
    'Map: %s' || chr(10) ||
    'Route: %s' || chr(10) ||
    'Time: %s' || chr(10) ||
    'View log: https://maps.layercake-cx.biz/#/admin/error-log?id=' || new.id,
    upper(new.severity),
    new.type,
    new.message,
    v_source,
    v_map_id,
    coalesce(new.route, '—'),
    new.created_at
  );

  perform net.http_post(
    url     := v_webhook_url,
    body    := jsonb_build_object('text', v_message),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );

  return new;
exception when others then
  -- Never block the insert if notification fails
  return new;
end;
$$;

drop trigger if exists trg_error_logs_notify_teams on public.error_logs;
create trigger trg_error_logs_notify_teams
  after insert on public.error_logs
  for each row
  execute function public.error_logs_notify_teams();
