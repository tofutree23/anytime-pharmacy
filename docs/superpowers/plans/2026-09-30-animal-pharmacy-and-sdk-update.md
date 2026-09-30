---
date: 2026-09-30
status: ready
tags: [anytime-pharmacy, 구현계획]
---

# 동물약국 찾기 및 토스 SDK 최신화 Implementation Plan

> **실행 방식:** `luke-harness` 서브에이전트로 실행한다. 모든 Task에 작성자가 아닌 검증자가 있다.

**Goal:** 패키지 매니저가 pnpm으로 바뀌고, 토스 SDK가 3.6.0으로 고정되며, 홈 화면의 `약국 | 동물약국` 탭에서 행정안전부 동물약국 데이터를 지도와 목록, 지역 선택, 상세 화면으로 조회할 수 있다.

**Architecture:** 동물약국은 기존 약국과 완전히 분리된 저장 경로를 가진다(`animal_pharmacies` 테이블, `sync-animal-pharmacies` Edge Function). Edge Function 안에서 `coord.ts`가 EPSG:5174 좌표를 WGS84로 바꾸고, `parse.ts`가 응답 봉투 해석과 영업상태 필터, 필드 매핑을 맡는다. 클라이언트는 `Place = Pharmacy | AnimalPharmacy` 유니온 타입과 `placeSources.ts`의 kind별 테이블 매핑으로 기존 hook과 지도를 공유하고, 영업시간 로직은 `Pharmacy`에만 적용된다.

**Tech Stack:** React 19, TypeScript, Vite, TanStack Query/Virtual, TDS(`@toss/tds-mobile` 2.5.1), `@apps-in-toss/web-framework` 3.6.0, Supabase(Postgres, Edge Functions on Deno, pg_cron), Vitest, Deno test

**Spec:** `docs/superpowers/specs/2026-09-30-animal-pharmacy-and-sdk-update-design.md`

---

## Global Constraints

- 브랜치: `main`에서 직접 진행한다(기존 저장소 관례). Task마다 커밋 하나.
- 패키지 매니저는 pnpm만 쓴다. 의존성 버전은 정확히 고정한다(`^`, `~`, `latest` 금지).
- 커밋 메시지: 기존 관례대로 한국어 한 줄 제목, 필요하면 본문 3줄 이하. co-author 줄을 넣지 않는다.
- 코드 주석은 3줄을 넘기지 않는다. 기존 파일의 주석 밀도와 어조를 따른다.
- 서비스키와 요청 URL(서비스키 포함)은 로그, 응답, 예외 메시지에 절대 남기지 않는다.
- 테스트 명령(커밋 게이트): `pnpm test && pnpm test:functions`
- 테스트로 검증되지 않는 영역과 대체 수단:
  - UI(Vitest 환경이 `node`이고 React Testing Library가 없다): `pnpm build`의 타입체크와 devtools 수동 확인으로 대신한다.
  - 실제 공공API 응답 형식: 첫 배포 실행 로그로 확인한다(spec §3 "응답 형식 검증").
  - 배포(`supabase db push`, `supabase functions deploy`, `ait deploy`)는 외부에 영향을 주므로 이 계획의 Task에 넣지 않고, 마지막 "배포 체크리스트"로 사용자에게 넘긴다.

### 이 단계에서 확정한 자유 결정

| 항목 | 결정 | 근거 |
| --- | --- | --- |
| npm → pnpm lockfile 변환 | `pnpm import`로 `package-lock.json`의 해석 버전을 그대로 옮긴 뒤 lockfile을 삭제한다 | 새로 `pnpm install`하면 전이 의존성 버전이 바뀌어 전환과 업그레이드가 한 커밋에 섞인다 |
| Task 1에서 `"latest"` 처리 | 먼저 현재 설치 버전 `3.0.3`으로 고정한다 | Task 2의 diff가 순수하게 3.0.3 → 3.6.0만 보이게 한다 |
| 동물약국 영업상태 판정 | `trdStateGbn === "01"`(영업/정상)만 통과. `02` 휴업, `03` 폐업, `04` 취소/말소, 그 외는 모두 제외 | 휴업 중인 곳을 안내하면 방문 헛걸음이 생긴다. 사용자가 다른 기준을 원하면 계획 리뷰 때 이 줄만 바꾼다 |
| 응답 필드명 | LOCALDATA 표준 항목명으로 추정: `mgtNo`, `bplcNm`, `trdStateGbn`, `rdnWhlAddr`, `siteWhlAddr`, `siteTel`, `apvPermYmd`, `x`, `y` | 샘플 없이 진행하기로 했다. `parse.ts` 상단 `FIELDS` 상수 한 곳에 모아 첫 실행 로그를 보고 여기만 고친다 |
| 응답 봉투 | 기존 API와 같은 `response.body.items.item`, `response.body.totalCount`로 추정하고, 해석 실패 시 최상위 키 이름만 로그로 남기고 실패 처리한다 | 추정이 틀렸을 때 조용히 0건 동기화되는 것을 막는다 |
| 페이지 크기 | `PAGE_SIZE = 1000` | 기존 함수에서 1000이 리소스 한도 안에서 동작함을 확인했다. API가 더 작게 잘라 주면 완전성 판정이 실패해 pruning이 건너뛰어지므로 안전하다. 첫 실행 로그의 페이지당 건수로 확인한다 |
| 페이지 순회 코드 공유 | 기존 `sync-pharmacies/index.ts`를 리팩터링하지 않고 새 함수에 복사한다 | 기존 동기화 경로를 건드리지 않는다(spec: "기존 약국 흐름 무변경"). 공통화는 별도 작업으로 남긴다 |
| 좌표 변환 구현 | 외부 라이브러리 없이 Snyder TM 역변환 + 7-parameter Helmert(Position Vector, proj의 `towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43`) | Edge Function 번들과 콜드스타트를 늘리지 않는다. 기준값은 proj4 2.x로 생성했다 |
| 좌표 유효 범위 | 위도 33.0~38.9, 경도 124.5~132.0 밖이면 정규화 실패 | 좌표가 비었거나 0인 행이 바다 한가운데 핀으로 찍히는 것을 막는다 |
| cron 시각 | 매일 03:30 KST = `30 18 * * *`(UTC) | 원본 일간 갱신 이후, 기존 매시 정각 작업과 겹치지 않게 한다 |
| 동물약국 `source` 기본값 | `'행정안전부 동물약국 인허가 정보'` | 상세 화면의 출처 표기 |
| 클라이언트 kind 값 | `'pharmacy' \| 'animal'` | spec 그대로 |
| 탭 컴포넌트 | TDS `SegmentedControl`(`value`, `onChange`, `SegmentedControl.Item value=...`) | node_modules 타입 정의로 존재 확인 |
| 탭 전환 시 스크롤 | 목록 스크롤을 맨 위로 되돌린다(`activeFilters`와 같은 effect) | 다른 종류 목록의 중간 위치에 머무는 것은 의미가 없다 |
| 동물약국 카드 우측 | 비워 둔다(`right` 없음) | 영업 여부를 모르는데 배지를 두면 오해를 준다 |

