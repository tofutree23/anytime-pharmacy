# 언제나 약국 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GPS/지역 기반으로 심야·공휴일 영업 약국을 순위·추천 없이 동일 기준으로 조회하는 앱인토스 미니앱 MVP를 만든다.

**Architecture:** 앱인토스 미니앱(React)이 Supabase Postgres의 `pharmacies` 캐시 테이블을 publishable key로 직접 조회한다. Supabase Edge Function이 1시간 주기 cron으로 국립중앙의료원 "전국 약국 정보 조회 서비스"(data.go.kr) 를 호출해 캐시를 갱신하며, 공공API 서비스키(secret)는 Edge Function 안에서만 사용한다.

**Tech Stack:** React 19, TypeScript, Vite, `@apps-in-toss/web-framework`, `@toss/tds-mobile` + `@toss/tds-mobile-ait`(TDS, 토스 디자인 시스템), `@supabase/supabase-js`, Supabase (Postgres + Edge Functions, Deno), Vitest

**Spec:** `docs/superpowers/specs/2026-08-16-anytime-pharmacy-design.md`

## Global Constraints

- 순위/추천/예약 기능 없음. 정렬은 GPS 조회 시 거리순, 지역 조회 시 이름순 — 이 외 정렬 기준 추가 금지
- 약국 목록은 동일한 카드 구성으로 노출 (특정 약국 강조 금지)
- 데이터 출처("국립중앙의료원 전국 약국 정보 조회 서비스")와 갱신시각을 상세 화면에 항상 표기
- 공공API 서비스키(secret)는 Edge Function 밖으로 절대 노출 금지 — 프론트엔드 코드/환경변수에 넣지 않는다
- 공공API 호출 실패 시 기존 캐시 데이터를 유지하고 실패만 로그로 남긴다 (캐시를 비우거나 에러로 서비스 중단하지 않는다)
- Supabase는 Free 플랜 한도 내에서 운영한다 (유료 리소스 추가 금지)
- 화면 UI는 직접 만든 CSS가 아니라 **TDS(`@toss/tds-mobile`) 컴포넌트를 우선 사용**한다 (`Navigation`, `Top`, `List`/`ListRow`, `Button`, `Badge`, `Paragraph` 등). TDS에 없는 요소만 최소한으로 직접 스타일링한다
- 다크모드는 지원하지 않는다 (라이트 모드 전용, 앱인토스 디자인 가이드 기준). 레이아웃은 375px 폭 기준으로 확인한다

---

## Task 1: Supabase 프로젝트 초기화 및 스키마 마이그레이션

**Files:**
- Create: `supabase/config.toml` (Supabase CLI가 생성)
- Create: `supabase/migrations/0001_pharmacies.sql`

**Interfaces:**
- Produces: `pharmacies` 테이블 (컬럼: `id text pk`, `name text`, `address text`, `phone text`, `lat double precision`, `lng double precision`, `duty_time jsonb`, `source text`, `updated_at timestamptz`). 이후 모든 태스크가 이 스키마를 전제로 한다.

- [ ] **Step 1: Supabase CLI로 프로젝트 링크**

```bash
cd /Users/luke/luke/anytime_pharmacy/anytime-pharmacy
npx supabase init
npx supabase login
npx supabase link --project-ref <SUPABASE_PROJECT_REF>
```

(Supabase 대시보드에서 새 프로젝트를 Free 플랜으로 미리 생성해 두고 `<SUPABASE_PROJECT_REF>`를 그 프로젝트의 ref로 채운다.)

- [ ] **Step 2: 마이그레이션 파일 작성**

`supabase/migrations/0001_pharmacies.sql`:

```sql
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
```

- [ ] **Step 3: 마이그레이션 적용 및 확인**

```bash
npx supabase db push
npx supabase db diff --linked
```

Expected: `db diff`가 변경사항 없음(빈 결과)을 출력 — 로컬 마이그레이션과 원격 스키마가 일치함을 의미.

- [ ] **Step 4: Commit**

```bash
git add supabase/config.toml supabase/migrations/0001_pharmacies.sql
git commit -m "feat: pharmacies 캐시 테이블 스키마 추가"
```

---

## Task 2: 공공API 응답 파싱/정규화 순수 함수 (Edge Function 공용)

**Files:**
- Create: `supabase/functions/sync-pharmacies/parse.ts`
- Test: `supabase/functions/sync-pharmacies/parse.test.ts`

**Interfaces:**
- Produces:
  - `type RawPharmacyItem` — 공공API 응답 아이템 원본 타입
  - `type NormalizedPharmacy = { id: string; name: string; address: string; phone: string | null; lat: number; lng: number; dutyTime: DutyTime }`
  - `type DutyTime = { mon: DayHours | null; tue: DayHours | null; wed: DayHours | null; thu: DayHours | null; fri: DayHours | null; sat: DayHours | null; sun: DayHours | null; holiday: DayHours | null }`
  - `type DayHours = { open: string; close: string }` (HHmm 문자열)
  - `function normalizePharmacy(raw: RawPharmacyItem): NormalizedPharmacy`

- [ ] **Step 1: 실패하는 테스트 작성**

`supabase/functions/sync-pharmacies/parse.test.ts`:

