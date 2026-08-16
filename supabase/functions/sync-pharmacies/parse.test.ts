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