---

## Task 1: pnpm 전환

**실행**: `luke-harness:codex-business-logic`

**Files:**
- Create: `pnpm-workspace.yaml`, `pnpm-lock.yaml`(생성물)
- Delete: `package-lock.json`
- Modify: `package.json`(`@apps-in-toss/web-framework`를 `3.0.3`으로 고정), `README.md`(개발 명령어), `vitest.config.ts:7`(주석의 `npm run` → `pnpm`)

**Interfaces:**
- Consumes: 없음
- Produces: pnpm 기반 설치와 스크립트 실행. 이후 모든 Task는 `pnpm` 명령을 쓴다.

위험 지점: `pnpm import`가 실패하거나 `node_modules`를 새로 깔면서 전이 의존성 버전이 바뀔 수 있다. 설치 후 핵심 패키지 버전이 전환 전과 같은지 확인한다. `.claude/`, `.codex/`, `AGENTS.md`, `.env`는 건드리지 않는다.

- [ ] **Step 1: 전환 전 기준 기록** - 현재 상태에서 `pnpm exec vitest run` 결과와, `node -p "require('./node_modules/react/package.json').version"` 등 `package.json` 직접 의존성의 설치 버전을 `$SCRATCH/pnpm-before.txt`에 기록한다(scratchpad 경로는 메인 세션이 프롬프트로 준다).
- [ ] **Step 2: `package.json`의 `"@apps-in-toss/web-framework": "latest"`를 `"3.0.3"`으로 바꾼다.**
- [ ] **Step 3: `pnpm-workspace.yaml` 생성**

```yaml
saveExact: true
```

- [ ] **Step 4: 변환** - `pnpm import && rm package-lock.json && rm -rf node_modules && pnpm install --frozen-lockfile`
- [ ] **Step 5: 확인** - `pnpm config get save-exact` / Expected: `true`. Step 1과 같은 방식으로 직접 의존성 버전을 다시 뽑아 `diff` / Expected: 차이 없음
- [ ] **Step 6: README와 `vitest.config.ts` 주석의 `npm run` 표기를 `pnpm`으로 바꾼다.** README의 `npm run dev` 등 5줄이 대상이다.
- [ ] **Step 7: green 확인** - `pnpm test && pnpm test:functions && pnpm build` / Expected: 모두 PASS, `ait build` 산출물(`anytime-pharmacy.ait`) 생성
- [ ] **Step 8: `codex-reviewer` 검토** - lockfile은 diff에서 제외. 버전 범위 표기가 남아 있지 않은지, README 명령어 누락이 없는지 본다.
- [ ] **Step 9: 메인 세션이 전체 diff 검토 후 커밋** - 메시지: `npm에서 pnpm으로 패키지 매니저 전환`

---

## Task 2: 토스 SDK 3.6.0 고정

