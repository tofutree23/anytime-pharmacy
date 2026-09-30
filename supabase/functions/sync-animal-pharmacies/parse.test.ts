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

Deno.test("extractPage: items 객체에 item 키가 없으면 null", () => {
  assertEquals(extractPage({ response: { body: { totalCount: 5, items: { row: [base] } } } }), null);
});

Deno.test("extractPage: totalCount가 비정상이면 null", () => {
  for (const totalCount of [null, "", -1, 1.5]) {
    assertEquals(extractPage({ response: { body: { totalCount, items: "" } } }), null);
  }
});

Deno.test("extractPage: 원소가 객체가 아니면 null", () => {
  assertEquals(extractPage({ response: { body: { totalCount: 2, items: { item: [base, null] } } } }), null);
});

Deno.test("extractPage: totalCount가 있고 items가 빈 문자열이면 빈 배열", () => {
  assertEquals(extractPage({ response: { body: { totalCount: 5, items: "" } } }), { items: [], totalCount: 5 });
});

Deno.test("isOperating: 배열 값은 false", () => {
  assertEquals(isOperating({ ...base, trdStateGbn: ["01"] }), false);
});

Deno.test("normalize: 객체 값 필드는 빈 값으로 보고 throw", () => {
  assertThrows(() => normalizeAnimalPharmacy({ ...base, mgtNo: {} }));
});

Deno.test("normalize: 국내 범위 밖 좌표는 throw", () => {
  assertThrows(() => normalizeAnimalPharmacy({ ...base, x: "1000000", y: "1000000" }));
});

Deno.test("normalize: 존재하지 않는 날짜는 licensedAt null", () => {
  for (const d of ["20191399", "2019-02-30"]) {
    assertEquals(normalizeAnimalPharmacy({ ...base, apvPermYmd: d }).licensedAt, null);
  }
});

Deno.test("extractPage: items 키가 없으면 null", () => {
  assertEquals(extractPage({ response: { body: { totalCount: 5 } } }), null);
});

Deno.test("extractPage: totalCount 문자열은 숫자만 허용", () => {
  for (const totalCount of ["  ", "0x10"]) {
    assertEquals(extractPage({ response: { body: { totalCount, items: "" } } }), null);
  }
});

Deno.test("normalize: 위도만 범위 밖이면 throw", () => {
  assertThrows(() => normalizeAnimalPharmacy({ ...base, x: "200000", y: "1500000" }));
});

Deno.test("normalize: 경도만 범위 밖이면 throw", () => {
  assertThrows(() => normalizeAnimalPharmacy({ ...base, x: "800000", y: "500000" }));
});

Deno.test("normalize: 숫자형 좌표도 정규화", () => {
  const r = normalizeAnimalPharmacy({ ...base, x: 197984.0, y: 451557.164 });
  assertAlmostEquals(r.lat, 37.5662952, 0.00002);
  assertAlmostEquals(r.lng, 126.9779692, 0.00002);
});

Deno.test("normalize: 혼합 날짜 형식은 licensedAt null", () => {
  assertEquals(normalizeAnimalPharmacy({ ...base, apvPermYmd: "2019-0302" }).licensedAt, null);
});