```typescript
import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { normalizePharmacy } from "./parse.ts";

Deno.test("정상 응답을 NormalizedPharmacy로 변환한다", () => {
  const raw = {
    hpid: "A1100001",
    dutyName: "테스트약국",
    dutyAddr: "서울특별시 종로구 세종대로 1",
    dutyTel1: "02-1234-5678",
    wgs84Lon: "126.9779",
    wgs84Lat: "37.5665",
    dutyTime1s: "0900",
    dutyTime1c: "1800",
    dutyTime2s: "0900",
    dutyTime2c: "1800",
    dutyTime3s: "0900",
    dutyTime3c: "1800",
    dutyTime4s: "0900",
    dutyTime4c: "1800",
    dutyTime5s: "0900",
    dutyTime5c: "2200",
    dutyTime6s: "",
    dutyTime6c: "",
    dutyTime7s: "",
    dutyTime7c: "",
    dutyTime8s: "",
    dutyTime8c: "",
  };

  const result = normalizePharmacy(raw);

  assertEquals(result.id, "A1100001");
  assertEquals(result.name, "테스트약국");
  assertEquals(result.lat, 37.5665);
  assertEquals(result.lng, 126.9779);
  assertEquals(result.dutyTime.mon, { open: "0900", close: "1800" });
  assertEquals(result.dutyTime.fri, { open: "0900", close: "2200" });
  assertEquals(result.dutyTime.sat, null);
  assertEquals(result.dutyTime.holiday, null);
});

Deno.test("전화번호가 없으면 null을 반환한다", () => {
  const raw = {
    hpid: "A1100002",
    dutyName: "전화없는약국",
    dutyAddr: "서울특별시 중구 1",
    dutyTel1: "",
    wgs84Lon: "126.9",
    wgs84Lat: "37.5",
    dutyTime1s: "", dutyTime1c: "",
    dutyTime2s: "", dutyTime2c: "",
    dutyTime3s: "", dutyTime3c: "",
    dutyTime4s: "", dutyTime4c: "",
    dutyTime5s: "", dutyTime5c: "",
    dutyTime6s: "", dutyTime6c: "",
    dutyTime7s: "", dutyTime7c: "",
    dutyTime8s: "", dutyTime8c: "",
  };

  const result = normalizePharmacy(raw);

  assertEquals(result.phone, null);
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
deno test supabase/functions/sync-pharmacies/parse.test.ts
```

Expected: FAIL — `parse.ts` 모듈이 존재하지 않음(`Module not found`)

- [ ] **Step 3: 구현 작성**

`supabase/functions/sync-pharmacies/parse.ts`:

```typescript
export type RawPharmacyItem = {
  hpid: string;
  dutyName: string;
  dutyAddr: string;
  dutyTel1: string;
  wgs84Lon: string;
  wgs84Lat: string;
  dutyTime1s: string; dutyTime1c: string;
  dutyTime2s: string; dutyTime2c: string;
  dutyTime3s: string; dutyTime3c: string;
  dutyTime4s: string; dutyTime4c: string;
  dutyTime5s: string; dutyTime5c: string;
  dutyTime6s: string; dutyTime6c: string;
  dutyTime7s: string; dutyTime7c: string;
  dutyTime8s: string; dutyTime8c: string;
};

export type DayHours = { open: string; close: string };

export type DutyTime = {
  mon: DayHours | null;
  tue: DayHours | null;
  wed: DayHours | null;
  thu: DayHours | null;
  fri: DayHours | null;
  sat: DayHours | null;
  sun: DayHours | null;
  holiday: DayHours | null;
};

export type NormalizedPharmacy = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  lat: number;
  lng: number;
  dutyTime: DutyTime;
};

// 공공API dutyTime1~7 = 월~일, dutyTime8 = 공휴일
function dayHoursOrNull(open: string, close: string): DayHours | null {
  if (!open || !close) return null;
  return { open, close };
}

export function normalizePharmacy(raw: RawPharmacyItem): NormalizedPharmacy {
  return {
    id: raw.hpid,
    name: raw.dutyName,
    address: raw.dutyAddr,
    phone: raw.dutyTel1 ? raw.dutyTel1 : null,
    lat: Number(raw.wgs84Lat),
    lng: Number(raw.wgs84Lon),
    dutyTime: {
      mon: dayHoursOrNull(raw.dutyTime1s, raw.dutyTime1c),
      tue: dayHoursOrNull(raw.dutyTime2s, raw.dutyTime2c),
      wed: dayHoursOrNull(raw.dutyTime3s, raw.dutyTime3c),
      thu: dayHoursOrNull(raw.dutyTime4s, raw.dutyTime4c),
      fri: dayHoursOrNull(raw.dutyTime5s, raw.dutyTime5c),
      sat: dayHoursOrNull(raw.dutyTime6s, raw.dutyTime6c),
      sun: dayHoursOrNull(raw.dutyTime7s, raw.dutyTime7c),
      holiday: dayHoursOrNull(raw.dutyTime8s, raw.dutyTime8c),
    },
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
deno test supabase/functions/sync-pharmacies/parse.test.ts
```

Expected: PASS (2 tests)