**실행**: `luke-harness:codex-business-logic`

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`

**Interfaces:**
- Consumes: Task 1의 pnpm 환경
- Produces: `@apps-in-toss/web-framework@3.6.0`, `@apps-in-toss/devtools@3.6.0`

위험 지점: 3.1.1부터 서비스 Origin이 `*.apps.tossmini.com`으로 바뀐다. 카카오 JavaScript SDK 도메인 등록은 사용자가 완료했다. 코드 변경은 없어야 정상이고, 타입 에러가 나면 SDK API 변경이므로 멈추고 보고한다(임의 수정 금지).

- [ ] **Step 1: 업데이트** - `pnpm add @apps-in-toss/web-framework@3.6.0 && pnpm add -D @apps-in-toss/devtools@3.6.0`
- [ ] **Step 2: 버전 확인** - `node -p "require('./node_modules/@apps-in-toss/web-framework/package.json').version"` / Expected: `3.6.0`. devtools도 같은 방식 / Expected: `3.6.0`. `package.json`에 `^` 없음.
- [ ] **Step 3: green 확인** - `pnpm test && pnpm test:functions && pnpm build` / Expected: 모두 PASS. `ait build`가 `appName`, `brand` 검증 경고 없이 통과.
- [ ] **Step 4: devtools 기동 확인** - `pnpm dev`를 백그라운드로 띄우고 콘솔에 에러 없이 Vite 서버가 뜨는지 확인한 뒤 종료한다. 위치 조회와 배너는 메인 세션이 브라우저로 확인한다.
- [ ] **Step 5: `codex-reviewer` 검토** - lockfile 제외. `package.json` 두 줄 외 변경이 없는지 본다.
- [ ] **Step 6: 메인 세션이 전체 diff 검토 후 커밋** - 메시지: `토스 SDK를 3.6.0으로 올리고 버전 고정`

---

## Task 3: EPSG:5174 → WGS84 좌표 변환

**실행**: `luke-harness:codex-business-logic`

**Files:**
- Create: `supabase/functions/sync-animal-pharmacies/coord.ts`
- Create: `supabase/functions/sync-animal-pharmacies/coord.test.ts`
- Modify: `package.json`(`test:functions` → `deno test supabase/functions/`)

**Interfaces:**
- Consumes: 없음
- Produces: `export function epsg5174ToWgs84(x: number, y: number): { lat: number; lng: number }`

위험 지점: Helmert 회전 부호 규약. proj의 `towgs84`는 Position Vector 규약이다. 부호를 반대로 쓰면 수십 m가 어긋나지만 "대충 맞아" 보이므로 반드시 아래 기준값 4개로 검증한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
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
```

- [ ] **Step 2: `package.json`의 `test:functions`를 `deno test supabase/functions/`로 바꾼다.** 기존 `sync-pharmacies/parse.test.ts`도 계속 실행된다.
- [ ] **Step 3: red 확인** - `deno test supabase/functions/sync-animal-pharmacies/coord.test.ts` / Expected: FAIL, `coord.ts` 모듈 없음
- [ ] **Step 4: 구현 위임** - 아래 구현을 기준으로 한다.

```ts
// Bessel 1841 타원체, 보정계수 없는 중부원점(EPSG:5174). 파라미터는 proj의 EPSG:5174 정의와 같다.
const BESSEL = { a: 6377397.155, f: 1 / 299.1528128 };
const WGS84 = { a: 6378137, f: 1 / 298.257223563 };
const LAT0 = (38 * Math.PI) / 180;
const LON0 = (127.0028902777778 * Math.PI) / 180;
const K0 = 1;
const X0 = 200000;
const Y0 = 500000;
const ARCSEC = Math.PI / (180 * 3600);
const TOWGS84 = { tx: -115.8, ty: 474.99, tz: 674.11, rx: 1.16 * ARCSEC, ry: -2.31 * ARCSEC, rz: -1.63 * ARCSEC, s: 6.43e-6 };

const eSq = (f: number) => f * (2 - f);

function meridianArc(a: number, e2: number, phi: number): number {
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  return a * (
    (1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
    ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) +
    ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) -
    ((35 * e6) / 3072) * Math.sin(6 * phi)
  );
}

// Snyder, Map Projections: A Working Manual, 식 8-12 ~ 8-25 (TM 역변환)
function inverseTransverseMercator(x: number, y: number): { phi: number; lambda: number } {
  const { a } = BESSEL;
  const e2 = eSq(BESSEL.f);
  const ep2 = e2 / (1 - e2);
  const m = meridianArc(a, e2, LAT0) + (y - Y0) / K0;
  const mu = m / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 = mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const sin1 = Math.sin(phi1);
  const cos1 = Math.cos(phi1);
  const tan1 = Math.tan(phi1);
  const c1 = ep2 * cos1 * cos1;
  const t1 = tan1 * tan1;
  const n1 = a / Math.sqrt(1 - e2 * sin1 * sin1);
  const r1 = (a * (1 - e2)) / Math.pow(1 - e2 * sin1 * sin1, 1.5);
  const d = (x - X0) / (n1 * K0);
  const phi = phi1 - ((n1 * tan1) / r1) * (
    (d * d) / 2 -
    ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * d ** 4) / 24 +
    ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) * d ** 6) / 720
  );
  const lambda = LON0 + (
    d -
    ((1 + 2 * t1 + c1) * d ** 3) / 6 +
    ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * d ** 5) / 120
  ) / cos1;
  return { phi, lambda };
}

function toGeocentric(phi: number, lambda: number, a: number, e2: number) {
  const n = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  return {
    X: n * Math.cos(phi) * Math.cos(lambda),
    Y: n * Math.cos(phi) * Math.sin(lambda),
    Z: n * (1 - e2) * Math.sin(phi),
  };
}

function fromGeocentric(X: number, Y: number, Z: number, a: number, e2: number) {
  const p = Math.hypot(X, Y);
  let phi = Math.atan2(Z, p * (1 - e2));
  for (let i = 0; i < 6; i++) {
    const n = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
    const h = p / Math.cos(phi) - n;
    phi = Math.atan2(Z, p * (1 - (e2 * n) / (n + h)));
  }
  return { phi, lambda: Math.atan2(Y, X) };
}

export function epsg5174ToWgs84(x: number, y: number): { lat: number; lng: number } {
  const { phi, lambda } = inverseTransverseMercator(x, y);
  const { X, Y, Z } = toGeocentric(phi, lambda, BESSEL.a, eSq(BESSEL.f));
  const { tx, ty, tz, rx, ry, rz, s } = TOWGS84;
  // proj의 towgs84는 Position Vector 규약이다. 회전 부호를 뒤집으면 수십 m가 어긋난다.
  const Xw = tx + (1 + s) * (X - rz * Y + ry * Z);
  const Yw = ty + (1 + s) * (rz * X + Y - rx * Z);
  const Zw = tz + (1 + s) * (-ry * X + rx * Y + Z);
  const result = fromGeocentric(Xw, Yw, Zw, WGS84.a, eSq(WGS84.f));
  return { lat: (result.phi * 180) / Math.PI, lng: (result.lambda * 180) / Math.PI };
}
```

