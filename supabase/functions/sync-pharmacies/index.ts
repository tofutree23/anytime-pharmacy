import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizePharmacy, type RawPharmacyItem } from "./parse.ts";

const API_BASE = "https://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyListInfoInqire";
const PAGE_SIZE = 100;

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

async function fetchAllPharmacies(serviceKey: string): Promise<RawPharmacyItem[]> {
  const items: RawPharmacyItem[] = [];
  let pageNo = 1;

  while (true) {
    const url = `${API_BASE}?serviceKey=${normalizeServiceKey(serviceKey)}&pageNo=${pageNo}&numOfRows=${PAGE_SIZE}&_type=json`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; anytime-pharmacy-sync/1.0)" },
    });
    if (!res.ok) {
      const bodyText = await res.text();
      throw new Error(`공공API 응답 실패: ${res.status} ${bodyText.slice(0, 500)}`);
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

Deno.serve(async (req) => {
  const serviceKey = Deno.env.get("DATA_GOV_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!serviceKey || !supabaseUrl || !serviceRoleKey) {
    return new Response("환경변수 누락", { status: 500 });
  }

  // TEMP DIAGNOSTIC (to be removed before final commit): fetch only page 1 and report shape.
  if (new URL(req.url).searchParams.get("diag") === "1") {
    const testSize = new URL(req.url).searchParams.get("size") ?? "1000";
    const t0 = Date.now();
    const url = `${API_BASE}?serviceKey=${normalizeServiceKey(serviceKey)}&pageNo=1&numOfRows=${testSize}&_type=json`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; anytime-pharmacy-sync/1.0)" } });
    const json = await res.json();
    const itemsRaw = json?.response?.body?.items?.item;
    const itemsLen = Array.isArray(itemsRaw) ? itemsRaw.length : (itemsRaw ? 1 : 0);
    return new Response(JSON.stringify({
      status: res.status,
      requestedSize: testSize,
      totalCount: json?.response?.body?.totalCount,
      itemsLen,
      ms: Date.now() - t0,
    }), { headers: { "Content-Type": "application/json" } });
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
