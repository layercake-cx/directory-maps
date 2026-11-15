-- ============================================================
-- Rollback: 20261113120000_directory_email_templates
-- Reverses: drops public.directory_email_templates. Saved custom email text is
-- LOST (export first if needed); emails revert to the built-in defaults.
-- ============================================================
drop table if exists public.directory_email_templates;
