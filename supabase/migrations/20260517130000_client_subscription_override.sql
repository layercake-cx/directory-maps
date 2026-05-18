-- Manual subscription access for clients who pay by invoice (no Stripe subscription record).
alter table public.clients
  add column if not exists subscription_active_override boolean not null default false;

comment on column public.clients.subscription_active_override is
  'When true, treat client as having active subscription access (e.g. pays by invoice) without a Stripe subscription.';