- [ ] **Step 5: green 확인** - `deno test supabase/functions/sync-animal-pharmacies/coord.test.ts` / Expected: PASS 4건. 이어서 `pnpm test:functions` / Expected: 기존 parse 테스트 포함 전체 PASS
- [ ] **Step 6: `codex-reviewer` 검토** - Helmert 회전 부호와 단위(arcsec → rad, ppm → 배율), 역변환 급수 계수 오타를 본다.
- [ ] **Step 7: 메인 세션이 전체 diff 검토 후 커밋** - 메시지: `동물약국 좌표 변환(EPSG:5174 → WGS84) 추가`

---

## Task 4: 동물약국 응답 파싱과 정규화

**실행**: `luke-harness:codex-business-logic`

**Files:**
- Create: `supabase/functions/sync-animal-pharmacies/parse.ts`
- Create: `supabase/functions/sync-animal-pharmacies/parse.test.ts`

**Interfaces:**
- Consumes: Task 3의 `epsg5174ToWgs84(x, y)`
- Produces:
  - `export const FIELDS` (추정 필드명 모음)
  - `export type RawAnimalPharmacyItem = Record<string, unknown>`
  - `export type NormalizedAnimalPharmacy = { id: string; name: string; address: string; phone: string | null; lat: number; lng: number; licensedAt: string | null }`
  - `export function extractPage(json: unknown): { items: RawAnimalPharmacyItem[]; totalCount: number } | null`
  - `export function isOperating(raw: RawAnimalPharmacyItem): boolean`
  - `export function normalizeAnimalPharmacy(raw: RawAnimalPharmacyItem): NormalizedAnimalPharmacy` (실패 시 throw)

`RawAnimalPharmacyItem`을 `Record<string, unknown>`으로 두는 이유: 필드명이 추정이라 타입으로 고정하면 틀렸을 때 타입이 거짓말을 한다. 값은 모두 `FIELDS`를 통해 읽는다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { assertEquals, assertThrows, assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractPage, isOperating, normalizeAnimalPharmacy } from "./parse.ts";

const base = {
  mgtNo: "3000000-117-2019-00001",
  bplcNm: "행복동물약국",
  trdStateGbn: "01",
  rdnWhlAddr: "서울특별시 중구 세종대로 110",
  siteWhlAddr: "서울특별시 중구 태평로1가 31",
  siteTel: "02-123-4567",
  apvPermYmd: "2019-03-02",
  x: "197984.0",
  y: "451557.164",
};

Deno.test("정상 행을 정규화하고 좌표를 WGS84로 바꾼다", () => {
  const r = normalizeAnimalPharmacy(base);
  assertEquals(r.id, "3000000-117-2019-00001");
  assertEquals(r.name, "행복동물약국");
  assertEquals(r.address, "서울특별시 중구 세종대로 110");
  assertEquals(r.phone, "02-123-4567");
  assertEquals(r.licensedAt, "2019-03-02");
  assertAlmostEquals(r.lat, 37.5662952, 0.00002);
  assertAlmostEquals(r.lng, 126.9779692, 0.00002);
});

Deno.test("도로명 주소가 비면 지번 주소를 쓴다", () => {
  assertEquals(normalizeAnimalPharmacy({ ...base, rdnWhlAddr: "" }).address, "서울특별시 중구 태평로1가 31");
});

Deno.test("전화번호가 비거나 공백이면 null", () => {
  assertEquals(normalizeAnimalPharmacy({ ...base, siteTel: " " }).phone, null);
});

Deno.test("인허가일자 형식이 이상하면 null", () => {
  assertEquals(normalizeAnimalPharmacy({ ...base, apvPermYmd: "" }).licensedAt, null);
});

Deno.test("관리번호, 이름, 주소 둘 다 없으면 throw", () => {
  assertThrows(() => normalizeAnimalPharmacy({ ...base, mgtNo: "" }));
  assertThrows(() => normalizeAnimalPharmacy({ ...base, bplcNm: "" }));
  assertThrows(() => normalizeAnimalPharmacy({ ...base, rdnWhlAddr: "", siteWhlAddr: "" }));
});

Deno.test("좌표가 없거나 국내 범위를 벗어나면 throw", () => {
  assertThrows(() => normalizeAnimalPharmacy({ ...base, x: "", y: "" }));
  assertThrows(() => normalizeAnimalPharmacy({ ...base, x: "0", y: "0" }));
});

Deno.test("영업상태 01만 영업 중으로 본다", () => {
  assertEquals(isOperating(base), true);
  for (const code of ["02", "03", "04", "", undefined]) {
    assertEquals(isOperating({ ...base, trdStateGbn: code }), false);
  }
});

