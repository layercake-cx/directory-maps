-- DRY-RUN: wrap in BEGIN; ... ROLLBACK; first
-- Integrity checklist: run `select count(*), sum(deleted_count) from sync_logs;` before and after apply

alter table sync_logs add column if not exists deleted_count int;
