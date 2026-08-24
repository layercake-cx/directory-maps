-- ============================================================
-- Migration: 20260824120000_create_client_domains
-- Description: New table backing the "Bring Your Own Domain" epic —
--              lets a client point a domain or subdomain they own at one
--              of their maps. One domain maps to exactly one map; a client
--              may register as many domains as they like, and more than one
--              domain (e.g. bare + www) may point at the same map.
--
--              Verification lifecycle mirrors clients.email_domain_status
--              (Resend email domains, 20260517120000_client_resend_email.sql):
--              status starts 'pending', moves through 'verifying' once DNS
--              is checked, lands on 'active' once the hostname is verified
--              and TLS is issued, or 'failed'. dns_records holds the
--              required CNAME/TXT records as JSON for the client setup UI,
--              same shape as clients.email_dns_records. vercel_domain_id is
--              the id returned by Vercel's Domains API once the domain is
--              added to the project.
--
--              ga_measurement_id is per-domain (not per-map) because a
--              client may eventually want distinct GA properties per
--              domain even though today one domain = one map.
--
--              This migration is data model only — no routing, no Edge
--              Function, no admin/client UI. Those are later phases.
-- Affected tables: client_domains (new)
-- Rollback: _20260824120000_create_client_domains.rollback.sql
-- Author: Claude Code
-- Date: 2026-08-24
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- RUN ORDER: dry-run (BEGIN/ROLLBACK) -> apply on STAGING (beqejxneehilplrtpntn)
-- -> run POST-MIGRATION VERIFICATION -> only then apply on PRODUCTION
-- (gxixwdjfmegxcxfeflro) after explicit sign-off.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'clients'
  ) then
    raise exception 'ABORT: table public.clients does not exist';
  end if;
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'maps'
  ) then
    raise exception 'ABORT: table public.maps does not exist';
  end if;
  if not exists (
    select 1 from information_schema.routines
    where routine_schema = 'public' and routine_name = 'is_admin'
  ) then
    raise exception 'ABORT: function public.is_admin() does not exist';
  end if;
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'client_domains'
  ) then
    raise exception 'ABORT: table public.client_domains already exists — migration may have already run';
  end if;
end $$;

select 'clients' as tbl, count(*) as rows from public.clients union all
select 'maps',    count(*) from public.maps;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

create table public.client_domains (
  id                uuid primary key default gen_random_uuid(),
  client_id         text not null references public.clients(id) on delete cascade,
  map_id            text not null references public.maps(id) on delete cascade,
  hostname          text not null,
  status            text not null default 'pending',
  dns_records       jsonb null,
  vercel_domain_id  text null,
  ga_measurement_id text null,
  is_primary        boolean not null default false,
  verified_at       timestamptz null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index idx_client_domains_hostname on public.client_domains (lower(hostname));
create index idx_client_domains_client on public.client_domains(client_id);
create index idx_client_domains_map on public.client_domains(map_id);

alter table public.client_domains
  add constraint client_domains_status check (
    status in ('pending', 'verifying', 'active', 'failed')
  );

alter table public.client_domains
  add constraint client_domains_ga_measurement_id_format check (
    ga_measurement_id is null or ga_measurement_id ~ '^G-[A-Z0-9]+$'
  );

comment on table public.client_domains is
  'Client-configured custom domains/subdomains for publishing a directory. One domain maps to exactly one map (map_id not null); a client may register several domains, and more than one may point at the same map. status/dns_records/vercel_domain_id together drive the domain-verification UX, mirroring clients.email_domain_status for Resend.';
comment on column public.client_domains.hostname is 'Fully-qualified hostname the client has pointed at us, e.g. directory.acmecivic.org. Unique case-insensitively.';
comment on column public.client_domains.status is 'pending (just added) -> verifying (DNS check in flight) -> active (verified + TLS issued) or failed. Only active domains should be used for routing.';
comment on column public.client_domains.dns_records is 'Required CNAME/TXT records as JSON, for the client setup UI. Same shape as clients.email_dns_records.';
comment on column public.client_domains.vercel_domain_id is 'Domain id returned by the Vercel Domains API once added to the project.';
comment on column public.client_domains.ga_measurement_id is 'Optional Google Analytics measurement ID (G-XXXXXXXXXX) for traffic on this domain.';
comment on column public.client_domains.is_primary is 'Which domain wins for canonical URLs when a map has more than one active domain.';

alter table public.client_domains enable row level security;

-- Matches the existing clients/maps pattern: any authenticated user manages
-- domains through the app layer (client portal restricts to the caller's own
-- client_id; admin UI has no such restriction). Not a fine-grained tenant
-- boundary at the RLS layer, consistent with clients_authenticated_all /
-- maps_authenticated_all in 20260315100000_enable_rls_policies.sql.
create policy "client_domains_authenticated_all"
  on public.client_domains for all
  to authenticated
  using (true)
  with check (true);

-- Anon can read only verified/active domains — this is what the (future)
-- Vercel Edge Middleware hostname lookup runs as, with no user session,
-- same anon-only pattern as EmbedMap.jsx. DNS records and the GA
-- measurement ID are readable too (needed to render the page), but only
-- once a domain is live; pending/failed domains stay invisible to anon.
create policy "client_domains_anon_select_active"
  on public.client_domains for select
  to anon
  using (status = 'active');

grant select, insert, update, delete on table public.client_domains to authenticated, service_role;
grant select on table public.client_domains to anon;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'client_domains'
  ) then
    raise exception 'VERIFY FAILED: table client_domains was not created';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'idx_client_domains_hostname'
  ) then
    raise exception 'VERIFY FAILED: idx_client_domains_hostname was not created';
  end if;
  if (select count(*) from public.client_domains) <> 0 then
    raise exception 'VERIFY FAILED: client_domains should be empty immediately after creation';
  end if;
  raise notice 'VERIFY PASSED: client_domains table created empty with expected indexes/constraints';
end $$;

select 'clients' as tbl, count(*) as rows from public.clients union all
select 'maps',    count(*) from public.maps union all
select 'client_domains', count(*) from public.client_domains;


-- ------------------------------------------------------------
-- INTEGRITY CHECKLIST (run before and after on every environment)
-- ------------------------------------------------------------
/*
select 'clients'        as tbl, count(*) as rows from public.clients        union all
select 'maps',              count(*) from public.maps                      union all
select 'client_domains',    count(*) from public.client_domains
order by tbl;
*/
