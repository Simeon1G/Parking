"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type CarId = "me" | "partner";

const STORAGE_KEY_V2 = "parking-map-positions-v2";
const STORAGE_KEY_V1 = "parking-map-positions-v1";

/** Mladost 2, Sofia — panning is limited to this rectangle. */
const MLADOST2_BOUNDS = {
  north: 42.6485,
  south: 42.6355,
  east: 23.392,
  west: 23.362,
} as const;

/** Where the map first opens — starts at max zoom so the area is as large as allowed. */
const MAP_INITIAL_CENTER: [number, number] = [42.6449934, 23.3715953];
const MAP_MIN_ZOOM = 16;
const MAP_MAX_ZOOM = 19;
const MAP_INITIAL_ZOOM = MAP_MAX_ZOOM;

const MLADOST2_MAX_BOUNDS: L.LatLngBoundsExpression = [
  [MLADOST2_BOUNDS.south, MLADOST2_BOUNDS.west],
  [MLADOST2_BOUNDS.north, MLADOST2_BOUNDS.east],
];

type LatLng = { lat: number; lng: number };
type Positions = Record<CarId, LatLng>;

/** Default pins near the initial view (slightly offset so both stay visible). */
const DEFAULT_POSITIONS: Positions = {
  me: { lat: 42.64485, lng: 23.3714 },
  partner: { lat: 42.64512, lng: 23.3718 },
};

type LegacyPercentPositions = Record<CarId, { x: number; y: number }>;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function clampToMladost2(p: LatLng): LatLng {
  return {
    lat: clamp(p.lat, MLADOST2_BOUNDS.south, MLADOST2_BOUNDS.north),
    lng: clamp(p.lng, MLADOST2_BOUNDS.west, MLADOST2_BOUNDS.east),
  };
}

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

function ParkingMapLeaflet() {
  const [positions, setPositions] = useState<Positions>(readStoredPositions);

  const icons = useMemo(
    () => ({
      me: carIcon(CAR_PHOTO.me.src),
      partner: carIcon(CAR_PHOTO.partner.src),
    }),
    [],
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(positions));
    } catch {
      /* ignore */
    }
  }, [positions]);

  const onDragEnd = useCallback((id: CarId, e: L.DragEndEvent) => {
    const m = e.target;
    if (!(m instanceof L.Marker)) return;
    const ll = m.getLatLng();
    setPositions((p) => ({
      ...p,
      [id]: clampToMladost2({ lat: ll.lat, lng: ll.lng }),
    }));
  }, []);

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
          return (
            <Marker
              key={id}
              position={[p.lat, p.lng]}
              draggable
              icon={icons[id]}
              zIndexOffset={id === "me" ? 200 : 100}
              eventHandlers={{
                dragend: (e) => onDragEnd(id, e),
              }}
              title={label}
            />
          );
        })}
      </MapContainer>

      <div className="pointer-events-none absolute inset-0 z-[1000]">
        <header className="pointer-events-auto absolute left-0 right-0 top-0 z-[1001] flex flex-wrap items-center justify-between gap-2 bg-black/45 px-3 py-2 text-sm text-white backdrop-blur-sm">
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
        </header>
      </div>
    </div>
  );
}

/** Loaded with `next/dynamic` + `ssr: false` in page.tsx so Leaflet never runs on the server. */
export function ParkingMap() {
  return <ParkingMapLeaflet />;
}
