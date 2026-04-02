import { NextResponse } from "next/server";
import { isCarId } from "@/lib/parking-shared";
import { isKvConfigured, readPositions, writePosition } from "@/lib/positions-store";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isKvConfigured()) {
    return NextResponse.json(
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
    return NextResponse.json({ ok: true as const, positions });
  } catch (e) {
    const message = e instanceof Error ? e.message : "read failed";
    return NextResponse.json(
      { ok: false as const, error: "read_failed", message },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!isKvConfigured()) {
    return NextResponse.json(
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
    return NextResponse.json(
      { ok: false as const, error: "invalid_json" },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { ok: false as const, error: "invalid_body" },
      { status: 400 },
    );
  }

  const role = (body as { role?: unknown }).role;
  const lat = (body as { lat?: unknown }).lat;
  const lng = (body as { lng?: unknown }).lng;

  if (!isCarId(role)) {
    return NextResponse.json(
      { ok: false as const, error: "invalid_role" },
      { status: 400 },
    );
  }
  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json(
      { ok: false as const, error: "invalid_coordinates" },
      { status: 400 },
    );
  }

  try {
    const positions = await writePosition(role, lat, lng);
    return NextResponse.json({ ok: true as const, positions });
  } catch (e) {
    const message = e instanceof Error ? e.message : "write failed";
    return NextResponse.json(
      { ok: false as const, error: "write_failed", message },
      { status: 500 },
    );
  }
}