Deno.test("extractPage: 배열 봉투", () => {
  const json = { response: { body: { totalCount: 2, items: { item: [base, base] } } } };
  assertEquals(extractPage(json)?.items.length, 2);
  assertEquals(extractPage(json)?.totalCount, 2);
});

Deno.test("extractPage: 단일 객체 봉투와 빈 페이지", () => {
  assertEquals(extractPage({ response: { body: { totalCount: 1, items: { item: base } } } })?.items.length, 1);
  assertEquals(extractPage({ response: { body: { totalCount: 0, items: "" } } })?.items.length, 0);
});

Deno.test("extractPage: 예상하지 못한 구조면 null", () => {
  assertEquals(extractPage({ foo: 1 }), null);
  assertEquals(extractPage(null), null);
});
```

- [ ] **Step 2: red 확인** - `deno test supabase/functions/sync-animal-pharmacies/parse.test.ts` / Expected: FAIL, `parse.ts` 모듈 없음
- [ ] **Step 3: 구현 위임** - 요구사항:
  - 파일 맨 위에 `FIELDS` 상수를 두고, 주석 한 줄로 "LOCALDATA 표준 항목명 추정값, 첫 실행 로그로 검증"이라고 적는다.
    ```ts
    export const FIELDS = {
      id: "mgtNo", name: "bplcNm", status: "trdStateGbn", roadAddress: "rdnWhlAddr",
      lotAddress: "siteWhlAddr", phone: "siteTel", licensedAt: "apvPermYmd", x: "x", y: "y",
    } as const;
    export const OPERATING_STATUS = "01";
    ```
  - 문자열 필드는 `String(value ?? "").trim()`으로 읽는다. 숫자로 올 수도 있기 때문이다.
  - `licensedAt`: `YYYY-MM-DD` 또는 `YYYYMMDD`를 받아 `YYYY-MM-DD`로 맞추고, 그 외는 `null`.
  - 좌표: `Number()` 변환 결과가 유한수가 아니면 throw. 변환 후 위도 33.0~38.9, 경도 124.5~132.0 밖이면 throw.
  - `extractPage`: `json.response.body`가 객체가 아니면 `null`. `items`가 빈 문자열이나 없음이면 빈 배열. `item`이 배열이 아니면 한 원소 배열로 감싼다. `totalCount`는 `Number()`로 읽고 유한수가 아니면 `null`.
- [ ] **Step 4: green 확인** - `deno test supabase/functions/sync-animal-pharmacies/` / Expected: coord 4건 + parse 10건 PASS
- [ ] **Step 5: `codex-reviewer` 검토** - 필드 접근이 모두 `FIELDS`를 거치는지, throw 메시지에 원본 값(개인정보 아님이지만 로그 오염)이 들어가지 않는지 본다.
- [ ] **Step 6: 메인 세션이 전체 diff 검토 후 커밋** - 메시지: `동물약국 응답 파싱과 정규화 추가`

---

## Task 5: 동물약국 테이블, 동기화 함수, cron

**실행**: `luke-harness:codex-business-logic`

**Files:**
- Create: `supabase/migrations/0006_animal_pharmacies.sql`
- Create: `supabase/migrations/0007_animal_pharmacies_sync_cron.sql`
- Create: `supabase/functions/sync-animal-pharmacies/index.ts`

**Interfaces:**
- Consumes: Task 4의 `extractPage`, `isOperating`, `normalizeAnimalPharmacy`, `FIELDS`
- Produces: 테이블 `animal_pharmacies(id text pk, name text, address text, phone text null, lat float8, lng float8, licensed_at date null, source text default '행정안전부 동물약국 인허가 정보', updated_at timestamptz)`. 클라이언트가 이 컬럼명을 그대로 읽는다.

위험 지점 두 가지를 먼저 적는다.
1. **pruning 완전성 판정**: `items.length >= totalCount` 비교는 영업상태로 거르기 **전** 원본 건수로 한다. 거른 뒤 건수로 비교하면 매번 불완전으로 판정되어 폐업 약국이 영원히 남는다.
2. **영업 중이 아닌 행은 `skippedIds`에 넣지 않는다.** `skippedIds`는 "API에 있지만 파싱 실패"라서 삭제에서 보호하는 목록이다. 폐업 행을 여기 넣으면 삭제가 막힌다. 정규화 실패 행만 넣는다.

- [ ] **Step 1: 마이그레이션 0006 작성** - `0001_pharmacies.sql`과 같은 형식. `create extension`은 이미 있으므로 넣지 않는다.

```sql
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
```

- [ ] **Step 2: 마이그레이션 0007 작성** - `0002_sync_cron.sql`을 복사해 job 이름 `sync-animal-pharmacies-daily`, 스케줄 `'30 18 * * *'`, URL 경로 `/functions/v1/sync-animal-pharmacies`로만 바꾼다. Authorization 헤더 값은 0002의 것을 그대로 쓴다(공개 anon 키). `pg_cron`, `pg_net` extension 구문은 넣지 않는다.
- [ ] **Step 3: `index.ts` 작성** - `sync-pharmacies/index.ts`를 복사한 뒤 아래만 바꾼다.
  - `API_BASE = "https://apis.data.go.kr/1741000/animal_pharmacies/info"`. 상단에 한 줄 주석: 상세 기능 경로 `/info`는 추정이며 첫 실행 로그로 확인한다.
  - 환경변수 `DATA_GOV_ANIMAL_KEY`.
  - 응답 해석은 `extractPage(json)`로 한다. `null`이면 `console.warn("동물약국 응답 구조 예상과 다름, 최상위 키:", Object.keys(json ?? {}).join(","))` 후 `throw new PublicApiError("공공API 응답 구조 오류")`. 값은 로그에 남기지 않는다.
  - 첫 페이지에서만 `console.info`로 첫 행의 키 목록(`Object.keys(items[0]).join(",")`)과 페이지 건수를 남긴다.
  - 정규화 루프: `isOperating(raw)`가 거짓이면 건너뛴다(`skippedIds`에 넣지 않음, 별도 카운터 `closed`). 참이면 `normalizeAnimalPharmacy`를 시도하고 실패 시 `skippedIds.push(String(raw[FIELDS.id] ?? ""))`(빈 문자열은 넣지 않음).
  - 영업상태 분포 로그: `trdStateGbn` 값별 건수를 `console.info("동물약국 영업상태 분포:", JSON.stringify(counts))`로 남긴다. 코드값만이라 안전하다.
  - 행 매핑: `{ id, name, address, phone, lat, lng, licensed_at: licensedAt, updated_at: syncedAt }`, 테이블 `animal_pharmacies`.
  - 응답 JSON에 `closed` 건수를 추가한다.
  - 그 외(재시도, 완전성 판정, 청크 upsert, pruning 조건, 에러 처리, 서비스키 정규화)는 원본과 동일하게 유지한다.
- [ ] **Step 4: 타입 확인** - `deno check supabase/functions/sync-animal-pharmacies/index.ts` / Expected: 에러 없음
- [ ] **Step 5: green 확인** - `pnpm test && pnpm test:functions` / Expected: 전체 PASS
- [ ] **Step 6: `codex-reviewer` 검토** - 위험 지점 1, 2가 지켜졌는지, 서비스키가 로그와 응답에 새지 않는지, 원본 대비 의도하지 않은 차이가 없는지(`diff sync-pharmacies/index.ts sync-animal-pharmacies/index.ts`) 본다.
- [ ] **Step 7: 메인 세션이 전체 diff 검토 후 커밋** - 메시지: `동물약국 테이블과 일간 동기화 함수 추가`

---

## Task 6: 클라이언트 도메인 타입과 데이터 hook

**실행**: `luke-harness:codex-business-logic`

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/lib/pharmacyRow.ts`(`kind: 'pharmacy'` 추가)
- Create: `src/lib/animalPharmacyRow.ts`
- Create: `src/lib/placeSources.ts`
- Create: `src/lib/placeSources.test.ts`
- Create: `src/domain/formatDistance.ts`, `src/domain/formatDistance.test.ts`
- Modify: `src/hooks/usePharmacies.ts`, `src/hooks/usePharmaciesInBounds.ts`
- Modify: `src/components/PharmacyCard.tsx`(로컬 `formatDistance`를 import로 교체)

