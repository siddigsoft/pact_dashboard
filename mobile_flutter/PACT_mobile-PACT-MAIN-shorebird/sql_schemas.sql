-- Table for storing visit rejections
create table public.visit_rejections (
  id uuid not null default gen_random_uuid (),
  visit_id uuid not null,
  user_id uuid not null,
  reason text not null,
  created_at timestamp with time zone null default now(),
  constraint visit_rejections_pkey primary key (id),
  constraint visit_rejections_visit_id_fkey foreign KEY (visit_id) references mmp_site_entries (id) on delete CASCADE,
  constraint visit_rejections_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_visit_rejections_visit_id on public.visit_rejections using btree (visit_id) TABLESPACE pg_default;
create index IF not exists idx_visit_rejections_user_id on public.visit_rejections using btree (user_id) TABLESPACE pg_default;

-- Table for storing site locations captured during visits
create table public.site_locations (
  id uuid not null default gen_random_uuid (),
  visit_id uuid not null,
  latitude double precision not null,
  longitude double precision not null,
  accuracy double precision null,
  captured_at timestamp with time zone null default now(),
  constraint site_locations_pkey primary key (id),
  constraint site_locations_visit_id_fkey foreign KEY (visit_id) references mmp_site_entries (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_site_locations_visit_id on public.site_locations using btree (visit_id) TABLESPACE pg_default;
