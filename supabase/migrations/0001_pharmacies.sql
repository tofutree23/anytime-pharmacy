create extension if not exists cube;
create extension if not exists earthdistance;

create table pharmacies (
  id text primary key,
  name text not null,
  address text not null,
  phone text,
  lat double precision not null,
  lng double precision not null,
  duty_time jsonb not null,
  source text not null default '국립중앙의료원 전국 약국 정보 조회 서비스',
  updated_at timestamptz not null default now()
);

create index pharmacies_geo_idx on pharmacies using gist (ll_to_earth(lat, lng));
create index pharmacies_address_idx on pharmacies (address);

alter table pharmacies enable row level security;

create policy "pharmacies are publicly readable"
  on pharmacies for select
  using (true);