> ⚠️ **검증 필요**: `dutyTime1~8`의 요일 매핑(1=월요일 vs 1=일요일)은 공공API 문서상 표기이며, 실제 서비스키로 API를 1회 호출해 응답 샘플을 확인하고 필요시 이 매핑을 수정한다. Task 3 Step 1에서 실제 응답을 확인하며 함께 검증한다.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/sync-pharmacies/parse.ts supabase/functions/sync-pharmacies/parse.test.ts
git commit -m "feat: 공공API 약국 응답 정규화 함수 추가"
```

---

## Task 3: Edge Function — 공공API 호출 및 upsert (캐시 유지 포함)

**Files:**
- Create: `supabase/functions/sync-pharmacies/index.ts`
- Create: `supabase/functions/.env.example`

**Interfaces:**
- Consumes: `normalizePharmacy`, `NormalizedPharmacy` from Task 2 (`./parse.ts`)
- Produces: `pharmacies` 테이블에 upsert된 데이터 (Task 1 스키마)

- [ ] **Step 1: 실제 API 응답으로 필드 매핑 검증**

```bash
curl -s "http://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyListInfoInqire?serviceKey=<발급받은_서비스키>&pageNo=1&numOfRows=1&_type=json"
```

응답의 `dutyTime1s`~`dutyTime8c` 실제 값을 보고, Task 2의 `dayHoursOrNull` 매핑(1=월~7=일, 8=공휴일)이 맞는지 확인한다. 다르면 `parse.ts`의 매핑과 테스트를 수정하고 재실행한다.

- [ ] **Step 2: 환경변수 예시 파일 작성**

`supabase/functions/.env.example`:

```
DATA_GOV_KEY=여기에_발급받은_서비스키
```

실제 키는 Supabase 대시보드 → Edge Functions → Secrets에 등록하고, `.env.example`은 커밋하되 실제 `.env`는 커밋하지 않는다 (`.gitignore`에 `supabase/functions/.env` 추가).

- [ ] **Step 3: Edge Function 구현**

`supabase/functions/sync-pharmacies/index.ts`:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizePharmacy, type RawPharmacyItem } from "./parse.ts";

const API_BASE = "http://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyListInfoInqire";
const PAGE_SIZE = 100;

async function fetchAllPharmacies(serviceKey: string): Promise<RawPharmacyItem[]> {
  const items: RawPharmacyItem[] = [];
  let pageNo = 1;

  while (true) {
    const url = `${API_BASE}?serviceKey=${serviceKey}&pageNo=${pageNo}&numOfRows=${PAGE_SIZE}&_type=json`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`공공API 응답 실패: ${res.status}`);
    }
    const json = await res.json();
    const body = json?.response?.body;
    const pageItems: RawPharmacyItem[] = body?.items?.item ?? [];
    items.push(...(Array.isArray(pageItems) ? pageItems : [pageItems]));

    const totalCount = body?.totalCount ?? 0;
    if (pageNo * PAGE_SIZE >= totalCount || pageItems.length === 0) break;
    pageNo += 1;
  }

  return items;
}

Deno.serve(async () => {
  const serviceKey = Deno.env.get("DATA_GOV_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!serviceKey || !supabaseUrl || !serviceRoleKey) {
    return new Response("환경변수 누락", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const rawItems = await fetchAllPharmacies(serviceKey);
    const normalized = rawItems.map(normalizePharmacy);

    const rows = normalized.map((p) => ({
      id: p.id,
      name: p.name,
      address: p.address,
      phone: p.phone,
      lat: p.lat,
      lng: p.lng,
      duty_time: p.dutyTime,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from("pharmacies").upsert(rows, { onConflict: "id" });
    if (error) throw error;

    return new Response(JSON.stringify({ synced: rows.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    // 공공API 실패 시 기존 캐시를 그대로 유지하고 실패만 로그로 남긴다.
    console.error("약국 데이터 동기화 실패, 캐시 유지:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
});
```

- [ ] **Step 4: 로컬에서 배포 및 수동 호출로 확인**

```bash
npx supabase functions deploy sync-pharmacies
npx supabase secrets set DATA_GOV_KEY=<발급받은_서비스키>
curl -X POST "https://<project-ref>.supabase.co/functions/v1/sync-pharmacies" \
  -H "Authorization: Bearer <SUPABASE_ANON_KEY>"
```

Expected: `{"synced": <건수>}` 응답, Supabase 대시보드 Table Editor에서 `pharmacies` 테이블에 데이터가 채워짐을 확인.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/sync-pharmacies/index.ts supabase/functions/.env.example .gitignore
git commit -m "feat: 공공API 동기화 Edge Function 추가"
```

---

## Task 4: 1시간 주기 cron 스케줄링

**Files:**
- Create: `supabase/migrations/0002_sync_cron.sql`

**Interfaces:**
- Consumes: Task 3의 `sync-pharmacies` Edge Function (HTTPS 엔드포인트)

- [ ] **Step 1: pg_cron + pg_net 확장 및 스케줄 작성**

`supabase/migrations/0002_sync_cron.sql`:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'sync-pharmacies-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := '<https://PROJECT_REF.supabase.co/functions/v1/sync-pharmacies>',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SUPABASE_ANON_KEY>',
      'Content-Type', 'application/json'
    )
  );
  $$
);
```

`<PROJECT_REF>`와 `<SUPABASE_ANON_KEY>`를 실제 값으로 치환한다.

- [ ] **Step 2: 마이그레이션 적용**

```bash
npx supabase db push
```

- [ ] **Step 3: cron 등록 확인**

Supabase SQL Editor에서 실행:

```sql
select * from cron.job where jobname = 'sync-pharmacies-hourly';
```

Expected: 1행 반환, `schedule` 컬럼이 `0 * * * *`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_sync_cron.sql
git commit -m "feat: 약국 데이터 1시간 주기 동기화 cron 등록"
```

---

## Task 5: 프론트엔드 도메인 타입 및 영업시간 판정 로직

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/businessHours.ts`
- Test: `src/domain/businessHours.test.ts`
- Modify: `package.json` (vitest 추가)
- Create: `vitest.config.ts`

**Interfaces:**
- Produces:
  - `type DayHours`, `type DutyTime`, `type Pharmacy` (Task 3의 `duty_time`/컬럼과 1:1 대응, `src/domain/types.ts`)
  - `function isOpenNow(dutyTime: DutyTime, now: Date): boolean`
  - `function isNightHours(dutyTime: DutyTime, now: Date, nightStartHHmm?: string): boolean`
  - `function isHolidayOpen(dutyTime: DutyTime): boolean`

- [ ] **Step 1: Vitest 설치 및 설정**

```bash
npm install -D vitest
```

`vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

`package.json`의 `scripts`에 추가:

```json
"test": "vitest run"
```

- [ ] **Step 2: 타입 정의**

`src/domain/types.ts`:

```typescript
export type DayHours = { open: string; close: string };

