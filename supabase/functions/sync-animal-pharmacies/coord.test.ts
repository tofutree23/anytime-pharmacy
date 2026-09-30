import { assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { epsg5174ToWgs84 } from "./coord.ts";

// 기준값: proj4 2.x, '+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000
// +ellps=bessel +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43' 로 WGS84 → 5174 순변환한 값.
const CASES = [
  { name: "서울시청", x: 197984.0, y: 451557.164, lat: 37.5662952, lng: 126.9779692 },
  { name: "부산역", x: 386043.882, y: 181473.232, lat: 35.1152, lng: 129.0415 },
  { name: "제주공항", x: 152815.159, y: 1244.206, lat: 33.5066, lng: 126.493 },
  { name: "속초", x: 339354.765, y: 523867.767, lat: 38.207, lng: 128.5918 },
];

// 0.00002도는 약 2m다. 지도 핀 용도로 충분하고, 회전 부호 오류(수십 m)는 확실히 잡는다.
const TOLERANCE_DEG = 0.00002;

for (const c of CASES) {
  Deno.test(`EPSG:5174 → WGS84: ${c.name}`, () => {
    const result = epsg5174ToWgs84(c.x, c.y);
    assertAlmostEquals(result.lat, c.lat, TOLERANCE_DEG);
    assertAlmostEquals(result.lng, c.lng, TOLERANCE_DEG);
  });
}
