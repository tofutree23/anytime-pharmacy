import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/testing/asserts.ts";
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

Deno.test("유효하지 않은 위도를 전달하면 에러를 던진다", () => {
  const raw = {
    hpid: "A1100003",
    dutyName: "에러약국",
    dutyAddr: "서울특별시 중구 1",
    dutyTel1: "02-1234-5678",
    wgs84Lon: "126.9",
    wgs84Lat: "invalid",
    dutyTime1s: "", dutyTime1c: "",
    dutyTime2s: "", dutyTime2c: "",
    dutyTime3s: "", dutyTime3c: "",
    dutyTime4s: "", dutyTime4c: "",
    dutyTime5s: "", dutyTime5c: "",
    dutyTime6s: "", dutyTime6c: "",
    dutyTime7s: "", dutyTime7c: "",
    dutyTime8s: "", dutyTime8c: "",
  };

  assertThrows(
    () => normalizePharmacy(raw),
    Error,
    "Invalid latitude"
  );
});

Deno.test("유효하지 않은 경도를 전달하면 에러를 던진다", () => {
  const raw = {
    hpid: "A1100004",
    dutyName: "에러약국2",
    dutyAddr: "서울특별시 중구 1",
    dutyTel1: "02-1234-5678",
    wgs84Lon: "invalid",
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

  assertThrows(
    () => normalizePharmacy(raw),
    Error,
    "Invalid longitude"
  );
});

Deno.test("JSON 숫자 타입 opening/closing 시간을 정규화한다", () => {
  const raw = {
    hpid: "A1100005",
    dutyName: "혼합타입약국",
    dutyAddr: "서울특별시 중구 1",
    dutyTel1: "02-1234-5678",
    wgs84Lon: "126.9",
    wgs84Lat: "37.5",
    dutyTime1s: 1000, // number (leading zero 없음)
    dutyTime1c: 1900, // number
    dutyTime2s: "0900", // string (leading zero 있음)
    dutyTime2c: 1400, // number
    dutyTime3s: "", dutyTime3c: "",
    dutyTime4s: "", dutyTime4c: "",
    dutyTime5s: "", dutyTime5c: "",
    dutyTime6s: "", dutyTime6c: "",
    dutyTime7s: "", dutyTime7c: "",
    dutyTime8s: "", dutyTime8c: "",
  };

  const result = normalizePharmacy(raw);

  // 숫자는 padStart(4, "0")로 정규화되어야 함
  assertEquals(result.dutyTime.mon, { open: "1000", close: "1900" });
  // 문자열은 그대로 유지, 숫자는 정규화
  assertEquals(result.dutyTime.tue, { open: "0900", close: "1400" });
  assertEquals(result.dutyTime.wed, null);
});

Deno.test("숫자 시간이 zero-padded로 정규화된다", () => {
  const raw = {
    hpid: "A1100006",
    dutyName: "패딩필요약국",
    dutyAddr: "서울특별시 중구 1",
    dutyTel1: "02-1234-5678",
    wgs84Lon: "126.9",
    wgs84Lat: "37.5",
    dutyTime1s: 900, // "0900"으로 패딩됨
    dutyTime1c: 1800, // "1800"
    dutyTime2s: "", dutyTime2c: "",
    dutyTime3s: "", dutyTime3c: "",
    dutyTime4s: "", dutyTime4c: "",
    dutyTime5s: "", dutyTime5c: "",
    dutyTime6s: "", dutyTime6c: "",
    dutyTime7s: "", dutyTime7c: "",
    dutyTime8s: "", dutyTime8c: "",
  };

  const result = normalizePharmacy(raw);

  assertEquals(result.dutyTime.mon, { open: "0900", close: "1800" });
});

Deno.test("대한민국 범위를 벗어난 좌표(0, 0)는 거부한다", () => {
  const raw = {
    hpid: "A1100007",
    dutyName: "기니만약국",
    dutyAddr: "서울특별시 중구 1",
    dutyTel1: "02-1234-5678",
    wgs84Lon: "0",
    wgs84Lat: "0",
    dutyTime1s: "", dutyTime1c: "",
    dutyTime2s: "", dutyTime2c: "",
    dutyTime3s: "", dutyTime3c: "",
    dutyTime4s: "", dutyTime4c: "",
    dutyTime5s: "", dutyTime5c: "",
    dutyTime6s: "", dutyTime6c: "",
    dutyTime7s: "", dutyTime7c: "",
    dutyTime8s: "", dutyTime8c: "",
  };

  assertThrows(() => normalizePharmacy(raw), Error, "Invalid latitude");
});

Deno.test("빈 문자열 좌표는 Number(\"\")가 0이라 NaN 검사를 통과하지만 거부된다", () => {
  const raw = {
    hpid: "A1100008",
    dutyName: "빈좌표약국",
    dutyAddr: "서울특별시 중구 1",
    dutyTel1: "02-1234-5678",
    wgs84Lon: "",
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

  assertThrows(() => normalizePharmacy(raw), Error, "Invalid longitude");
});