export type DutyTime = {
  mon: DayHours | null;
  tue: DayHours | null;
  wed: DayHours | null;
  thu: DayHours | null;
  fri: DayHours | null;
  sat: DayHours | null;
  sun: DayHours | null;
  holiday: DayHours | null;
};

export type Pharmacy = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  lat: number;
  lng: number;
  dutyTime: DutyTime;
  source: string;
  updatedAt: string;
};
```

- [ ] **Step 3: 실패하는 테스트 작성**

`src/domain/businessHours.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { isOpenNow, isNightHours, isHolidayOpen } from './businessHours';
import type { DutyTime } from './types';

const baseDutyTime: DutyTime = {
  mon: { open: '0900', close: '1800' },
  tue: { open: '0900', close: '1800' },
  wed: { open: '0900', close: '1800' },
  thu: { open: '0900', close: '1800' },
  fri: { open: '0900', close: '2300' },
  sat: null,
  sun: null,
  holiday: null,
};

describe('isOpenNow', () => {
  it('영업시간 내면 true를 반환한다', () => {
    // 2026-08-17은 월요일
    const now = new Date('2026-08-17T10:00:00+09:00');
    expect(isOpenNow(baseDutyTime, now)).toBe(true);
  });

  it('영업시간 밖이면 false를 반환한다', () => {
    const now = new Date('2026-08-17T20:00:00+09:00');
    expect(isOpenNow(baseDutyTime, now)).toBe(false);
  });

  it('해당 요일이 휴무(null)이면 false를 반환한다', () => {
    // 2026-08-15는 토요일
    const now = new Date('2026-08-15T10:00:00+09:00');
    expect(isOpenNow(baseDutyTime, now)).toBe(false);
  });
});

describe('isNightHours', () => {
  it('기본 심야 기준(22:00) 이후 영업하면 true를 반환한다', () => {
    // 2026-08-21은 금요일, 23:00까지 영업
    const now = new Date('2026-08-21T22:30:00+09:00');
    expect(isNightHours(baseDutyTime, now)).toBe(true);
  });

  it('심야 기준 이전에 영업이 끝나면 false를 반환한다', () => {
    // 2026-08-17은 월요일, 18:00까지 영업
    const now = new Date('2026-08-17T22:30:00+09:00');
    expect(isNightHours(baseDutyTime, now)).toBe(false);
  });
});

describe('isHolidayOpen', () => {
  it('holiday 필드가 있으면 true를 반환한다', () => {
    const dutyTime: DutyTime = { ...baseDutyTime, holiday: { open: '1000', close: '1300' } };
    expect(isHolidayOpen(dutyTime)).toBe(true);
  });

  it('holiday 필드가 null이면 false를 반환한다', () => {
    expect(isHolidayOpen(baseDutyTime)).toBe(false);
  });
});
```

- [ ] **Step 4: 테스트 실패 확인**

```bash
npm test
```

Expected: FAIL — `src/domain/businessHours.ts`가 존재하지 않음

- [ ] **Step 5: 구현 작성**

`src/domain/businessHours.ts`:

```typescript
import type { DayHours, DutyTime } from './types';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function todayHours(dutyTime: DutyTime, now: Date): DayHours | null {
  const key = DAY_KEYS[now.getDay()];
  return dutyTime[key];
}

function toMinutes(hhmm: string): number {
  const hours = Number(hhmm.slice(0, 2));
  const minutes = Number(hhmm.slice(2, 4));
  return hours * 60 + minutes;
}

function nowMinutes(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

export function isOpenNow(dutyTime: DutyTime, now: Date): boolean {
  const hours = todayHours(dutyTime, now);
  if (!hours) return false;

  const current = nowMinutes(now);
  const open = toMinutes(hours.open);
  const close = toMinutes(hours.close);

  if (close < open) {
    // 자정을 넘겨 영업하는 경우 (예: 22:00 ~ 02:00)
    return current >= open || current <= close;
  }
  return current >= open && current <= close;
}

export function isNightHours(dutyTime: DutyTime, now: Date, nightStartHHmm = '2200'): boolean {
  const hours = todayHours(dutyTime, now);
  if (!hours) return false;

  const nightStart = toMinutes(nightStartHHmm);
  const close = toMinutes(hours.close);

  // 마감 시간이 심야 기준 이후(또는 자정을 넘김)면 심야 영업으로 간주
  return close >= nightStart || close < toMinutes(hours.open);
}

export function isHolidayOpen(dutyTime: DutyTime): boolean {
  return dutyTime.holiday !== null;
}
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
npm test
```

Expected: PASS (7 tests)

- [ ] **Step 7: Commit**

```bash
git add src/domain package.json vitest.config.ts package-lock.json
git commit -m "feat: 약국 영업시간 판정 도메인 로직 추가"
```

---

## Task 6: Supabase 클라이언트 및 약국 조회 훅

**Files:**
- Create: `src/lib/supabaseClient.ts`
- Create: `src/hooks/usePharmacies.ts`
- Create: `.env.example`
- Modify: `package.json` (`@supabase/supabase-js` 추가)

**Interfaces:**
- Consumes: `Pharmacy` type from Task 5 (`src/domain/types.ts`)
- Produces:
  - `supabase: SupabaseClient` (`src/lib/supabaseClient.ts`)
  - `function usePharmacies(query: { type: 'nearby'; lat: number; lng: number } | { type: 'region'; regionPrefix: string }): { pharmacies: Pharmacy[]; loading: boolean; error: string | null; refetch: () => void }`

- [ ] **Step 1: Supabase JS 설치**

```bash
npm install @supabase/supabase-js
```

- [ ] **Step 2: 환경변수 예시 작성**

`.env.example`:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

로컬에서는 이 내용을 복사해 `.env`로 만들고 실제 값을 채운다 (`.env`는 이미 `.gitignore`의 `*.local` 패턴에 해당하지 않으므로 `.gitignore`에 `.env`를 추가한다).

- [ ] **Step 3: Supabase 클라이언트 작성**

`src/lib/supabaseClient.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY 환경변수가 필요해요.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
```

- [ ] **Step 4: 약국 조회 훅 작성**

`src/hooks/usePharmacies.ts`:

```typescript
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Pharmacy } from '../domain/types';

