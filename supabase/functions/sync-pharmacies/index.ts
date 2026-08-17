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

async function fetchAllPharmacies(
  serviceKey: string,
): Promise<RawPharmacyItem[]> {
  const items: RawPharmacyItem[] = [];
  let pageNo = 1;

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

    // 공공API의 불량 행 하나 때문에 동기화 전체가 실패하면 캐시가 영구히 낡아버린다.
    // 행 단위로 예외를 잡아 건너뛰고 개수만 집계한다.
    // (로그에는 임의의 API 응답 내용이 남지 않도록 건수만 남긴다.)
    const normalized: NormalizedPharmacy[] = [];
    let skipped = 0;
    for (const raw of rawItems) {
      try {
        normalized.push(normalizePharmacy(raw));
      } catch {
        skipped += 1;
      }
    }
    if (skipped > 0) {
      console.warn(`정규화 실패로 건너뛴 약국 행: ${skipped}건 / 전체 ${rawItems.length}건`);
    }

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

    for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
      const { error } = await supabase.from("pharmacies").upsert(chunk, {
        onConflict: "id",
      });
      if (error) throw error;
    }

    return new Response(JSON.stringify({ synced: rows.length, skipped }), {
      headers: { "Content-Type": "application/json" },
    });
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
