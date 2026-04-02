"use client";

import dynamic from "next/dynamic";

const ParkingMapLazy = dynamic(
  () => import("./parking-map").then((mod) => ({ default: mod.ParkingMap })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-zinc-200 text-zinc-600">
        Loading map…
      </div>
    ),
  },
);

export function ParkingMapClient() {
  return <ParkingMapLazy />;
}