**Interfaces:**
- Consumes: Task 5의 `animal_pharmacies` 컬럼명
- Produces:
  ```ts
  // src/domain/types.ts
  export type PlaceBase = { id: string; name: string; address: string; phone: string | null; lat: number; lng: number; source: string; updatedAt: string; distanceMeters: number | null };
  export type Pharmacy = PlaceBase & { kind: 'pharmacy'; dutyTime: DutyTime };
  export type AnimalPharmacy = PlaceBase & { kind: 'animal' };
  export type Place = Pharmacy | AnimalPharmacy;
  export type PlaceKind = Place['kind'];
  // src/lib/placeSources.ts
  export const PLACE_SOURCES: Record<PlaceKind, { table: 'pharmacies' | 'animal_pharmacies'; toPlace: (row: never) => Place }>;
  export function rowsToPlaces(kind: PlaceKind, rows: unknown[]): Place[];
  // src/domain/formatDistance.ts
  export function formatDistance(meters: number): string;
  // hooks
  export function usePharmacies(kind: PlaceKind, query: PharmacyQuery): { pharmacies: Place[]; loading: boolean; error: string | null; refetch: () => void };
  export function usePharmaciesInBounds(kind: PlaceKind, bounds: MapBounds | null): { pharmacies: Place[]; loading; error; refetch };
  ```

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/placeSources.test.ts
import { describe, expect, it } from 'vitest';
import { PLACE_SOURCES, rowsToPlaces } from './placeSources';

const animalRow = {
  id: 'A1', name: '행복동물약국', address: '서울특별시 중구 세종대로 110', phone: null,
  lat: 37.56, lng: 126.97, licensed_at: '2019-03-02', source: '행정안전부 동물약국 인허가 정보',
  updated_at: '2026-09-30T00:00:00Z',
};

describe('PLACE_SOURCES', () => {
  it('kind별로 조회할 테이블이 정해져 있다', () => {
    expect(PLACE_SOURCES.pharmacy.table).toBe('pharmacies');
    expect(PLACE_SOURCES.animal.table).toBe('animal_pharmacies');
  });
});

