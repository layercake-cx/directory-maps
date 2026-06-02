-- ============================================================
-- Add email test mode columns to clients
-- email_test_mode: when true, contact form sends to test recipient
--                  instead of the listing's email address.
--                  Defaults to true so existing orgs stay safe.
-- email_test_recipient: the saved default test address (pre-fills
--                  the test recipient field in the contact form).
-- ============================================================

-- [DRY RUN] wrap in transaction and roll back to validate first:
-- BEGIN;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS email_test_mode      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_test_recipient text;

-- Update the anon-accessible view to expose the new fields.
-- The view already exists; we drop + recreate to add columns.
DROP VIEW IF EXISTS client_messaging_settings;

CREATE VIEW client_messaging_settings AS
  SELECT
    id                  AS client_id,
    messaging_enabled,
    messaging_prompt,
    email_test_mode,
    email_test_recipient
  FROM clients;

GRANT SELECT ON client_messaging_settings TO anon;
GRANT SELECT ON client_messaging_settings TO authenticated;

-- ROLLBACK; -- end dry run

-- ── Integrity check (run after applying) ────────────────────
-- SELECT COUNT(*) FROM clients;                         -- row count unchanged
-- SELECT client_id, email_test_mode FROM client_messaging_settings LIMIT 5;