type PharmacyRow = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  lat: number;
  lng: number;
  duty_time: Pharmacy['dutyTime'];
  source: string;
  updated_at: string;
};

function toPharmacy(row: PharmacyRow): Pharmacy {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    lat: row.lat,
    lng: row.lng,
    dutyTime: row.duty_time,
    source: row.source,
    updatedAt: row.updated_at,
  };
}

export type PharmacyQuery =
  | { type: 'nearby'; lat: number; lng: number }
  | { type: 'region'; regionPrefix: string };

export function usePharmacies(query: PharmacyQuery) {
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPharmacies = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (query.type === 'nearby') {
      const { data, error: rpcError } = await supabase.rpc('nearby_pharmacies', {
        target_lat: query.lat,
        target_lng: query.lng,
        max_distance_meters: 5000,
      });
      if (rpcError) {
        setError(rpcError.message);
        setPharmacies([]);
      } else {
        setPharmacies(((data ?? []) as PharmacyRow[]).map(toPharmacy));
      }
    } else {
      const { data, error: queryError } = await supabase
        .from('pharmacies')
        .select('*')
        .ilike('address', `${query.regionPrefix}%`)
        .order('name', { ascending: true });
      if (queryError) {
        setError(queryError.message);
        setPharmacies([]);
      } else {
        setPharmacies(((data ?? []) as PharmacyRow[]).map(toPharmacy));
      }
    }

    setLoading(false);
  }, [query.type, query.type === 'nearby' ? query.lat : query.regionPrefix, query.type === 'nearby' ? query.lng : null]);

  useEffect(() => {
    fetchPharmacies();
  }, [fetchPharmacies]);

  return { pharmacies, loading, error, refetch: fetchPharmacies };
}
```

- [ ] **Step 5: 거리순 조회용 Postgres 함수 추가 마이그레이션**

`supabase/migrations/0003_nearby_pharmacies.sql`:

```sql
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
```

```bash
npx supabase db push
```

- [ ] **Step 6: 빌드로 타입 오류 확인**

```bash
npx tsc -b --noEmit
```

Expected: 에러 없음

- [ ] **Step 7: Commit**

```bash
git add src/lib src/hooks/usePharmacies.ts .env.example .gitignore package.json package-lock.json supabase/migrations/0003_nearby_pharmacies.sql
git commit -m "feat: Supabase 약국 조회 클라이언트/훅 추가"
```

---

## Task 7: 위치 훅 (GPS + 지역 선택 폴백)

**Files:**
- Create: `src/hooks/useLocation.ts`
- Modify: `apps-in-toss.config.ts`

**Interfaces:**
- Produces: `type LocationState = { status: 'loading' } | { status: 'granted'; lat: number; lng: number } | { status: 'fallback' }` 와 `function useLocation(): { state: LocationState; requestAgain: () => void }`

- [ ] **Step 1: 위치 권한 설정 추가**

`apps-in-toss.config.ts`의 `permissions: []`를 다음으로 수정:

```typescript
  permissions: ['geolocation'],
```

- [ ] **Step 2: 훅 구현**

`src/hooks/useLocation.ts`:

```typescript
import { useCallback, useEffect, useState } from 'react';
import { Accuracy, Device, GetCurrentLocationPermissionError } from '@apps-in-toss/web-framework';

export type LocationState =
  | { status: 'loading' }
  | { status: 'granted'; lat: number; lng: number }
  | { status: 'fallback' };

export function useLocation() {
  const [state, setState] = useState<LocationState>({ status: 'loading' });

  const requestAgain = useCallback(() => {
    setState({ status: 'loading' });

    Device.getLocation({ accuracy: Accuracy.Balanced })
      .then((location) => {
        setState({ status: 'granted', lat: location.coords.latitude, lng: location.coords.longitude });
      })
      .catch((error) => {
        if (error instanceof GetCurrentLocationPermissionError) {
          setState({ status: 'fallback' });
          return;
        }
        setState({ status: 'fallback' });
      });
  }, []);

  useEffect(() => {
    requestAgain();
  }, [requestAgain]);

  return { state, requestAgain };
}
```

- [ ] **Step 3: 타입 체크**

```bash
npx tsc -b --noEmit
```

Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useLocation.ts apps-in-toss.config.ts
git commit -m "feat: GPS 위치 권한 및 지역 선택 폴백 훅 추가"
```

---

## Task 8: TDS 설치 + 지역 선택 화면

**Files:**
- Modify: `package.json` (`@toss/tds-mobile`, `@toss/tds-mobile-ait`, `@emotion/react` 추가)
- Create: `src/domain/regions.ts`
- Create: `src/components/RegionPicker.tsx`

**Interfaces:**
- Consumes: 없음 (독립 컴포넌트)
- Produces: `REGIONS: string[]` (`src/domain/regions.ts`), `function RegionPicker(props: { onSelect: (regionPrefix: string) => void }): JSX.Element`

- [ ] **Step 1: TDS 패키지 설치**

```bash
npm install @toss/tds-mobile @toss/tds-mobile-ait @emotion/react@^11
```

- [ ] **Step 2: TDS 컴포넌트 API 확인**

이 태스크부터는 `List`, `ListRow` 외에 `Top`, `Paragraph` 등 다른 TDS 컴포넌트도 처음 쓴다. 구현 전에 `apps-in-toss` MCP 도구로 정확한 props를 확인한다:

```
mcp__apps-in-toss__searchDocumentation("Top 컴포넌트 사용법")
mcp__apps-in-toss__searchDocumentation("Paragraph 컴포넌트 사용법")
```

