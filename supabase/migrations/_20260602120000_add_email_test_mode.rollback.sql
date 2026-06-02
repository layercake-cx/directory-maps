-- Rollback: remove email test mode columns and restore original view
DROP VIEW IF EXISTS client_messaging_settings;

ALTER TABLE clients
  DROP COLUMN IF EXISTS email_test_mode,
  DROP COLUMN IF EXISTS email_test_recipient;

-- Restore original view
CREATE VIEW client_messaging_settings AS
  SELECT
    id                AS client_id,
    messaging_enabled,
    messaging_prompt
  FROM clients;

GRANT SELECT ON client_messaging_settings TO anon;
GRANT SELECT ON client_messaging_settings TO authenticated;
