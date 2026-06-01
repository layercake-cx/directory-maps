-- DRY-RUN: wrap in BEGIN; ... ROLLBACK; first
-- Integrity checklist: run `select count(*) from sync_logs;` before and after apply

create table if not exists sync_logs (
  id              uuid primary key default gen_random_uuid(),
  map_id          text not null references maps(id) on delete cascade,
  client_id       text not null references clients(id) on delete cascade,
  provider        text not null default 'google_sheets',
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  status          text not null default 'running',  -- 'running' | 'success' | 'warning' | 'error'
  error_code      text,
  error_message   text,
  error_detail    text,
  total_rows      int,
  inserted_count  int,
  updated_count   int,
  created_at      timestamptz not null default now()
);

create index sync_logs_map_id_idx     on sync_logs(map_id);
create index sync_logs_client_id_idx  on sync_logs(client_id);
create index sync_logs_started_at_idx on sync_logs(started_at desc);
create index sync_logs_status_idx     on sync_logs(status);

alter table sync_logs enable row level security;

-- Platform admins: full access (profiles pattern matches all other RLS in this codebase)
create policy "admin_all" on sync_logs for all
  using (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  );

-- Client members: read their own org logs
create policy "client_read" on sync_logs for select
  using (
    client_id in (
      select c.client_id from public.contacts c
      where c.user_id = auth.uid()
      and c.client_id is not null
    )
  );
