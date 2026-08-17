-- 무한스크롤 도입: 기존 LIMIT 200 상한 대신 진짜 페이지네이션(offset/limit)으로 교체한다.
-- 반경 안에서는 거리순 정렬이 안정적이므로(같은 쿼리 결과 내 순서 고정) offset 기반으로도
-- 페이지 경계에서 중복/누락 없이 안전하다.
drop function if exists nearby_pharmacies(double precision, double precision, double precision);

create function nearby_pharmacies(
  target_lat double precision,
  target_lng double precision,
  max_distance_meters double precision default 5000,
  page_offset integer default 0,
  page_size integer default 20
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
  order by earth_distance(ll_to_earth(target_lat, target_lng), ll_to_earth(p.lat, p.lng)) asc
  offset page_offset
  limit page_size;
$$;