describe('rowsToPlaces', () => {
  it('동물약국 행을 AnimalPharmacy로 바꾸고 dutyTime을 만들지 않는다', () => {
    const [place] = rowsToPlaces('animal', [animalRow]);
    expect(place).toEqual({
      kind: 'animal', id: 'A1', name: '행복동물약국', address: '서울특별시 중구 세종대로 110', phone: null,
      lat: 37.56, lng: 126.97, source: '행정안전부 동물약국 인허가 정보', updatedAt: '2026-09-30T00:00:00Z',
      distanceMeters: null,
    });
  });

  it('약국 행에는 kind pharmacy가 붙는다', () => {
    const row = { ...animalRow, duty_time: { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null, holiday: null } };
    expect(rowsToPlaces('pharmacy', [row])[0].kind).toBe('pharmacy');
  });
});
```

```ts
// src/domain/formatDistance.test.ts
import { expect, it } from 'vitest';
import { formatDistance } from './formatDistance';

it('1km 미만은 미터, 이상은 소수점 한 자리 km', () => {
  expect(formatDistance(320.4)).toBe('320m');
  expect(formatDistance(999.6)).toBe('1000m');
  expect(formatDistance(1234)).toBe('1.2km');
});
```

- [ ] **Step 2: red 확인** - `pnpm vitest run src/lib/placeSources.test.ts src/domain/formatDistance.test.ts` / Expected: FAIL, 모듈 없음
- [ ] **Step 3: 구현 위임** - 요구사항:
  - `types.ts`는 Interfaces 블록 그대로. 기존 `Pharmacy` 필드와 주석은 `PlaceBase`로 옮긴다.
  - `animalPharmacyRow.ts`: `AnimalPharmacyRow` 타입과 `toAnimalPharmacy(row)`. `licensed_at`은 읽지 않는다(spec의 `AnimalPharmacy`에 없음).
  - `formatDistance`는 `PharmacyCard.tsx`의 기존 구현을 그대로 옮긴다(동작 변경 없음).
  - hook 두 개: 첫 인자로 `kind`를 받고, `.from(PLACE_SOURCES[kind].table)`, `queryKey` 맨 앞을 `kind`로 한다(예: `[kind, 'bounds', ...]`, `[kind, 'region', regionPrefix]`). 반환은 `rowsToPlaces(kind, data)`.
  - `matchesActiveFilters`, `businessHours.ts`는 건드리지 않는다. `Pharmacy`만 받으므로 그대로 둔다.
- [ ] **Step 4: 타입 확인** - `pnpm exec tsc -b` / Expected: `HomePage.tsx`, `App.tsx`, `PharmacyMap.tsx`, `PharmacyDetailPage.tsx`에서 타입 에러가 나는 것은 정상(Task 7에서 해결). 그 외 파일에 에러가 없어야 한다. 에러 목록을 보고에 붙인다.
- [ ] **Step 5: green 확인** - `pnpm test` / Expected: 기존 테스트 + 새 테스트 PASS
- [ ] **Step 6: `codex-reviewer` 검토** - queryKey에 kind가 빠진 곳이 없는지, `rowsToPlaces`의 `never`/`unknown` 캐스팅이 한 곳에만 있는지 본다.
- [ ] **Step 7: 메인 세션 검토** - 이 Task는 빌드가 깨진 상태라 **단독 커밋하지 않는다.** Task 7과 합쳐 커밋한다(커밋 게이트는 테스트만 보지만, 빌드가 깨진 커밋을 남기지 않기 위함).

---

## Task 7: 탭 전환 UI와 동물약국 화면

**실행**: `luke-harness:codex-component-builder`

**Files:**
- Modify: `src/pages/HomePage.tsx`
- Modify: `src/components/PharmacyMap.tsx`(props 타입만)
- Create: `src/components/AnimalPharmacyCard.tsx`
- Create: `src/pages/AnimalPharmacyDetailPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Task 6의 `Place`, `PlaceKind`, `formatDistance`, `usePharmacies(kind, ...)`, `usePharmaciesInBounds(kind, ...)`
- Produces: `HomePage({ onSelectPlace: (place: Place) => void })`, `AnimalPharmacyDetailPage({ pharmacy: AnimalPharmacy; onBack: () => void })`

- [ ] **Step 1: `PharmacyMap.tsx`** - `pharmacies: Place[]`, `onSelectPharmacy: (place: Place) => void`로 타입만 바꾼다. 내부 로직 변경 금지.
- [ ] **Step 2: `AnimalPharmacyCard.tsx`** - `PharmacyCard`와 같은 `ListRow` 스타일(흰 배경, radius 16, `border="none"`, `withTouchEffect`). `right` 없음. `bottom`은 거리 있으면 `${formatDistance(d)}, ${address}`, 없으면 `address`.
- [ ] **Step 3: `AnimalPharmacyDetailPage.tsx`** - `PharmacyDetailPage`의 헤더, 주소, 전화 링크, `ComplianceNotice`, 출처와 갱신 시각 부분을 같은 마크업으로 쓰고, 요일별 시간표 대신 아래 안내 한 줄을 둔다.
  ```tsx
  <Paragraph typography="st11" color="#6b7684" style={{ padding: '8px 16px' }}>
    동물약국은 영업시간 정보가 제공되지 않아요. 방문 전 전화로 확인해 주세요.
  </Paragraph>
  ```
