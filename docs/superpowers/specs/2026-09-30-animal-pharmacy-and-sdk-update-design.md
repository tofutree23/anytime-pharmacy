# 동물약국 찾기 및 토스 SDK 최신화 설계 스펙

날짜: 2026-09-30

## 범위와 작업 순서

이번 작업은 서로 독립적인 세 가지 작업으로 구성되며, 문제가 생겼을 때 원인을 분리할 수 있도록 아래 순서대로 각각 별도 커밋으로 진행한다.

1. 패키지 매니저를 npm에서 pnpm으로 전환한다.
2. 토스 SDK를 3.0.3에서 3.6.0으로 올린다.
3. 동물약국 찾기 기능을 추가한다.

## 1. pnpm 전환

- `package-lock.json`을 삭제하고 `pnpm-lock.yaml`을 생성한다.
- `pnpm-workspace.yaml`에 `saveExact: true`를 설정하고, `pnpm config get save-exact`가 `true`를 반환하는지 확인한다.
- README에 적힌 개발 명령어를 pnpm 기준으로 수정한다.
- 성공 기준: `pnpm install`, `pnpm test`, `pnpm build`가 모두 통과한다.

## 2. 토스 SDK 최신화

앱은 SDK 3.x 마이그레이션([가이드](https://developers-apps-in-toss.toss.im/documentation/integration/sdk-3.x))을 이미 마쳤다. `apps-in-toss.config.ts`, `webBundleDir`, build 스크립트의 `ait build`, TDS 2.5.1이 모두 가이드 요구사항을 충족한다. 따라서 이번 작업은 마이너 버전을 올리는 작업이다.

| 패키지 | 현재 | 변경 |
|---|---|---|
| `@apps-in-toss/web-framework` | `"latest"`(설치 3.0.3) | `3.6.0` 고정 |
| `@apps-in-toss/devtools` | `3.0.3` | `3.6.0` |
| `@toss/tds-mobile`, `@toss/tds-mobile-ait` | `2.5.1` | 이미 최신이므로 유지 |

**3.0.3 이후 변경 중 영향이 있는 항목**

- 서비스 Origin 변경: SDK 3.1.1 이후 번들은 `https://anytime-pharmacy.apps.tossmini.com`(운영), `https://anytime-pharmacy.private-apps.tossmini.com`(콘솔 QR 테스트)에서 서비스된다([서버 API 문서](https://developers-apps-in-toss.toss.im/documentation/integration/server-api)). 카카오맵 JS SDK는 등록된 도메인에서만 동작하므로, 배포 전에 카카오 디벨로퍼스의 Web 사이트 도메인에 두 주소를 추가해야 한다. 기존 `*.web.tossmini.com` 주소는 전환 기간 동안 유지한다. Supabase는 기본적으로 모든 Origin을 허용하므로 별도 조치가 필요하지 않다.
- `webView.pullToRefreshEnabled`의 기본값이 `false`로 바뀌었다. 목록이 자체 스크롤 컨테이너 안에 있으므로 설정을 바꾸지 않는다.
- 빌드 단계에서 `appName`, `brand` 설정을 검증한다. 현재 설정으로 빌드가 통과하는지 확인한다.

**성공 기준**

- `package.json`의 버전 표기와 설치된 버전이 일치한다.
- `pnpm build`(타입체크, vite build, ait build)가 통과한다.
- devtools 환경에서 위치 조회(`useLocation.ts`)와 배너 광고(`useTossBanner.ts`)가 기존과 같이 동작한다.
- 배포 체크리스트 첫 항목으로 카카오 도메인 등록 여부를 확인한다.

## 3. 동물약국 찾기

### 데이터 출처

행정안전부 "동물_동물약국 조회서비스"([data.go.kr 15155272](https://www.data.go.kr/data/15155272/openapi.do))를 사용한다.

- 요청 주소: `https://apis.data.go.kr/1741000/animal_pharmacies`
- 형식은 REST(JSON, XML)이고, 원본 데이터는 매일 갱신되며, 개발계정의 호출 한도는 하루 10,000건이다.
- 제공 항목에는 인허가일자, 영업상태, 사업장명, 소재지주소, 좌표가 있다. 영업시간은 제공하지 않는다.
- 같은 계열 데이터셋(동물병원)의 문서에 따르면 좌표계는 보정계수가 들어가지 않은 Bessel 중부원점TM(EPSG:5174)이다.
- 서비스키는 기존 약국 API와 별도로 발급받았으며, 사용자가 Supabase에 Edge Function secret `DATA_GOV_ANIMAL_KEY`로 직접 등록한다. 로컬 `.env`는 사용하지 않는다.

**응답 형식 검증**: 응답 샘플 없이 진행한다. `parse.ts`의 필드 매핑은 LOCALDATA 표준 항목명을 기준으로 추정해서 작성하며, 추정한 필드명은 `parse.ts` 상단의 한 곳에 모은다. 함수를 처음 배포해 실행할 때 응답의 최상위 구조와 첫 행의 키 목록, 영업상태 값의 분포만 로그로 남겨서(값 자체와 서비스키는 남기지 않음) 추정이 맞는지 확인하고, 틀리면 매핑만 수정한다. 첫 실행에서 정규화에 성공한 행이 0건이면 upsert와 pruning을 하지 않는다.

### 제품 결정

- 영업시간 정보가 없으므로 동물약국에는 "지금 영업중", "심야 영업", "공휴일 영업" 필터를 적용하지 않는다.
- 영업상태가 영업 중인 곳만 보여주며, 위치와 전화번호를 중심으로 안내하고 "방문 전 전화로 확인해 주세요" 문구를 함께 노출한다.
- 홈 화면 상단의 `약국 | 동물약국` 탭으로 전환하고, 지도와 목록, 지역 선택 화면은 기존 것을 재사용한다.

### 백엔드

**마이그레이션 `0006_animal_pharmacies.sql`**

- `animal_pharmacies` 테이블에 `id`(관리번호, primary key), `name`, `address`, `phone`, `lat`, `lng`, `licensed_at`, `source`, `updated_at` 컬럼을 둔다.
- `address`에는 도로명 주소를 우선 저장하고, 도로명 주소가 없으면 지번 주소를 저장한다.
- 영업상태 컬럼은 두지 않는다. 영업 중인 곳만 저장하기 때문이다.
- 인덱스(`gist(ll_to_earth(lat, lng))`, `address`)와 RLS 정책(공개 읽기 전용)은 `pharmacies`와 동일하게 구성한다.
- pg_cron으로 `sync-animal-pharmacies`를 하루 1회 새벽에 호출한다. 원본이 일간 갱신이고 개발계정의 호출 한도가 있기 때문이다.

**Edge Function `sync-animal-pharmacies`**

기존 `sync-pharmacies`의 구조를 그대로 따른다. 페이지 순회, 빈 페이지 재시도, 수집 완전성 판정, 청크 단위 upsert, 조건부 pruning, `PublicApiError`로 서비스키 노출을 막는 방식이 모두 같다.

`parse.ts`가 담당하는 일은 다음과 같다.

- 영업상태가 영업 중인 행만 통과시킨다.
- EPSG:5174 좌표를 WGS84 위경도로 변환한다. 외부 라이브러리 없이 TM 역변환과 Bessel에서 GRS80으로 datum을 변환하는 공식을 구현한다.
- 좌표가 없거나 변환 결과가 국내 범위를 벗어나는 행은 정규화 실패로 처리한다.

**pruning 규칙**: 영업 중인 곳만 upsert하므로, 폐업이나 휴업으로 바뀐 곳은 `updated_at < syncedAt` 조건에 걸려 기존 방식대로 삭제된다. 수집 완전성은 영업상태로 거르기 전의 원본 건수와 `totalCount`를 비교하여 판정한다. 거른 뒤의 건수로 비교하면 매번 불완전하다고 판정되어 pruning이 실행되지 않기 때문이다. 정규화에 실패한 행의 id는 기존과 같이 삭제 대상에서 제외한다.

### 클라이언트

**타입** (`src/domain/types.ts`)

```ts
type PlaceBase = { id; name; address; phone; lat; lng; source; updatedAt; distanceMeters };
type Pharmacy = PlaceBase & { kind: 'pharmacy'; dutyTime: DutyTime };
type AnimalPharmacy = PlaceBase & { kind: 'animal' };
type Place = Pharmacy | AnimalPharmacy;
```

영업시간 로직(`isOpenNow`, `matchesActiveFilters`)은 계속 `Pharmacy`만 받으므로, 동물약국이 영업시간 로직에 전달되면 타입 에러가 발생한다.

**데이터 hook**

- `usePharmacies`와 `usePharmaciesInBounds`가 `kind` 인자를 받아 조회할 테이블과 행 변환 함수를 선택한다.
- `queryKey`의 맨 앞에 `kind`를 넣어 탭 사이의 캐시가 섞이지 않게 한다.
- 동물약국의 행 변환 함수는 `src/lib/animalPharmacyRow.ts`에 둔다.

**홈 화면** (`HomePage.tsx`)

- `Top` 아래에 `약국 | 동물약국` 탭을 둔다. 사용할 TDS 컴포넌트는 구현할 때 TDS 문서에서 확인한다.
- 지역, 지도 범위, 위치로 구성된 검색 상태(`searchState`)는 두 탭이 공유한다.
- `FilterBar`는 약국 탭에서만 보여준다. 동물약국 탭에 다녀와도 `activeFilters`는 유지된다.
- 부제목과 로딩 문구, 빈 목록 문구는 선택한 탭에 맞춰 바꾼다.
- `HomePage`는 `display: none`으로 항상 마운트되어 있으므로, 탭 상태를 `HomePage` 안에 두기만 해도 상세 화면에서 돌아왔을 때 탭이 유지된다.

**컴포넌트**

| 대상 | 방식 |
|---|---|
| `PharmacyMap` | props 타입을 `Place[]`로 넓히고, 내부 로직은 바꾸지 않는다. |
| `RegionPicker`, `ComplianceNotice`, `BannerAd` | 그대로 사용한다. |
| `AnimalPharmacyCard` | 새로 만든다. 영업 배지를 표시하지 않는다. `formatDistance`는 두 카드가 공유하도록 분리한다. |
| `AnimalPharmacyDetailPage` | 새로 만든다. 주소, 전화, 영업시간 미제공 안내, 출처와 갱신 시각을 표시한다. |
| `App.tsx` | 선택된 항목의 `kind`로 상세 화면을 고른다. 두 상세 화면 모두 lazy로 불러온다. |

### 테스트

- Deno: 영업상태 필터링, 좌표 변환(알려진 좌표 쌍 기준으로 오차 수 m 이내), 필수 필드 누락 시 정규화 실패
- Vitest: 동물약국 행 변환 함수, `kind`에 따른 테이블 선택
- 수동 확인: devtools에서 탭 전환, 지도 범위 재검색, 지역 선택, 상세 화면 진입과 복귀

### 범위 밖

- 동물병원 데이터
- 동물약국 영업시간 보강
- 탭 선택 상태를 앱 재시작 이후까지 유지하는 기능
