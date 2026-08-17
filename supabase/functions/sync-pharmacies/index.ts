import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  normalizePharmacy,
  type NormalizedPharmacy,
  type RawPharmacyItem,
} from "./parse.ts";

const API_BASE =
  "https://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyListInfoInqire";
// 실제 데이터는 25,000건 이상이라 페이지당 100건(브리프 원안)으로는 253회의 순차 요청이
// 필요해 Edge Function의 리소스 한도(WORKER_RESOURCE_LIMIT)를 초과한다. 공공API가
// numOfRows=1000을 문제없이 지원함을 확인했으므로 페이지당 1000건으로 늘려 요청 횟수를
// 26회 수준으로 줄인다.
const PAGE_SIZE = 1000;
// upsert도 25,000+건을 한 번에 보내면 동일한 리소스 한도에 걸릴 수 있어 청크 단위로 나눈다.
const UPSERT_CHUNK_SIZE = 500;

// data.go.kr가 발급하는 서비스키는 이미 URL 인코딩된 형태(%2B, %2F, %3D 포함)로 제공되는
// 경우가 있어, 원본 문자열을 한 번 디코드한 뒤 다시 인코딩해 이중 인코딩을 방지한다.
function normalizeServiceKey(key: string): string {
  const trimmed = key.trim();
  try {
    return encodeURIComponent(decodeURIComponent(trimmed));
  } catch {
    return encodeURIComponent(trimmed);
  }
}

// 서비스키가 포함된 URL이나 원본 예외가 그대로 로그/응답에 노출되지 않도록,
// 공공API 호출 실패는 이 전용 에러 타입으로만 던진다. message에는 절대
// URL이나 쿼리스트링을 포함하지 않는다.
class PublicApiError extends Error {}

// complete = true면 totalCount 전체를 정상적으로 끝까지 순회했다는 뜻이다.
// false면 페이지네이션 도중 예상치 못한 빈 페이지를 만나 fetch를 중단했다는 뜻이며,
// 이 경우 호출부는 (delisted 약국을 정리하는) pruning을 절대 수행해서는 안 된다 —
// 아직 못 가져온 뒷페이지의 약국들이 "더 이상 존재하지 않음"으로 오인되어 삭제될 수 있기 때문.
type FetchResult = { items: RawPharmacyItem[]; complete: boolean };

