const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

const BESSEL_A = 6377397.155;
const BESSEL_F = 1 / 299.1528128;
const WGS84_A = 6378137;
const WGS84_F = 1 / 298.257223563;

const LAT_0 = 38 * DEG_TO_RAD;
const LON_0 = 127.0028902777778 * DEG_TO_RAD;
const FALSE_EASTING = 200000;
const FALSE_NORTHING = 500000;

function meridionalArc(latitude: number, a: number, e2: number): number {
  return a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * latitude
    - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * latitude)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * latitude)
    - (35 * e2 ** 3 / 3072) * Math.sin(6 * latitude));
}

export function epsg5174ToWgs84(x: number, y: number): { lat: number; lng: number } {
  const e2 = BESSEL_F * (2 - BESSEL_F);
  const ep2 = e2 / (1 - e2);
  const m = meridionalArc(LAT_0, BESSEL_A, e2) + y - FALSE_NORTHING;
  const mu = m / (BESSEL_A * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 = mu
    + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
    + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const t1 = Math.tan(phi1) ** 2;
  const c1 = ep2 * cosPhi1 ** 2;
  const n1 = BESSEL_A / Math.sqrt(1 - e2 * sinPhi1 ** 2);
  const r1 = BESSEL_A * (1 - e2) / (1 - e2 * sinPhi1 ** 2) ** 1.5;
  const d = (x - FALSE_EASTING) / n1;
  const latitude = phi1 - n1 * Math.tan(phi1) / r1
    * (d ** 2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ep2) * d ** 4 / 24
      + (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ep2 - 3 * c1 ** 2) * d ** 6 / 720);
  const longitude = LON_0 + (d - (1 + 2 * t1 + c1) * d ** 3 / 6
    + (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ep2 + 24 * t1 ** 2) * d ** 5 / 120) / cosPhi1;

  const n = BESSEL_A / Math.sqrt(1 - e2 * Math.sin(latitude) ** 2);
  const sourceX = n * Math.cos(latitude) * Math.cos(longitude);
  const sourceY = n * Math.cos(latitude) * Math.sin(longitude);
  const sourceZ = n * (1 - e2) * Math.sin(latitude);
  const arcsecToRad = DEG_TO_RAD / 3600;
  const rx = 1.16 * arcsecToRad;
  const ry = -2.31 * arcsecToRad;
  const rz = -1.63 * arcsecToRad;
  const scale = 1 + 6.43e-6;
  // proj의 towgs84는 Position Vector 규약이다. 회전 부호를 뒤집으면 수십 m가 어긋난다.
  const targetX = -115.8 + scale * (sourceX - rz * sourceY + ry * sourceZ);
  const targetY = 474.99 + scale * (rz * sourceX + sourceY - rx * sourceZ);
  const targetZ = 674.11 + scale * (-ry * sourceX + rx * sourceY + sourceZ);

  const wgsE2 = WGS84_F * (2 - WGS84_F);
  const horizontal = Math.hypot(targetX, targetY);
  let wgsLatitude = Math.atan2(targetZ, horizontal * (1 - wgsE2));
  for (let i = 0; i < 6; i++) {
    const wgsN = WGS84_A / Math.sqrt(1 - wgsE2 * Math.sin(wgsLatitude) ** 2);
    wgsLatitude = Math.atan2(targetZ + wgsE2 * wgsN * Math.sin(wgsLatitude), horizontal);
  }

  return { lat: wgsLatitude * RAD_TO_DEG, lng: Math.atan2(targetY, targetX) * RAD_TO_DEG };
}
