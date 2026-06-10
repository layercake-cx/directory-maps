-- Rollback: 20260610120000_sync_sheet_listings_daily_cron
-- Removes the daily dispatch cron job. Does not restore legacy
-- 'nightly'/'hourly' schedule values or pre-snap daily:HH:MM times.

select cron.unschedule(jobid)
from cron.job
where jobname = 'sync-sheet-listings-daily-dispatch';
