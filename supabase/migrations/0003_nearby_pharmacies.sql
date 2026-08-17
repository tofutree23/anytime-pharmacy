create or replace function nearby_pharmacies(
  target_lat double precision,
  target_lng double precision,
  max_distance_meters double precision default 5000
)
returns setof pharmacies
language sql
stable
as $$
  select *
  from pharmacies
  where earth_box(ll_to_earth(target_lat, target_lng), max_distance_meters) @> ll_to_earth(lat, lng)
    and earth_distance(ll_to_earth(target_lat, target_lng), ll_to_earth(lat, lng)) <= max_distance_meters
  order by earth_distance(ll_to_earth(target_lat, target_lng), ll_to_earth(lat, lng)) asc;
$$;
