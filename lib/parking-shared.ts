export type CarId = "me" | "partner";

export type LatLng = { lat: number; lng: number };

export type Positions = Record<CarId, LatLng>;

/** Mladost 2, Sofia — panning is limited to this rectangle. */
export const MLADOST2_BOUNDS = {
  north: 42.6485,
  south: 42.6355,
  east: 23.392,
  west: 23.362,
} as const;

export const STORAGE_KEY_V2 = "parking-map-positions-v2";
export const STORAGE_KEY_V1 = "parking-map-positions-v1";
export const ROLE_STORAGE_KEY = "parking-map-role";

export const DEFAULT_POSITIONS: Positions = {
  me: { lat: 42.64485, lng: 23.3714 },
  partner: { lat: 42.64512, lng: 23.3718 },
};

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function clampToMladost2(p: LatLng): LatLng {
  return {
    lat: clamp(p.lat, MLADOST2_BOUNDS.south, MLADOST2_BOUNDS.north),
    lng: clamp(p.lng, MLADOST2_BOUNDS.west, MLADOST2_BOUNDS.east),
  };
}

export function isCarId(s: unknown): s is CarId {
  return s === "me" || s === "partner";
}

export function parsePositionsJson(raw: unknown): Positions | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const me = o.me;
  const partner = o.partner;
  if (
    !me ||
    !partner ||
    typeof me !== "object" ||
    typeof partner !== "object"
  ) {
    return null;
  }
  const ml = (me as { lat?: unknown; lng?: unknown }).lat;
  const nl = (me as { lat?: unknown; lng?: unknown }).lng;
  const pl = (partner as { lat?: unknown; lng?: unknown }).lat;
  const pnl = (partner as { lat?: unknown; lng?: unknown }).lng;
  if (
    typeof ml !== "number" ||
    typeof nl !== "number" ||
    typeof pl !== "number" ||
    typeof pnl !== "number"
  ) {
    return null;
  }
  return {
    me: clampToMladost2({ lat: ml, lng: nl }),
    partner: clampToMladost2({ lat: pl, lng: pnl }),
  };
}
