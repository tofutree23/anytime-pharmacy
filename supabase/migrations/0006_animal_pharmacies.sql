create table animal_pharmacies (
  id text primary key,
  name text not null,
  address text not null,
  phone text,
  lat double precision not null,
  lng double precision not null,
  licensed_at date,
  source text not null default '행정안전부 동물약국 인허가 정보',
  updated_at timestamptz not null default now()
);

create index animal_pharmacies_geo_idx on animal_pharmacies using gist (ll_to_earth(lat, lng));
create index animal_pharmacies_address_idx on animal_pharmacies (address);

alter table animal_pharmacies enable row level security;

create policy "animal pharmacies are publicly readable"
  on animal_pharmacies for select
  using (true);
