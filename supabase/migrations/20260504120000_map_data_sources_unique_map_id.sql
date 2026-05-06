alter table public.map_data_sources
  add constraint map_data_sources_map_id_unique unique (map_id);
