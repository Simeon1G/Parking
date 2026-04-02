"use client";

import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  DEFAULT_POSITIONS,
  MLADOST2_BOUNDS,
  ROLE_STORAGE_KEY,
  STORAGE_KEY_V1,
  STORAGE_KEY_V2,
  type CarId,
  type LatLng,
  type Positions,
  clampToMladost2,
} from "@/lib/parking-shared";

type LegacyPercentPositions = Record<CarId, { x: number; y: number }>;

function migrateV1ToV2(v1: LegacyPercentPositions): Positions {
  const { north, south, east, west } = MLADOST2_BOUNDS;
  return {
    me: clampToMladost2({
      lat: south + (v1.me.y / 100) * (north - south),
      lng: west + (v1.me.x / 100) * (east - west),
    }),
    partner: clampToMladost2({
      lat: south + (v1.partner.y / 100) * (north - south),
      lng: west + (v1.partner.x / 100) * (east - west),
    }),
  };
}

const MAP_INITIAL_CENTER: [number, number] = [42.6449934, 23.3715953];
const MAP_MIN_ZOOM = 16;
const MAP_MAX_ZOOM = 19;
const MAP_INITIAL_ZOOM = MAP_MAX_ZOOM;

const MLADOST2_MAX_BOUNDS: L.LatLngBoundsExpression = [
  [MLADOST2_BOUNDS.south, MLADOST2_BOUNDS.west],
  [MLADOST2_BOUNDS.north, MLADOST2_BOUNDS.east],
];

const CAR_PHOTO: Record<CarId, { src: string }> = {
  me: { src: "/car-me.png" },
  partner: { src: "/car-partner.png" },
};

