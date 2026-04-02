import { NextResponse } from "next/server";
import { isCarId } from "@/lib/parking-shared";
import { isKvConfigured, readPositions, writePosition } from "@/lib/positions-store";

export const dynamic = "force-dynamic";

/** Avoid edge/CDN caching so devices always see fresh coordinates from Redis. */
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
} as const;

function json(data: unknown, init?: { status?: number }) {
  return NextResponse.json(data, {
    status: init?.status,
    headers: NO_STORE_HEADERS,
  });
}

export async function GET() {
  if (!isKvConfigured()) {
    return json(
      {
        ok: false as const,
        error: "missing_kv",
        message:
          "Add Redis (Vercel Marketplace) and set UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (or KV_REST_*).",
      },
      { status: 503 },
    );
  }
  try {
    const positions = await readPositions();
    return json({ ok: true as const, positions });
  } catch (e) {
    const message = e instanceof Error ? e.message : "read failed";
    return json(
      { ok: false as const, error: "read_failed", message },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!isKvConfigured()) {
    return json(
      {
        ok: false as const,
        error: "missing_kv",
        message:
          "Add Redis (Vercel Marketplace) and set UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (or KV_REST_*).",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false as const, error: "invalid_json" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return json({ ok: false as const, error: "invalid_body" }, { status: 400 });
  }

  const role = (body as { role?: unknown }).role;
  const lat = (body as { lat?: unknown }).lat;
  const lng = (body as { lng?: unknown }).lng;

  if (!isCarId(role)) {
    return json({ ok: false as const, error: "invalid_role" }, { status: 400 });
  }
  if (typeof lat !== "number" || typeof lng !== "number") {
    return json(
      { ok: false as const, error: "invalid_coordinates" },
      { status: 400 },
    );
  }

  try {
    const positions = await writePosition(role, lat, lng);
    return json({ ok: true as const, positions });
  } catch (e) {
    const message = e instanceof Error ? e.message : "write failed";
    return json(
      { ok: false as const, error: "write_failed", message },
      { status: 500 },
    );
  }
}
