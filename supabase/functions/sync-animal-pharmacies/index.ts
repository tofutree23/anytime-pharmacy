import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  extractPage,
  FIELDS,
  isOperating,
  normalizeAnimalPharmacy,
  readId,
  type NormalizedAnimalPharmacy,
  type RawAnimalPharmacyItem,
} from "./parse.ts";

// 상세 기능 경로 /info는 추정이며 첫 실행 로그로 확인한다.
const API_BASE = "https://apis.data.go.kr/1741000/animal_pharmacies/info";
// 페이지당 1000건으로 순차 요청 횟수를 줄여 Edge Function 리소스 한도를 피한다.
const PAGE_SIZE = 1000;
// upsert도 한 번에 보내면 같은 한도에 걸릴 수 있어 청크로 나눈다.
const UPSERT_CHUNK_SIZE = 500;

// 서비스키가 이미 URL 인코딩된 형태로 올 수 있어, 디코드 후 재인코딩해 이중 인코딩을 막는다.
function normalizeServiceKey(key: string): string {
  const trimmed = key.trim();
  try {
    return encodeURIComponent(decodeURIComponent(trimmed));
  } catch {
    return encodeURIComponent(trimmed);
  }
}

// 서비스키가 담긴 URL이나 원본 예외가 로그/응답에 새지 않도록 이 타입으로만 던진다.
// message에 URL을 넣지 않는다.
class PublicApiError extends Error {}

// complete=false면 뒷페이지를 못 가져온 것이라 pruning을 절대 하지 않는다.
type FetchResult = { items: RawAnimalPharmacyItem[]; complete: boolean };

function objectKeys(value: unknown): string {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.keys(value).join(",")
    : typeof value;
}

async function fetchAllAnimalPharmacies(
  serviceKey: string,
): Promise<FetchResult> {
  const items: RawAnimalPharmacyItem[] = [];
  let pageNo = 1;
  let emptyPageRetried = false;
  let totalCount = 0;
  let abortedEarly = false;

  while (true) {
    const url = `${API_BASE}?serviceKey=${
      normalizeServiceKey(serviceKey)
    }&pageNo=${pageNo}&numOfRows=${PAGE_SIZE}&_type=json`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; anytime-pharmacy-sync/1.0)",
        },
      });
    } catch {
      // fetch 예외는 URL(서비스키 포함)을 담을 수 있어 원본을 전파하지 않는다.
      throw new PublicApiError("공공API 네트워크 오류");
    }

    if (!res.ok) {
      throw new PublicApiError(`공공API 요청 실패: 상태 코드 ${res.status}`);
    }
    const json: unknown = await res.json();
    const page = extractPage(json);
    if (!page) {
      console.warn("동물약국 응답 구조 예상과 다름, 최상위 키:", objectKeys(json));
      const body = typeof json === "object" && json !== null && !Array.isArray(json)
        ? (json as Record<string, unknown>).response
        : undefined;
      const responseBody = typeof body === "object" && body !== null && !Array.isArray(body)
        ? (body as Record<string, unknown>).body
        : undefined;
      if (typeof responseBody === "object" && responseBody !== null && !Array.isArray(responseBody)) {
        console.warn("동물약국 응답 body 키:", Object.keys(responseBody).join(","));
      }
      throw new PublicApiError("공공API 응답 구조 오류");
    }

    const pageItems = page.items;
    totalCount = page.totalCount;
    if (pageNo === 1) {
      if (pageItems.length > 0) console.info("동물약국 첫 행 키:", Object.keys(pageItems[0]).join(","));
      console.info("동물약국 페이지 건수:", pageItems.length);
    }
    const reachedExpectedEnd = pageNo * PAGE_SIZE >= totalCount;

    // totalCount 전의 빈 페이지는 일시적 이상일 가능성이 높아 1회 재시도 후 중단한다.
    if (pageItems.length === 0 && !reachedExpectedEnd) {
      if (!emptyPageRetried) {
        emptyPageRetried = true;
        continue;
      }
      console.warn(
        `공공API 페이지네이션 이상 감지: ${pageNo}페이지가 비어 있음 ` +
          `(totalCount=${totalCount}, 지금까지 수집=${items.length}건). fetch를 중단합니다.`,
      );
      abortedEarly = true;
      break;
    }

    emptyPageRetried = false;
    items.push(...pageItems);
    if (reachedExpectedEnd || pageItems.length === 0) break;
    pageNo += 1;
  }

  // 완전성은 페이지 산술이 아니라 실제 수집 건수 >= totalCount로만 판정한다.
  // 이 건수는 영업상태로 거르기 전 원본 기준이다(거른 뒤로 비교하면 항상 불완전이 된다).
  const fetchComplete = !abortedEarly && items.length >= totalCount;
  if (!fetchComplete) {
    console.warn(
      `fetch 불완전: 수집 ${items.length}건 / totalCount ${totalCount}건. 이번 실행은 pruning을 건너뜁니다.`,
    );
  } else if (items.length !== totalCount) {
    console.warn(
      `수집 건수(${items.length})가 totalCount(${totalCount})와 정확히 일치하지 않습니다(초과 수집). pruning은 진행합니다.`,
    );
  }

  return { items, complete: fetchComplete };
}

