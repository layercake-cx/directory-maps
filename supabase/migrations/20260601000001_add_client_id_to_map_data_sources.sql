-- DRY-RUN: wrap in BEGIN; ... ROLLBACK; first
-- Integrity checklist: row count on map_data_sources must not change

alter table map_data_sources add column if not exists client_id text references clients(id);
update map_data_sources mds
  set client_id = m.client_id
  from maps m where m.id = mds.map_id;
alter table map_data_sources alter column client_id set not null;
create index if not exists idx_map_data_sources_client_id on map_data_sources(client_id);
