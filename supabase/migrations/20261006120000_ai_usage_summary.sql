-- ============================================================
-- Migration: 20261006120000_ai_usage_summary
-- Description: Phase 5 of the Integrations / AI Gateway work -- the AI usage
--   dashboard's data. One read-only function that aggregates an organisation's
--   ai_usage_events for a period: totals, and breakdowns by product/feature,
--   directory, provider/model/connection and day. Aggregated in the database so
--   it is correct for large histories (PostgREST caps plain selects at 1,000 rows).
--   SECURITY INVOKER: ai_usage_events' own RLS applies (admins and the owning
--   organisation's members only), so this exposes nothing a direct select would not.
--   Layercake-attributable consumption only -- not total provider-account usage.
--   estimated_cost sums are informational and only cover requests whose model had
--   known prices when they ran; the caller is told how many were costed.
-- Affected tables: none (function only)
-- Rollback: _20261006120000_ai_usage_summary.rollback.sql
-- Author: Claude Code
-- Date: 2026-10-06
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
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'ai_usage_events') then
    raise exception 'ABORT: ai_usage_events does not exist -- apply 20261005120000_integrations_ai_gateway first';
  end if;
  if exists (select 1 from pg_proc where proname = 'get_ai_usage_summary') then
    raise exception 'ABORT: get_ai_usage_summary already exists -- migration may have already run';
  end if;
end $$;

select 'ai_usage_events' as tbl, count(*) as rows from public.ai_usage_events;
-- Must be UNCHANGED after (function only).


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

create or replace function public.get_ai_usage_summary(
  p_client_id    text,
  p_since        timestamptz,
  p_until        timestamptz default now(),
  p_directory_id text        default null,
  p_provider     text        default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select e.*, d.name as instance_name
    from public.ai_usage_events e
    left join public.directories d
      on e.product = 'directory_maps' and d.id = e.product_instance_id
    where e.client_id = p_client_id
      and e.created_at >= p_since
      and e.created_at <  p_until
      and (p_directory_id is null or e.product_instance_id = p_directory_id)
      and (p_provider is null or e.provider = p_provider)
  )
  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'requests',            count(*),
        'failed',              count(*) filter (where status = 'error'),
        'input_tokens',        coalesce(sum(input_tokens + cached_input_tokens), 0),
        'cached_input_tokens', coalesce(sum(cached_input_tokens), 0),
        'output_tokens',       coalesce(sum(output_tokens), 0),
        'total_tokens',        coalesce(sum(total_tokens), 0),
        'requests_costed',     count(estimated_cost),
        -- Never add amounts in different currencies together.
        'estimated_cost',      case when count(distinct estimated_cost_currency) <= 1 then sum(estimated_cost) else null end,
        'currency',            case when count(distinct estimated_cost_currency) <= 1 then max(estimated_cost_currency) else null end,
        'platform_requests',   count(*) filter (where connection_source = 'platform'),
        'customer_requests',   count(*) filter (where connection_source = 'customer')
      ) from base
    ),
    'by_feature', (
      select coalesce(jsonb_agg(r order by r.total_tokens desc, r.requests desc), '[]'::jsonb)
      from (
        select product, feature,
               count(*) as requests,
               count(*) filter (where status = 'error') as failed,
               coalesce(sum(input_tokens + cached_input_tokens), 0) as input_tokens,
               coalesce(sum(output_tokens), 0) as output_tokens,
               coalesce(sum(total_tokens), 0) as total_tokens,
               count(estimated_cost) as requests_costed,
               case when count(distinct estimated_cost_currency) <= 1 then sum(estimated_cost) else null end as estimated_cost,
               case when count(distinct estimated_cost_currency) <= 1 then max(estimated_cost_currency) else null end as currency
        from base group by product, feature
      ) r
    ),
    'by_directory', (
      select coalesce(jsonb_agg(r order by r.total_tokens desc, r.requests desc), '[]'::jsonb)
      from (
        select product, product_instance_id as instance_id, max(instance_name) as instance_name,
               count(*) as requests,
               coalesce(sum(input_tokens + cached_input_tokens), 0) as input_tokens,
               coalesce(sum(output_tokens), 0) as output_tokens,
               coalesce(sum(total_tokens), 0) as total_tokens,
               count(estimated_cost) as requests_costed,
               case when count(distinct estimated_cost_currency) <= 1 then sum(estimated_cost) else null end as estimated_cost,
               case when count(distinct estimated_cost_currency) <= 1 then max(estimated_cost_currency) else null end as currency
        from base group by product, product_instance_id
      ) r
    ),
    'by_model', (
      select coalesce(jsonb_agg(r order by r.total_tokens desc, r.requests desc), '[]'::jsonb)
      from (
        select provider, model, connection_source,
               count(*) as requests,
               coalesce(sum(input_tokens + cached_input_tokens), 0) as input_tokens,
               coalesce(sum(output_tokens), 0) as output_tokens,
               coalesce(sum(total_tokens), 0) as total_tokens,
               count(estimated_cost) as requests_costed,
               case when count(distinct estimated_cost_currency) <= 1 then sum(estimated_cost) else null end as estimated_cost,
               case when count(distinct estimated_cost_currency) <= 1 then max(estimated_cost_currency) else null end as currency
        from base group by provider, model, connection_source
      ) r
    ),
    'by_day', (
      select coalesce(jsonb_agg(r order by r.day), '[]'::jsonb)
      from (
        select (created_at at time zone 'UTC')::date as day,
               count(*) as requests,
               coalesce(sum(total_tokens), 0) as total_tokens
        from base group by 1
      ) r
    )
  );
$$;

revoke all on function public.get_ai_usage_summary(text, timestamptz, timestamptz, text, text) from public, anon;
grant execute on function public.get_ai_usage_summary(text, timestamptz, timestamptz, text, text) to authenticated, service_role;

comment on function public.get_ai_usage_summary(text, timestamptz, timestamptz, text, text) is
  'Aggregates an organisation''s ai_usage_events for [p_since, p_until): totals plus breakdowns by feature, directory, provider/model/connection and UTC day, optionally filtered to one directory and/or provider. SECURITY INVOKER, so ai_usage_events RLS applies. Layercake-attributable usage only; estimated cost covers only requests whose model had known prices.';


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'get_ai_usage_summary') then
    raise exception 'VERIFY FAILED: get_ai_usage_summary was not created';
  end if;
  if has_function_privilege('anon', 'public.get_ai_usage_summary(text, timestamptz, timestamptz, text, text)', 'execute') then
    raise exception 'VERIFY FAILED: get_ai_usage_summary executable by anon';
  end if;
  raise notice 'VERIFY PASSED';
end $$;

select 'ai_usage_events' as tbl, count(*) as rows from public.ai_usage_events;
-- Must match the pre-migration count.
