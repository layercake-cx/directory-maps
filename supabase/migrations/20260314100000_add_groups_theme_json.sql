-- Per-group design overrides (marker_style, marker_color, pin border, cluster color, custom_pin_url).
-- When null, group uses map global design.
alter table public.groups
  add column if not exists theme_json jsonb;
