# 언제나 약국

공공데이터(국립중앙의료원 전국 약국 정보 조회 서비스) 기반으로 심야/공휴일 영업 약국을 조회하는 앱인토스(App-in-Toss) 미니앱이에요. 순위·추천·예약·광고 없이 동일 기준으로 약국 정보만 제공해요.

자세한 설계 배경은 [`docs/superpowers/specs/2026-08-16-anytime-pharmacy-design.md`](docs/superpowers/specs/2026-08-16-anytime-pharmacy-design.md)를 참고하세요.

## 핵심 기능

- GPS 위치 기반 주변 약국 조회(거리순), 권한 거부 시 지역(시/도 → 시/군/구) 선택 폴백
- "지금 영업중" / "심야 영업" / "공휴일 영업" 필터
- 카카오맵 기반 지도 뷰, 목록/지도 동시 표시
- 약국 상세: 요일별 전체 영업시간표, 전화 연결, 데이터 갱신 시각 표시

## 아키텍처

```
앱인토스 미니앱 (React + @apps-in-toss/web-framework)
        │  Supabase publishable key로 조회(select)
        ▼
Supabase Postgres — pharmacies 캐시 테이블 (RLS: 읽기 전용 공개)
        ▲  upsert
        │  pg_cron으로 1시간마다 트리거
Supabase Edge Function — 공공데이터포털 서비스키(secret) 보관, 국립중앙의료원 API 호출/정규화
        │
        ▼
국립중앙의료원 전국 약국 정보 조회 서비스 (data.go.kr)
```

- 클라이언트는 캐시된 데이터만 읽고, 공공데이터포털 서비스키는 Edge Function 밖으로 노출되지 않아요.
- 공공 API 호출이 실패해도 기존 캐시를 유지해 서비스가 끊기지 않도록 했어요.

## 기술 스택

React 19, TypeScript, Vite, Supabase(Postgres, Edge Functions, pg_cron), TanStack Query/Virtual, Toss Design System(TDS), 카카오맵 SDK, Vitest, Deno(Edge Function 테스트)

## 개발

```bash
npm run dev      # 개발 서버
npm run build    # 타입체크 + 빌드
npm run deploy   # 앱인토스 배포
npm run test           # 프론트 도메인 로직 테스트 (Vitest)
npm run test:functions # Edge Function 파싱/정규화 테스트 (Deno)
```

플랫폼 설정은 `apps-in-toss.config.ts`에서 관리해요.
