// LOCALDATA 표준 항목명 추정값, 첫 실행 로그로 검증
import { epsg5174ToWgs84 } from "./coord.ts";

export const FIELDS = {
  id: "mgtNo",
  name: "bplcNm",
  status: "trdStateGbn",
  roadAddress: "rdnWhlAddr",
  lotAddress: "siteWhlAddr",
  phone: "siteTel",
  licensedAt: "apvPermYmd",
  x: "x",
  y: "y",
} as const;
export const OPERATING_STATUS = "01";

export type RawAnimalPharmacyItem = Record<string, unknown>;
export type NormalizedAnimalPharmacy = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  lat: number;
  lng: number;
  licensedAt: string | null;
};

function readString(raw: RawAnimalPharmacyItem, field: string): string {
  const value = raw[field];
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function normalizeLicensedAt(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$|^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (!match) return null;

  const [, hyphenYear, hyphenMonth, hyphenDay, compactYear, compactMonth, compactDay] = match;
  const [yearText, monthText, dayText] = hyphenYear
    ? [hyphenYear, hyphenMonth, hyphenDay]
    : [compactYear, compactMonth, compactDay];
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return `${yearText}-${monthText}-${dayText}`;
}

export function isOperating(raw: RawAnimalPharmacyItem): boolean {
  return readString(raw, FIELDS.status) === OPERATING_STATUS;
}

export function readId(raw: RawAnimalPharmacyItem): string {
  return readString(raw, FIELDS.id);
}

export function normalizeAnimalPharmacy(raw: RawAnimalPharmacyItem): NormalizedAnimalPharmacy {
  const id = readId(raw);
  const name = readString(raw, FIELDS.name);
  const roadAddress = readString(raw, FIELDS.roadAddress);
  const lotAddress = readString(raw, FIELDS.lotAddress);
  const phone = readString(raw, FIELDS.phone);
  const licensedAt = readString(raw, FIELDS.licensedAt);
  const xText = readString(raw, FIELDS.x);
  const yText = readString(raw, FIELDS.y);

  if (!id) throw new Error(FIELDS.id);
  if (!name) throw new Error(FIELDS.name);
  if (!roadAddress && !lotAddress) throw new Error(`${FIELDS.roadAddress}, ${FIELDS.lotAddress}`);
  if (!xText) throw new Error(FIELDS.x);
  if (!yText) throw new Error(FIELDS.y);

  const x = Number(xText);
  const y = Number(yText);
  if (!Number.isFinite(x)) throw new Error(FIELDS.x);
  if (!Number.isFinite(y)) throw new Error(FIELDS.y);
  // 5174의 (0, 0)은 위도 33.48, 경도 124.85로 국내 범위 검사를 통과하므로 따로 막는다.
  if (x === 0 || y === 0) throw new Error(`${FIELDS.x}, ${FIELDS.y}`);

  const { lat, lng } = epsg5174ToWgs84(x, y);
  if (lat < 33.0 || lat > 38.9) throw new Error(FIELDS.y);
  if (lng < 124.5 || lng > 132.0) throw new Error(FIELDS.x);

  return {
    id,
    name,
    address: roadAddress || lotAddress,
    phone: phone || null,
    lat,
    lng,
    licensedAt: normalizeLicensedAt(licensedAt),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractPage(json: unknown): { items: RawAnimalPharmacyItem[]; totalCount: number } | null {
  if (!isRecord(json) || !isRecord(json.response) || !isRecord(json.response.body)) return null;

  const body = json.response.body;
  const rawTotalCount = body.totalCount;
  if (typeof rawTotalCount !== "number" && (typeof rawTotalCount !== "string" || !/^\d+$/.test(rawTotalCount))) return null;
  const totalCount = Number(rawTotalCount);
  if (!Number.isInteger(totalCount) || totalCount < 0) return null;

  const items = body.items;
  if (items === "") return { items: [], totalCount };
  if (items === undefined) return null;
  if (!isRecord(items)) return null;
  const item = items.item;
  if (item === undefined) return null;
  if (item === "") return { items: [], totalCount };
  const parsedItems = Array.isArray(item) ? item : [item];
  if (!parsedItems.every(isRecord)) return null;
  return { items: parsedItems, totalCount };
}
