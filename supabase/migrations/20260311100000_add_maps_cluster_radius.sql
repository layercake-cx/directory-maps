-- Clustering radius in pixels (approx). Higher = more grouping. Used when enable_clustering is true.
alter table public.maps add column if not exists cluster_radius integer not null default 80;
