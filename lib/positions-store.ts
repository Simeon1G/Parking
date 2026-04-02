import { Redis } from "@upstash/redis";
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

let redisSingleton: Redis | null = null;

function getRedis(): Redis | null {
  if (!isKvConfigured()) return null;
  if (!redisSingleton) {
    redisSingleton = Redis.fromEnv();
  }
  return redisSingleton;
}

export async function readPositions(): Promise<Positions> {
  const redis = getRedis();
  if (!redis) {
    throw new Error("KV not configured");
  }
  const raw = await redis.get<string | Record<string, unknown>>(KV_KEY);
  if (raw == null || raw === "") {
    return DEFAULT_POSITIONS;
  }
  try {
    const obj: unknown =
      typeof raw === "string" ? JSON.parse(raw) : raw;
    const parsed = parsePositionsJson(obj);
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
  const redis = getRedis();
  if (!redis) {
    throw new Error("KV not configured");
  }
  const current = await readPositions();
  const next: Positions = {
    ...current,
    [role]: clampToMladost2({ lat, lng }),
  };
  await redis.set(KV_KEY, JSON.stringify(next));
  return next;
}
