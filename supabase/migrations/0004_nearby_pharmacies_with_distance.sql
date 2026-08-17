-- 스펙상 목록 카드에는 "약국명, 거리, 현재 영업상태, 주소"가 필요한데
-- 기존 nearby_pharmacies는 setof pharmacies라 거리 값을 돌려주지 않았다.
-- 반환 타입이 바뀌므로 create or replace가 아니라 drop 후 재생성한다.
drop function if exists nearby_pharmacies(double precision, double precision, double precision);

create function nearby_pharmacies(
  target_lat double precision,
  target_lng double precision,
  max_distance_meters double precision default 5000
)
returns table (
  id text,
  name text,
  address text,
  phone text,
  lat double precision,
  lng double precision,
  duty_time jsonb,
  source text,
  updated_at timestamptz,
  distance_meters double precision
)
language sql
stable
as $$
  select
    p.id,
    p.name,
    p.address,
    p.phone,
    p.lat,
    p.lng,
    p.duty_time,
    p.source,
    p.updated_at,
    earth_distance(ll_to_earth(target_lat, target_lng), ll_to_earth(p.lat, p.lng)) as distance_meters
  from pharmacies p
  where earth_box(ll_to_earth(target_lat, target_lng), max_distance_meters) @> ll_to_earth(p.lat, p.lng)
    and earth_distance(ll_to_earth(target_lat, target_lng), ll_to_earth(p.lat, p.lng)) <= max_distance_meters
  order by earth_distance(ll_to_earth(target_lat, target_lng), ll_to_earth(p.lat, p.lng)) asc;
$$;