async function fetchAllPharmacies(
  serviceKey: string,
): Promise<FetchResult> {
  const items: RawPharmacyItem[] = [];
  let pageNo = 1;
  let emptyPageRetried = false;

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
      // fetch()가 던지는 네트워크 레벨 예외는 요청 URL(서비스키 포함)을 포함할 수 있어
      // 원본 예외를 그대로 전파하지 않는다.
      throw new PublicApiError("공공API 네트워크 오류");
    }

    if (!res.ok) {
      // 응답 본문은 서비스키를 포함하지 않지만, 불필요한 상세 노출을 줄이기 위해 상태 코드만 남긴다.
      throw new PublicApiError(`공공API 요청 실패: 상태 코드 ${res.status}`);
    }
    const json = await res.json();
    const body = json?.response?.body;
    const rawPageItems = body?.items?.item ?? [];
    const pageItems: RawPharmacyItem[] = Array.isArray(rawPageItems)
      ? rawPageItems
      : [rawPageItems];

    const totalCount = body?.totalCount ?? 0;
    const reachedExpectedEnd = pageNo * PAGE_SIZE >= totalCount;

    // totalCount에 도달하기 전에 빈 페이지가 오면 정상적인 마지막 페이지가 아니라
    // API 쪽의 일시적 이상(레이트리밋, 순간 오류 등)일 가능성이 높다. 이를 "fetch 완료"로
    // 오인해 뒷페이지 약국들을 pruning 대상으로 삼는 일이 없도록, 같은 페이지를 한 번
    // 재시도하고 그래도 비어 있으면 fetch를 불완전한 것으로 표시하고 중단한다.
    if (pageItems.length === 0 && !reachedExpectedEnd) {
      if (!emptyPageRetried) {
        emptyPageRetried = true;
        continue;
      }
      console.warn(
        `공공API 페이지네이션 이상 감지: ${pageNo}페이지가 비어 있음 ` +
          `(totalCount=${totalCount}, 지금까지 수집=${items.length}건). ` +
          `이번 실행은 fetch를 중단하고 pruning을 건너뜁니다.`,
      );
      return { items, complete: false };
    }

    emptyPageRetried = false;
    items.push(...pageItems);

    if (reachedExpectedEnd || pageItems.length === 0) break;
    pageNo += 1;
  }

  return { items, complete: true };
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
    const { items: rawItems, complete: fetchComplete } = await fetchAllPharmacies(
      serviceKey,
    );

    // 공공API의 불량 행 하나 때문에 동기화 전체가 실패하면 캐시가 영구히 낡아버린다.
    // 행 단위로 예외를 잡아 건너뛰고 개수만 집계한다.
    // (로그에는 임의의 API 응답 내용이 남지 않도록 건수만 남긴다.)
    //
    // 정규화에 실패한 행의 hpid도 별도로 모아둔다: 이 약국은 공공API 응답에
    // "여전히 존재"했으므로(파싱만 실패했을 뿐) 아래 pruning 단계에서
    // updated_at이 갱신되지 않았다는 이유만으로 delisted 취급되어 삭제되면 안 된다.
    const normalized: NormalizedPharmacy[] = [];
    const skippedIds: string[] = [];
    for (const raw of rawItems) {
      try {
        normalized.push(normalizePharmacy(raw));
      } catch {
        skippedIds.push(raw.hpid);
      }
    }
    const skipped = skippedIds.length;
    if (skipped > 0) {
      console.warn(`정규화 실패로 건너뛴 약국 행: ${skipped}건 / 전체 ${rawItems.length}건`);
    }

    // 이번 실행에서 갱신된 행을 식별하기 위해 모든 행에 동일한 타임스탬프를 쓴다.
    const syncedAt = new Date().toISOString();

    const rows = normalized.map((p) => ({
      id: p.id,
      name: p.name,
      address: p.address,
      phone: p.phone,
      lat: p.lat,
      lng: p.lng,
      duty_time: p.dutyTime,
      updated_at: syncedAt,
    }));

    for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
      const { error } = await supabase.from("pharmacies").upsert(chunk, {
        onConflict: "id",
      });
      if (error) throw error;
    }

    // 공공API 현재 데이터셋에 더 이상 없는 약국(= 이번 동기화가 건드리지 않은 행)을 정리한다.
    // 폐업한 약국이 계속 "영업중"으로 남는 것이 건강정보 앱에서는 실제 피해로 이어진다.
    //
    // pruning은 다음 두 조건을 모두 만족할 때만 실행한다:
    //   1) fetch가 totalCount 전체를 정상적으로 끝까지 순회했을 것(fetchComplete).
    //      페이지네이션 도중 이상 징후로 중단됐다면 아직 못 가져온 뒷페이지의 약국들이
    //      "사라짐"으로 오인될 수 있으므로 이번 실행은 pruning을 건너뛴다.
    //   2) 결과가 비어 있지 않을 것 — 비어 있으면 테이블을 통째로 비울 위험이 있다.
    // 또한 이번 실행에서 정규화에 실패한(=파싱만 실패했을 뿐 API 응답엔 여전히 존재하는)
    // 약국의 id는 삭제 대상에서 명시적으로 제외한다. updated_at만 보고 판단하면
    // "이번 run이 건드리지 않은 행 = 폐업"이라는 전제가 깨지기 때문이다.
    let pruned = 0;
    let pruningSkipped = false;
    if (rows.length > 0 && fetchComplete) {
      let deleteQuery = supabase
        .from("pharmacies")
        .delete()
        .lt("updated_at", syncedAt);
      if (skippedIds.length > 0) {
        const idList = skippedIds.map((id) => `"${id}"`).join(",");
        deleteQuery = deleteQuery.not("id", "in", `(${idList})`);
      }
      const { data: deleted, error: deleteError } = await deleteQuery.select("id");
      if (deleteError) throw deleteError;
      pruned = deleted?.length ?? 0;
      if (pruned > 0) {
        console.info(`공공API에서 사라진 약국 정리: ${pruned}건`);
      }
    } else if (rows.length > 0 && !fetchComplete) {
      pruningSkipped = true;
      console.warn(
        "fetch가 페이지네이션 도중 중단되어(불완전한 데이터셋) 이번 실행에서는 pruning을 건너뜁니다.",
      );
    }

    return new Response(
      JSON.stringify({ synced: rows.length, skipped, pruned, pruningSkipped }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    // 공공API 실패 시 기존 캐시를 그대로 유지하고 실패만 로그로 남긴다.
    // 원본 예외(err)는 서비스키가 포함된 요청 URL을 담고 있을 수 있으므로
    // 로그와 응답 모두에 절대 그대로 노출하지 않는다. PublicApiError는 이미
    // 안전한 메시지만 담고 있고, 그 외(예: Supabase upsert 에러)는 정체를
    // 알 수 없는 상세 정보를 걸러낸 일반 메시지로 대체한다.
    const safeMessage = err instanceof PublicApiError
      ? err.message
      : "약국 데이터 동기화 실패";
    console.error("약국 데이터 동기화 실패, 캐시 유지:", safeMessage);
    return new Response(JSON.stringify({ error: safeMessage }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
});
