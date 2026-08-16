# 언제나 약국 — 설계 스펙

날짜: 2026-08-16

## 배경 및 목적

공공데이터 기반 의료 정보 조회 서비스로, 앱인토스(App-in-Toss) 미니앱으로 출시한다. 다음 조건을 모두 충족해야 한다.

- 공공데이터 기반 의료 정보 조회만 제공
- 순위, 추천, 예약 기능 없음
- 약국 목록을 동일 기준으로 노출
- 데이터 출처 명시
- 약국 광고비 및 유료 프로모션 없음 (약국으로부터 금전 수취 불가)

핵심 기능은 심야/공휴일 영업 약국 조회다.

## 데이터 출처

국립중앙의료원 "전국 약국 정보 조회 서비스" (공공데이터포털, data.go.kr). 활용 승인 완료, 서비스키 발급 완료. 요일별(월~일) 및 공휴일 영업시간(dutyTime1~8s/c) 필드를 포함해 심야/공휴일 필터링에 그대로 사용 가능.

## 아키텍처

```
앱인토스 미니앱 (React + @apps-in-toss/web-framework)
        │  Supabase publishable key로 조회(select)
        ▼
Supabase Postgres — pharmacies 캐시 테이블 (RLS: 읽기 전용 공개)
        ▲  upsert
        │  1시간마다 cron 트리거
Supabase Edge Function — 공공데이터포털 서비스키(secret) 보관, 국립중앙의료원 API 호출/정규화
        │
        ▼
국립중앙의료원 전국 약국 정보 조회 서비스 (data.go.kr)
```

**결정 근거**
- 공공데이터포털 서비스키는 secret이므로 클라이언트에 노출 불가. 또한 국립중앙의료원 서버가 앱인토스 도메인을 CORS 허용하지 않을 가능성이 높아 클라이언트 직접 호출은 사실상 불가 → 서버(프록시) 필수
- 공공API는 운영권한 기준 일 100만 건까지 허용되어 트래픽 쿼터는 캐싱의 이유가 아님. 캐싱의 목적은 응답속도 확보와 공공API 장애로부터 서비스 독립성을 갖기 위함
- 앱인토스 공식 문서(ai-vibe-coding/integration/supabase)가 안내하는 표준 연동 패턴을 따름

## 데이터 모델 (Supabase Postgres)

```sql
create extension if not exists earthdistance cascade;

create table pharmacies (
  id text primary key,              -- 공공데이터 hpid
  name text not null,
  address text not null,
  phone text,
  lat double precision not null,
  lng double precision not null,
  duty_time jsonb not null,         -- 요일별(월~일) + 공휴일 {open, close} 8세트
  source text not null default '국립중앙의료원 전국 약국 정보 조회 서비스',
  updated_at timestamptz not null default now()
);

create index pharmacies_geo_idx on pharmacies using gist (ll_to_earth(lat, lng));
```

- RLS: `select`만 공개 허용, `insert`/`update`/`delete`는 service_role(Edge Function)만 가능
- 정렬 기준은 항상 하나로 고정: GPS 조회 시 거리순, 지역 선택 조회 시 이름순. 순위/추천 로직 없음

## 캐싱 및 갱신 전략

- Edge Function을 1시간 주기 cron(pg_cron 또는 Supabase Scheduled Function)으로 트리거
- 공공API를 페이지네이션 호출하여 전체 약국 데이터를 `upsert`
- **공공API 호출 실패 시**: 기존 캐시 데이터를 그대로 유지(삭제/덮어쓰기 금지), 실패 사실만 로그로 남김. 클라이언트는 항상 마지막 성공 시점 데이터를 받으며, 서비스가 중단되지 않음
- 약국 상세 화면에 데이터 갱신 시각(`updated_at`)을 함께 노출해 데이터 신선도를 사용자에게 투명하게 전달

## 화면 흐름

1. **홈**: `Device.getLocation`으로 GPS 권한 요청 → 허용 시 현재 위치 기준 약국 리스트(거리순). 거부/실패 시 지역(시/도 → 시/군/구) 선택 화면으로 자동 폴백
2. **필터**: "지금 영업중" / "심야 영업(예: 22시 이후)" / "공휴일 영업" 토글. 순위·추천 문구 없음
3. **리스트 카드**: 약국명, 거리, 현재 영업상태, 주소. 모든 카드 동일한 정보 구성, 특정 약국 강조 없음
4. **상세**: 주소, 전화걸기 연결, 요일별 전체 영업시간표, 데이터 출처 및 갱신시각 명시
5. **상시 고지**: 설정/정보 화면 등에 "본 서비스는 예약·추천 기능이 없으며, 공공데이터를 동일 기준으로 제공합니다" 문구 상시 노출

## 권한

`apps-in-toss.config.ts`의 `permissions`에 `geolocation` 추가 필요 (현재 빈 배열).

## 에러 처리

| 상황 | 처리 |
|---|---|
| GPS 권한 거부/실패 | 지역 선택 화면으로 자동 폴백 (에러 화면 아님) |
| Supabase 조회 실패 | 1회 재시도 → 실패 시 안내 문구 + 새로고침 버튼 |
| 공공API 호출 실패 (Edge Function) | 캐시 유지, 로그만 기록 |
| 반경 내 약국 0건 | "주변에 등록된 약국이 없어요" 빈 상태 + 지역 선택 유도 |

## 테스트 계획

- Edge Function: 공공API 응답 파싱/정규화, 실패 시 캐시 유지 로직 단위 테스트
- 프론트: 심야/공휴일/영업중 판정 함수(핵심 도메인 로직) 단위 테스트
- 수동 테스트: 앱인토스 샌드박스에서 GPS 허용/거부 경로, 지역 선택 경로 확인

## 범위 밖 (Out of scope)

- 병원 정보 조회 (약국만)
- 사용자 리뷰/평점, 즐겨찾기
- 예약, 순위, 추천
- 약국 대상 광고/프로모션 판매
