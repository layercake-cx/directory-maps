-- Per-client Resend domain + From address for directory contact form email.

alter table public.clients
  add column if not exists email_from_name text null,
  add column if not exists email_from_address text null,
  add column if not exists email_domain text null,
  add column if not exists resend_domain_id text null,
  add column if not exists email_domain_status text not null default 'not_configured',
  add column if not exists email_dns_records jsonb null;

alter table public.clients drop constraint if exists clients_email_domain_status;
alter table public.clients add constraint clients_email_domain_status check (
  email_domain_status in (
    'not_configured',
    'not_started',
    'pending',
    'verified',
    'failed',
    'temporary_failure'
  )
);

comment on column public.clients.email_from_name is 'Display name on outbound map contact emails (Resend From).';
comment on column public.clients.email_from_address is 'From email address; domain must match email_domain when verified.';
comment on column public.clients.email_domain is 'Domain registered in Resend for this client.';
comment on column public.clients.resend_domain_id is 'Resend API domain id.';
comment on column public.clients.email_domain_status is 'Resend domain verification status.';
comment on column public.clients.email_dns_records is 'DNS records from Resend (JSON array) for client setup UI.';