function readStoredPositions(): Positions {
  if (typeof window === "undefined") return DEFAULT_POSITIONS;
  try {
    const rawV2 = localStorage.getItem(STORAGE_KEY_V2);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as Positions;
      if (
        parsed?.me?.lat != null &&
        parsed?.me?.lng != null &&
        parsed?.partner?.lat != null &&
        parsed?.partner?.lng != null
      ) {
        return {
          me: clampToMladost2(parsed.me),
          partner: clampToMladost2(parsed.partner),
        };
      }
    }
    const rawV1 = localStorage.getItem(STORAGE_KEY_V1);
    if (rawV1) {
      const parsed = JSON.parse(rawV1) as LegacyPercentPositions;
      if (
        parsed?.me?.x != null &&
        parsed?.me?.y != null &&
        parsed?.partner?.x != null &&
        parsed?.partner?.y != null
      ) {
        return migrateV1ToV2(parsed);
      }
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_POSITIONS;
}

function carIcon(src: string) {
  return L.icon({
    iconUrl: src,
    iconSize: [56, 56],
    iconAnchor: [28, 28],
    className: "rounded-full border-2 border-black shadow-lg",
  });
}

function otherRole(r: CarId): CarId {
  return r === "me" ? "partner" : "me";
}

function resolveInitialRole(): CarId {
  if (typeof window === "undefined") return "me";
  try {
    const u = new URLSearchParams(window.location.search).get("role");
    if (u === "me" || u === "partner") return u;
    const s = localStorage.getItem(ROLE_STORAGE_KEY);
    if (s === "me" || s === "partner") return s;
  } catch {
    /* ignore */
  }
  return "me";
}

function ParkingMapLeafletInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const urlRole = searchParams.get("role");

  const [role, setRole] = useState<CarId>(resolveInitialRole);
  const [positions, setPositions] = useState<Positions>(readStoredPositions);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [partnerUrl, setPartnerUrl] = useState("");
  const [copyHint, setCopyHint] = useState<string | null>(null);

  const draggingRef = useRef(false);
  const roleRef = useRef(role);
  roleRef.current = role;

  useEffect(() => {
    if (urlRole === "me" || urlRole === "partner") {
      setRole(urlRole);
      try {
        localStorage.setItem(ROLE_STORAGE_KEY, urlRole);
      } catch {
        /* ignore */
      }
    }
  }, [urlRole]);

  useEffect(() => {
    setPartnerUrl(
      `${typeof window !== "undefined" ? window.location.origin : ""}${pathname || "/"}?role=partner`,
    );
  }, [pathname]);

  const icons = useMemo(
    () => ({
      me: carIcon(CAR_PHOTO.me.src),
      partner: carIcon(CAR_PHOTO.partner.src),
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/positions", { cache: "no-store" });
        const data = (await res.json()) as {
          ok?: boolean;
          positions?: Positions;
        };
        if (!cancelled && res.ok && data.ok && data.positions) {
          setPositions(data.positions);
          setSyncEnabled(true);
        }
      } catch {
        /* offline or missing KV — keep local */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!syncEnabled) return;
    const t = window.setInterval(async () => {
      if (draggingRef.current) return;
      try {
        const res = await fetch("/api/positions", { cache: "no-store" });
        const data = (await res.json()) as {
          ok?: boolean;
          positions?: Positions;
        };
        if (!res.ok || !data.ok || !data.positions) return;
        const other = otherRole(roleRef.current);
        setPositions((prev) => ({
          ...prev,
          [other]: data.positions![other],
        }));
      } catch {
        /* ignore */
      }
    }, 2500);
    return () => clearInterval(t);
  }, [syncEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(positions));
    } catch {
      /* ignore */
    }
  }, [positions]);

  const persistServer = useCallback(
    async (car: CarId, next: LatLng) => {
      try {
        const res = await fetch("/api/positions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: car,
            lat: next.lat,
            lng: next.lng,
          }),
        });
        if (res.ok) {
          setSyncEnabled(true);
        }
      } catch {
        /* ignore */
      }
    },
    [],
  );

  const onDragStart = useCallback(() => {
    draggingRef.current = true;
  }, []);

  const onDragEnd = useCallback(
    (id: CarId, e: L.DragEndEvent) => {
      draggingRef.current = false;
      const m = e.target;
      if (!(m instanceof L.Marker)) return;
      const ll = m.getLatLng();
      const next = clampToMladost2({ lat: ll.lat, lng: ll.lng });
      setPositions((p) => ({
        ...p,
        [id]: next,
      }));
      void persistServer(id, next);
    },
    [persistServer],
  );

  const copyPartnerLink = useCallback(async () => {
    if (!partnerUrl) return;
    try {
      await navigator.clipboard.writeText(partnerUrl);
      setCopyHint("Link copied");
      window.setTimeout(() => setCopyHint(null), 2000);
    } catch {
      setCopyHint("Could not copy");
      window.setTimeout(() => setCopyHint(null), 2000);
    }
  }, [partnerUrl]);

  return (
    <div className="relative z-0 h-[100dvh] w-full overflow-hidden bg-zinc-200">
      <MapContainer
        center={MAP_INITIAL_CENTER}
        zoom={MAP_INITIAL_ZOOM}
        minZoom={MAP_MIN_ZOOM}
        maxZoom={MAP_MAX_ZOOM}
        maxBounds={MLADOST2_MAX_BOUNDS}
        maxBoundsViscosity={1}
        className="h-full w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={MAP_MAX_ZOOM}
          maxNativeZoom={18}
        />
        {(["me", "partner"] as const).map((id) => {
          const p = positions[id];
          const label = id === "me" ? "Your car" : "Partner’s car";
          const isMine = id === role;
          return (
            <Marker
              key={id}
              position={[p.lat, p.lng]}
              draggable={isMine}
              icon={icons[id]}
              zIndexOffset={id === "me" ? 200 : 100}
              eventHandlers={{
                dragstart: onDragStart,
                dragend: (e) => onDragEnd(id, e),
              }}
              title={label}
            />
          );
        })}
      </MapContainer>

      <div className="pointer-events-none absolute inset-0 z-[1000]">
        <header className="pointer-events-auto absolute left-0 right-0 top-0 z-[1001] flex flex-col gap-2 bg-black/45 px-3 py-2 text-sm text-white backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">Where we parked — Mladost 2</span>
            <div className="flex gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="relative h-5 w-5 overflow-hidden rounded-full border border-black">
                  <Image
                    src={CAR_PHOTO.me.src}
                    alt=""
                    width={40}
                    height={40}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                </span>
                You
              </span>
              <span className="flex items-center gap-1.5">
                <span className="relative h-5 w-5 overflow-hidden rounded-full border border-black">
                  <Image
                    src={CAR_PHOTO.partner.src}
                    alt=""
                    width={40}
                    height={40}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                </span>
                Partner
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-white/20 pt-2 text-xs">
            <span className="text-white/90">
              You move:{" "}
              <strong className="text-white">
                {role === "me" ? "Your car" : "Partner’s car"}
              </strong>
              {syncEnabled ? (
                <span className="text-emerald-300"> · Synced</span>
              ) : (
                <span className="text-amber-200">
                  · Local only — connect Redis on Vercel to sync
                </span>
              )}
            </span>
            {role === "me" ? (
              <button
                type="button"
                onClick={copyPartnerLink}
                className="pointer-events-auto rounded bg-white/15 px-2 py-1 text-white hover:bg-white/25"
              >
                Copy partner link
              </button>
            ) : null}
            {copyHint ? (
              <span className="text-emerald-200">{copyHint}</span>
            ) : null}
          </div>
        </header>
      </div>
    </div>
  );
}

export function ParkingMap() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[100dvh] w-full items-center justify-center bg-zinc-200 text-zinc-600">
          Loading map…
        </div>
      }
    >
      <ParkingMapLeafletInner />
    </Suspense>
  );
}