Deno.serve(async () => {
  const serviceKey = Deno.env.get("DATA_GOV_ANIMAL_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!serviceKey || !supabaseUrl || !serviceRoleKey) {
    return new Response("환경변수 누락", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { items: rawItems, complete: fetchComplete } = await fetchAllAnimalPharmacies(
      serviceKey,
    );
    const statusCounts: Record<string, number> = {};
    for (const raw of rawItems) {
      const value = raw[FIELDS.status];
      // 필드명 추정이 틀려도 원본 값이 로그에 남지 않게 형식으로 거른다.
      const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : null;
      const isEmpty = value === undefined || value === null || text === "";
      const status = isEmpty ? "(없음)" : text !== null && /^\d{1,2}$/.test(text) ? text : "(비코드)";
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    }
    console.info("동물약국 영업상태 분포:", JSON.stringify(statusCounts));

    // 폐업·휴업 행은 closed로만 세고 skippedIds에 넣지 않는다. skippedIds는
    // "API에 있지만 파싱 실패"라서 삭제에서 보호하는 목록이기 때문이다.
    const normalized: NormalizedAnimalPharmacy[] = [];
    const skippedIds: string[] = [];
    let skipped = 0;
    let closed = 0;
    for (const raw of rawItems) {
      if (!isOperating(raw)) {
        closed += 1;
        continue;
      }
      try {
        normalized.push(normalizeAnimalPharmacy(raw));
      } catch {
        skipped += 1;
        const id = readId(raw);
        if (id) skippedIds.push(id);
      }
    }
    if (skipped > 0) {
      console.warn(`정규화 실패로 건너뛴 동물약국 행: ${skipped}건 / 전체 ${rawItems.length}건`);
    }

    // 이번 실행에서 갱신된 행을 식별하기 위해 모든 행에 동일한 타임스탬프를 쓴다.
    const syncedAt = new Date().toISOString();

    const mappedRows = normalized.map((p) => ({
      id: p.id,
      name: p.name,
      address: p.address,
      phone: p.phone,
      lat: p.lat,
      lng: p.lng,
      licensed_at: p.licensedAt,
      updated_at: syncedAt,
    }));

    // mgtNo가 전국 단위로 유일한지 확인되지 않아 같은 청크 안 중복이 upsert 전체를 실패시킬 수 있다.
    const rows = [...new Map(mappedRows.map((row) => [row.id, row])).values()];
    const duplicates = mappedRows.length - rows.length;
    if (duplicates > 0) console.warn("동물약국 id 중복:", duplicates, "건");

    for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
      const { error } = await supabase.from("animal_pharmacies").upsert(chunk, {
        onConflict: "id",
      });
      if (error) throw error;
    }

    // fetchComplete이고 rows가 비어 있지 않을 때만 지우고, skippedIds는 제외한다.
    let pruned = 0;
    let pruningSkipped = false;
    if (rows.length > 0 && fetchComplete) {
      let deleteQuery = supabase
        .from("animal_pharmacies")
        .delete()
        .lt("updated_at", syncedAt);
      if (skippedIds.length > 0) {
        // PostgREST in 필터의 인용 규칙에 맞춰 \와 "를 escape한다.
        const idList = skippedIds
          .map((id) => `"${id.replace(/[\\"]/g, "\\$&")}"`)
          .join(",");
        deleteQuery = deleteQuery.not("id", "in", `(${idList})`);
      }
      const { data: deleted, error: deleteError } = await deleteQuery.select("id");
      if (deleteError) throw deleteError;
      pruned = deleted?.length ?? 0;
      if (pruned > 0) {
        console.info(`공공API에서 사라진 동물약국 정리: ${pruned}건`);
      }
    } else if (rows.length > 0 && !fetchComplete) {
      pruningSkipped = true;
      console.warn(
        "fetch가 페이지네이션 도중 중단되어(불완전한 데이터셋) 이번 실행에서는 pruning을 건너뜁니다.",
      );
    }

    return new Response(
      JSON.stringify({ synced: rows.length, skipped, closed, duplicates, pruned, pruningSkipped }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    // 원본 예외는 URL을 담을 수 있어 PublicApiError 메시지 외에는 일반 메시지로 대체한다.
    const safeMessage = err instanceof PublicApiError
      ? err.message
      : "동물약국 데이터 동기화 실패";
    console.error("동물약국 데이터 동기화 실패, 캐시 유지:", safeMessage);
    return new Response(JSON.stringify({ error: safeMessage }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
});