- [ ] **Step 4: `HomePage.tsx`**
  - prop 이름을 `onSelectPlace: (place: Place) => void`로 바꾼다.
  - `const [kind, setKind] = useState<PlaceKind>('pharmacy');`
  - 두 hook 호출에 `kind`를 넘긴다.
  - 필터: `pharmacies.filter((p) => p.kind === 'animal' || matchesActiveFilters(p, activeFilters, now))`. 변수명 `filteredPharmacies`는 `filteredPlaces`로 바꾼다.
  - 스크롤 초기화 effect의 의존성에 `kind`를 추가한다.
  - `ComplianceNotice` 바로 위, 16px 좌우 패딩 안에 탭을 둔다.
    ```tsx
    <div style={{ padding: '0 16px 8px' }}>
      <SegmentedControl value={kind} onChange={(v) => setKind(v as PlaceKind)} size="large">
        <SegmentedControl.Item value="pharmacy">약국</SegmentedControl.Item>
        <SegmentedControl.Item value="animal">동물약국</SegmentedControl.Item>
      </SegmentedControl>
    </div>
    ```
  - `FilterBar`는 `kind === 'pharmacy'`일 때만 렌더링한다.
  - 문구를 kind에 따라 바꾼다. `const label = kind === 'animal' ? '동물약국' : '약국';`
    - 부제목: 약국 `지금 문 연 약국을 찾아보세요.` / 동물약국 `가까운 동물약국을 찾아보세요.`
    - 로딩: `${label} 정보를 불러오는 중이에요...`
    - 빈 상태: `이 지역에 등록된 ${label}이 없어요.` (필터 문구는 약국 탭에서만 나오므로 그대로)
  - 목록 렌더링: `place.kind === 'animal' ? <AnimalPharmacyCard .../> : <PharmacyCard .../>`
  - `RegionPicker` 분기는 탭보다 먼저 return되므로 탭이 보이지 않는다. 이는 의도한 동작이다(지역을 먼저 고른다).
- [ ] **Step 5: `App.tsx`** - `selectedPlace: Place | null`. `AnimalPharmacyDetailPage`도 `lazy`로 불러온다. `selectedPlace.kind`로 두 상세 화면 중 하나를 렌더링한다. `display: none` 유지 구조는 그대로.
- [ ] **Step 6: green 확인** - `pnpm test && pnpm test:functions && pnpm build && pnpm lint` / Expected: 모두 PASS, 타입 에러 0
- [ ] **Step 7: 수동 확인(메인 세션)** - `pnpm dev`로 띄우고 브라우저에서 확인한다. 로컬 DB에 동물약국 데이터가 없으면 빈 상태 문구 확인까지로 한정하고 그렇게 보고한다.
  - 탭 전환 시 필터 바가 사라지고 다시 나타나며, 약국 탭의 선택한 필터가 유지된다.
  - 동물약국 탭에서 빈 상태 문구가 `이 지역에 등록된 동물약국이 없어요.`로 나온다.
  - 약국 탭의 상세 화면 진입과 복귀가 기존과 같고, 복귀 후 탭이 유지된다.
- [ ] **Step 8: `codex-reviewer` 검토** - `Pharmacy` 전용 로직에 `AnimalPharmacy`가 흘러가는 경로가 없는지, 기존 약국 흐름의 동작 변화가 없는지 본다.
- [ ] **Step 9: `design-reviewer` 검토** - Task 6과 7을 합친 diff 기준으로 타입 경계(`Place` 유니온)와 hook 분기 방식이 과하지 않은지 본다.
- [ ] **Step 10: 메인 세션이 Task 6과 7의 전체 diff 검토 후 커밋** - 메시지: `홈 화면에 동물약국 탭과 상세 화면 추가`

---

## Task 8: 문서 갱신

**실행**: `luke-harness:codex-component-builder`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README 갱신** - 핵심 기능에 "약국/동물약국 탭 전환(동물약국은 행정안전부 인허가 데이터, 영업시간 미제공)"을 추가하고, 아키텍처 그림에 `animal_pharmacies` 테이블과 `sync-animal-pharmacies`(매일 1회)를 추가한다. 동물약국 secret 이름 `DATA_GOV_ANIMAL_KEY`를 적는다(값은 적지 않는다).
- [ ] **Step 2: green 확인** - `pnpm test && pnpm test:functions` / Expected: PASS
- [ ] **Step 3: 메인 세션이 diff 검토 후 커밋** - 메시지: `README에 동물약국 기능과 동기화 구조 반영`

---

## 배포 체크리스트 (사용자 작업)

계획의 Task가 모두 끝난 뒤 사용자에게 넘긴다. 외부에 영향을 주므로 에이전트가 실행하지 않는다.

1. 카카오 JavaScript SDK 도메인에 `https://anytime-pharmacy.apps.tossmini.com`, `https://anytime-pharmacy.private-apps.tossmini.com` 등록 확인(완료 보고됨).
2. `supabase db push`로 0006, 0007 마이그레이션 적용.
3. `supabase functions deploy sync-animal-pharmacies` 후 대시보드에서 한 번 수동 실행.
4. 함수 로그에서 다음을 확인하고 결과를 에이전트에게 전달:
   - 최상위 키 경고가 없는지(없으면 봉투 추정이 맞음)
   - 첫 행 키 목록이 `FIELDS`와 일치하는지
   - 영업상태 분포에 `01`이 있는지
   - 페이지당 건수가 1000인지
   - 응답 JSON의 `synced`가 0보다 큰지
5. 추정이 틀렸으면 `parse.ts`의 `FIELDS`, `OPERATING_STATUS`, `index.ts`의 `API_BASE`만 고쳐 재배포.
6. `pnpm build && pnpm deploy`로 앱 배포, 콘솔 QR로 지도 표시 확인.
