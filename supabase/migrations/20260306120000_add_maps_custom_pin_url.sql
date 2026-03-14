-- Add optional custom pin image URL (Supabase storage or external). Used when marker_style = 'custom'.
alter table public.maps add column if not exists custom_pin_url text null;