문서에 나온 정확한 props로 아래 Step들의 예시 코드를 조정한다 (아래 코드는 `List`/`ListRow`/`Button`처럼 확인된 API를 기준으로 작성했고, `Top`/`Paragraph`는 문서 확인 후 맞는 형태로 채운다).

- [ ] **Step 3: 지역 목록 정의**

`src/domain/regions.ts`:

```typescript
export const REGIONS = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시',
  '대전광역시', '울산광역시', '세종특별자치시', '경기도', '강원특별자치도',
  '충청북도', '충청남도', '전북특별자치도', '전라남도', '경상북도',
  '경상남도', '제주특별자치도',
] as const;
```

- [ ] **Step 4: 컴포넌트 작성 (TDS List/ListRow 기반)**

`src/components/RegionPicker.tsx`:

```tsx
import { List, ListRow, Top } from '@toss/tds-mobile';
import { REGIONS } from '../domain/regions';

type RegionPickerProps = {
  onSelect: (regionPrefix: string) => void;
};

export function RegionPicker({ onSelect }: RegionPickerProps) {
  return (
    <div>
      <Top title="지역을 선택해 주세요" description="위치 정보를 사용할 수 없어 지역으로 약국을 찾아드려요." />
      <List>
        {REGIONS.map((region) => (
          <ListRow
            key={region}
            contents={<ListRow.Texts type="1RowTypeA" top={region} />}
            onClick={() => onSelect(region)}
          />
        ))}
      </List>
    </div>
  );
}
```

- [ ] **Step 5: 타입 체크**

```bash
npx tsc -b --noEmit
```

Expected: 에러 없음

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/domain/regions.ts src/components/RegionPicker.tsx
git commit -m "feat: TDS 설치 및 시/도 지역 선택 화면 추가"
```

---

## Task 9: 필터 바 (지금 영업중 / 심야 / 공휴일)

**Files:**
- Create: `src/components/FilterBar.tsx`

**Interfaces:**
- Consumes: `isOpenNow`, `isNightHours`, `isHolidayOpen` from Task 5 (사용은 Task 10의 목록 화면에서)
- Produces: `type FilterKey = 'openNow' | 'night' | 'holiday'`, `function FilterBar(props: { active: FilterKey[]; onToggle: (key: FilterKey) => void }): JSX.Element`

- [ ] **Step 1: Badge 컴포넌트 API 확인**

```
mcp__apps-in-toss__searchDocumentation("Badge 컴포넌트 토글 선택 사용법")
```

`Badge`가 토글형 선택 표시에 적합한지 확인하고, 맞지 않으면 `Button`(`variant="weak"`/`variant="fill"` 등 선택 상태를 표현하는 variant)으로 대체한다.

- [ ] **Step 2: 컴포넌트 작성**

`src/components/FilterBar.tsx`:

```tsx
import { Badge } from '@toss/tds-mobile';

export type FilterKey = 'openNow' | 'night' | 'holiday';

const FILTER_LABELS: Record<FilterKey, string> = {
  openNow: '지금 영업중',
  night: '심야 영업',
  holiday: '공휴일 영업',
};

type FilterBarProps = {
  active: FilterKey[];
  onToggle: (key: FilterKey) => void;
};

