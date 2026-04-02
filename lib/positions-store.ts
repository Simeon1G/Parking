import { createClient } from "@vercel/kv";
import type { CarId, Positions } from "./parking-shared";
import {
  DEFAULT_POSITIONS,
  clampToMladost2,
  parsePositionsJson,
} from "./parking-shared";

const KV_KEY = "parking-map:positions:v2";

function redisUrl(): string | undefined {
  return process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
}

function redisToken(): string | undefined {
  return process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
}

export function isKvConfigured(): boolean {
  return !!(redisUrl()?.length && redisToken()?.length);
}

function getKv() {
  const url = redisUrl();
  const token = redisToken();
  if (!url || !token) return null;
  return createClient({ url, token });
}

export async function readPositions(): Promise<Positions> {
  const kv = getKv();
  if (!kv) {
    throw new Error("KV not configured");
  }
  const raw = await kv.get<string>(KV_KEY);
  if (raw == null || raw === "") {
    return DEFAULT_POSITIONS;
  }
  try {
    const parsed = parsePositionsJson(JSON.parse(raw) as unknown);
    return parsed ?? DEFAULT_POSITIONS;
  } catch {
    return DEFAULT_POSITIONS;
  }
}

export async function writePosition(
  role: CarId,
  lat: number,
  lng: number,
): Promise<Positions> {
  const kv = getKv();
  if (!kv) {
    throw new Error("KV not configured");
  }
  const current = await readPositions();
  const next: Positions = {
    ...current,
    [role]: clampToMladost2({ lat, lng }),
  };
  await kv.set(KV_KEY, JSON.stringify(next));
  return next;
}