export function FilterBar({ active, onToggle }: FilterBarProps) {
  return (
    <div role="group" aria-label="약국 필터" style={{ display: 'flex', gap: 8, padding: '0 16px' }}>
      {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => (
        <Badge
          key={key}
          type="button"
          aria-pressed={active.includes(key)}
          variant={active.includes(key) ? 'blue' : 'gray'}
          onClick={() => onToggle(key)}
        >
          {FILTER_LABELS[key]}
        </Badge>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: 타입 체크**

```bash
npx tsc -b --noEmit
```

Expected: 에러 없음. `Badge`의 실제 props 이름이 문서와 다르면(Step 1에서 확인한 대로) 그에 맞춰 수정한다.

- [ ] **Step 4: Commit**

```bash
git add src/components/FilterBar.tsx
git commit -m "feat: 영업중/심야/공휴일 필터 바 추가"
```

---

## Task 10: 약국 카드 + 홈 화면 (목록 통합)

**Files:**
- Create: `src/components/PharmacyCard.tsx`
- Create: `src/components/ComplianceNotice.tsx`
- Create: `src/pages/HomePage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useLocation` (Task 7), `usePharmacies` (Task 6), `RegionPicker` (Task 8), `FilterBar`/`FilterKey` (Task 9), `isOpenNow`/`isNightHours`/`isHolidayOpen` (Task 5), `Pharmacy` type (Task 5)
- Produces: `function HomePage(): JSX.Element` — 다음 태스크(상세 화면)에서 카드 클릭 시 이동할 라우팅 지점

- [ ] **Step 1: 상시 고지 컴포넌트 (TDS Paragraph)**

`src/components/ComplianceNotice.tsx`:

```tsx
import { Paragraph } from '@toss/tds-mobile';

export function ComplianceNotice() {
  return (
    <Paragraph typography="st10" color="grey700" style={{ padding: '8px 16px' }}>
      본 서비스는 예약·추천 기능이 없으며, 공공데이터를 동일한 기준으로 제공해요.
    </Paragraph>
  );
}
```

Step 1에서 확인한 실제 `Paragraph` props(예: `typography`, `color` 이름)로 맞춘다.

- [ ] **Step 2: 약국 카드 컴포넌트 (TDS ListRow)**

`src/components/PharmacyCard.tsx`:

```tsx
import { ListRow, Badge } from '@toss/tds-mobile';
import type { Pharmacy } from '../domain/types';
import { isOpenNow } from '../domain/businessHours';

type PharmacyCardProps = {
  pharmacy: Pharmacy;
  onClick: (pharmacy: Pharmacy) => void;
};

export function PharmacyCard({ pharmacy, onClick }: PharmacyCardProps) {
  const open = isOpenNow(pharmacy.dutyTime, new Date());

  return (
    <ListRow
      contents={
        <ListRow.Texts
          type="2RowTypeA"
          top={pharmacy.name}
          bottom={pharmacy.address}
        />
      }
      right={
        <Badge variant={open ? 'blue' : 'gray'}>{open ? '영업중' : '영업종료'}</Badge>
      }
      onClick={() => onClick(pharmacy)}
    />
  );
}
```

- [ ] **Step 3: 홈 화면 통합 (TDS List)**

`src/pages/HomePage.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { List, Top, Paragraph } from '@toss/tds-mobile';
import { useLocation } from '../hooks/useLocation';
import { usePharmacies } from '../hooks/usePharmacies';
import { RegionPicker } from '../components/RegionPicker';
import { FilterBar, type FilterKey } from '../components/FilterBar';
import { PharmacyCard } from '../components/PharmacyCard';
import { ComplianceNotice } from '../components/ComplianceNotice';
import { isOpenNow, isNightHours, isHolidayOpen } from '../domain/businessHours';
import type { Pharmacy } from '../domain/types';

type HomePageProps = {
  onSelectPharmacy: (pharmacy: Pharmacy) => void;
};

export function HomePage({ onSelectPharmacy }: HomePageProps) {
  const { state: locationState } = useLocation();
  const [regionPrefix, setRegionPrefix] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<FilterKey[]>([]);

  const query =
    locationState.status === 'granted'
      ? { type: 'nearby' as const, lat: locationState.lat, lng: locationState.lng }
      : regionPrefix
        ? { type: 'region' as const, regionPrefix }
        : null;

  const { pharmacies, loading, error, refetch } = usePharmacies(
    query ?? { type: 'region', regionPrefix: '__none__' },
  );

  const toggleFilter = (key: FilterKey) => {
    setActiveFilters((prev) => (prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]));
  };

  const filteredPharmacies = useMemo(() => {
    const now = new Date();
    return pharmacies.filter((pharmacy) => {
      if (activeFilters.includes('openNow') && !isOpenNow(pharmacy.dutyTime, now)) return false;
      if (activeFilters.includes('night') && !isNightHours(pharmacy.dutyTime, now)) return false;
      if (activeFilters.includes('holiday') && !isHolidayOpen(pharmacy.dutyTime)) return false;
      return true;
    });
  }, [pharmacies, activeFilters]);

  if (locationState.status === 'loading') {
    return <Paragraph typography="st10">위치 정보를 확인하는 중이에요...</Paragraph>;
  }

  if (locationState.status === 'fallback' && !regionPrefix) {
    return <RegionPicker onSelect={setRegionPrefix} />;
  }

  return (
    <div>
      <Top title="언제나 약국" description="지금 문 연 약국을 찾아보세요." />
      <ComplianceNotice />
      <FilterBar active={activeFilters} onToggle={toggleFilter} />
      {loading && <Paragraph typography="st10">약국 정보를 불러오는 중이에요...</Paragraph>}
      {error && (
        <div>
          <Paragraph typography="st10">정보를 불러오지 못했어요.</Paragraph>
          <button type="button" onClick={refetch}>다시 시도</button>
        </div>
      )}
      {!loading && !error && filteredPharmacies.length === 0 && (
        <Paragraph typography="st10">주변에 등록된 약국이 없어요.</Paragraph>
      )}
      <List>
        {filteredPharmacies.map((pharmacy) => (
          <PharmacyCard key={pharmacy.id} pharmacy={pharmacy} onClick={onSelectPharmacy} />
        ))}
      </List>
    </div>
  );
}
```

- [ ] **Step 4: App.tsx에서 홈 화면 연결**

`src/App.tsx`를 열어 기존 `InAppAdsPage` 렌더링을 제거하고, `HomePage`를 렌더링하도록 교체한다 (상세 화면 라우팅은 Task 11에서 이어서 연결).

```tsx
import { useState } from 'react';
import { HomePage } from './pages/HomePage';
import type { Pharmacy } from './domain/types';
import './App.css';

function App() {
  const [selectedPharmacy, setSelectedPharmacy] = useState<Pharmacy | null>(null);

  if (selectedPharmacy) {
    // Task 11에서 PharmacyDetailPage로 교체
    return <button type="button" onClick={() => setSelectedPharmacy(null)}>목록으로</button>;
  }

  return <HomePage onSelectPharmacy={setSelectedPharmacy} />;
}

export default App;
```

- [ ] **Step 5: 개발 서버로 확인**

```bash
npm run dev
```

브라우저(또는 앱인토스 샌드박스)에서 홈 화면이 로딩되고, 위치 실패 시 지역 선택 화면이 뜨는지 확인한다.

- [ ] **Step 6: Commit**

```bash
git add src/components/PharmacyCard.tsx src/components/ComplianceNotice.tsx src/pages/HomePage.tsx src/App.tsx
git commit -m "feat: TDS 기반 약국 목록 홈 화면 구현"
```

---

## Task 11: 약국 상세 화면

**Files:**
- Create: `src/pages/PharmacyDetailPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `Pharmacy`, `DutyTime` types (Task 5)
- Produces: `function PharmacyDetailPage(props: { pharmacy: Pharmacy; onBack: () => void }): JSX.Element`

- [ ] **Step 1: Navigation 컴포넌트 API 확인**

```
mcp__apps-in-toss__searchDocumentation("Navigation 컴포넌트 뒤로가기 title 사용법")
```

문서에서 확인한 실제 props(뒤로가기 핸들러, title 등)로 아래 예시의 `Navigation` 사용부를 맞춘다.

- [ ] **Step 2: 상세 화면 구현 (TDS Navigation/List/ListRow)**

`src/pages/PharmacyDetailPage.tsx`:

```tsx
import { Navigation, List, ListRow, Paragraph } from '@toss/tds-mobile';
import type { Pharmacy, DutyTime } from '../domain/types';

const DAY_LABELS: Array<[keyof DutyTime, string]> = [
  ['mon', '월요일'], ['tue', '화요일'], ['wed', '수요일'], ['thu', '목요일'],
  ['fri', '금요일'], ['sat', '토요일'], ['sun', '일요일'], ['holiday', '공휴일'],
];

function formatHHmm(value: string): string {
  return `${value.slice(0, 2)}:${value.slice(2, 4)}`;
}

type PharmacyDetailPageProps = {
  pharmacy: Pharmacy;
  onBack: () => void;
};

export function PharmacyDetailPage({ pharmacy, onBack }: PharmacyDetailPageProps) {
  return (
    <div>
      <Navigation title={pharmacy.name} onClickBack={onBack} />
      <Paragraph typography="st10">{pharmacy.address}</Paragraph>
      {pharmacy.phone && (
        <a href={`tel:${pharmacy.phone}`}>
          <Paragraph typography="st10" color="blue500">{pharmacy.phone}</Paragraph>
        </a>
      )}

      <List>
        {DAY_LABELS.map(([key, label]) => {
          const hours = pharmacy.dutyTime[key];
          return (
            <ListRow
              key={key}
              contents={<ListRow.Texts type="1RowTypeA" top={label} />}
              right={
                <Paragraph typography="st10">
                  {hours ? `${formatHHmm(hours.open)} ~ ${formatHHmm(hours.close)}` : '휴무'}
                </Paragraph>
              }
            />
          );
        })}
      </List>

      <Paragraph typography="st11" color="grey500" style={{ padding: '8px 16px' }}>
        {pharmacy.source} · {new Date(pharmacy.updatedAt).toLocaleString('ko-KR')} 기준
      </Paragraph>
    </div>
  );
}
```

Step 1에서 확인한 `Navigation`의 실제 props 이름(예: `onClickBack`이 아닐 수 있음)으로 맞춘다.

- [ ] **Step 3: App.tsx에서 상세 화면 연결**

`src/App.tsx`의 임시 버튼을 `PharmacyDetailPage`로 교체:

```tsx
import { useState } from 'react';
import { HomePage } from './pages/HomePage';
import { PharmacyDetailPage } from './pages/PharmacyDetailPage';
import type { Pharmacy } from './domain/types';
import './App.css';

function App() {
  const [selectedPharmacy, setSelectedPharmacy] = useState<Pharmacy | null>(null);

  if (selectedPharmacy) {
    return (
      <PharmacyDetailPage
        pharmacy={selectedPharmacy}
        onBack={() => setSelectedPharmacy(null)}
      />
    );
  }

  return <HomePage onSelectPharmacy={setSelectedPharmacy} />;
}

export default App;
```

- [ ] **Step 4: 개발 서버로 확인**

```bash
npm run dev
```

목록에서 카드를 클릭하면 상세 화면으로 이동하고, 데이터 출처/갱신시각이 표시되는지 확인한다.

- [ ] **Step 5: Commit**

```bash
git add src/pages/PharmacyDetailPage.tsx src/App.tsx
git commit -m "feat: TDS 기반 약국 상세 화면 구현"
```

---

## Task 12: 기존 예제 코드 정리

**Files:**
- Delete: `src/hooks/useInAppAds.tsx`
- Delete: `src/pages/InAppAdsPage.tsx`
- Delete: `src/pages/InAppAdsPage.css`

**Interfaces:**
- Consumes: 없음
- Produces: 없음 (정리 작업)

- [ ] **Step 1: 미사용 예제 파일 삭제**

```bash
git rm src/hooks/useInAppAds.tsx src/pages/InAppAdsPage.tsx src/pages/InAppAdsPage.css
```

- [ ] **Step 2: 빌드로 참조 누락 확인**

```bash
npx tsc -b --noEmit
npm run build
```

Expected: 에러 없음 (삭제된 파일을 참조하는 곳이 없어야 함)

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: 템플릿 기본 예제(in-app-ads) 코드 제거"
```

---

## Self-Review 결과

- **스펙 커버리지**: 데이터 모델(Task 1), 캐싱/1시간 갱신/장애 시 캐시 유지(Task 3, 4), 화면 흐름 5개 전부(Task 8~11), 권한 설정(Task 7), 에러 처리 4가지 전부(Task 10 loading/error/empty, Task 7 fallback) 모두 태스크로 커버됨
- **비용/운영(Free 플랜)**: 별도 인프라 추가 없이 Supabase 단일 프로젝트로 구성해 Global Constraints를 만족
- **타입 일관성**: `DutyTime`/`Pharmacy`가 Task 5에서 정의되고 이후 모든 태스크(6, 7, 9, 10, 11)에서 동일하게 재사용됨. Edge Function 쪽(`NormalizedPharmacy`, Task 2~3)과 프론트 쪽(`Pharmacy`, Task 5) 타입은 이름은 다르지만 필드 구조가 1:1 대응하도록 맞춤
- **디자인**: Task 8부터 TDS(`@toss/tds-mobile`) 컴포넌트를 도입해 직접 만든 CSS 대신 토스 디자인 시스템을 사용하도록 전 화면(Task 8~11)을 재작성함. `Navigation`/`Top`/`Badge`/`Paragraph`는 정확한 props를 문서로 확인 못했으므로, 각 태스크 실행 시 `apps-in-toss` MCP 도구로 먼저 확인하는 단계를 넣어둠 — 실행 담당자가 이 부분은 반드시 검증 후 코드를 조정해야 함
