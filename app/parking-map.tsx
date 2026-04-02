"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CarId = "me" | "partner";

const STORAGE_KEY = "parking-map-positions-v1";

type Positions = Record<CarId, { x: number; y: number }>;

const DEFAULT_POSITIONS: Positions = {
  me: { x: 30, y: 45 },
  partner: { x: 70, y: 55 },
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function CarIcon({ fill }: { fill: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-8 w-8 drop-shadow-md"
      aria-hidden
    >
      <path
        fill={fill}
        d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"
      />
    </svg>
  );
}

export function ParkingMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<CarId | null>(null);
  const [positions, setPositions] = useState<Positions>(DEFAULT_POSITIONS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Positions;
      if (
        parsed?.me?.x != null &&
        parsed?.me?.y != null &&
        parsed?.partner?.x != null &&
        parsed?.partner?.y != null
      ) {
        setPositions(parsed);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
    } catch {
      /* ignore */
    }
  }, [positions]);

  const updateFromPointer = useCallback((clientX: number, clientY: number) => {
    const el = containerRef.current;
    const id = draggingRef.current;
    if (!el || !id) return;
    const rect = el.getBoundingClientRect();
    const x = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = clamp(((clientY - rect.top) / rect.height) * 100, 0, 100);
    setPositions((p) => ({ ...p, [id]: { x, y } }));
  }, []);

  /** Native listeners (non-passive) — React’s synthetic touch handlers are passive by default. */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const pointerDownOpts: AddEventListenerOptions = { passive: false, capture: true };
    const moveOpts: AddEventListenerOptions = { passive: false, capture: true };
    const captureOpts: AddEventListenerOptions = { capture: true };

    const findMarker = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof Element)) return null;
      return target.closest("[data-car-marker]");
    };

    const onPointerDown = (e: PointerEvent) => {
      const marker = findMarker(e.target);
      if (!marker || !container.contains(marker)) return;
      const id = marker.getAttribute("data-car-marker") as CarId | null;
      if (id !== "me" && id !== "partner") return;
      e.preventDefault();
      draggingRef.current = id;
      marker.setPointerCapture(e.pointerId);
      updateFromPointer(e.clientX, e.clientY);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      e.preventDefault();
      updateFromPointer(e.clientX, e.clientY);
    };

    const endDrag = () => {
      draggingRef.current = null;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const marker = findMarker(e.target);
      if (!marker || !container.contains(marker)) return;
      const id = marker.getAttribute("data-car-marker") as CarId | null;
      if (id !== "me" && id !== "partner") return;
      e.preventDefault();
      draggingRef.current = id;
      const t = e.touches[0];
      updateFromPointer(t.clientX, t.clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!draggingRef.current) return;
      e.preventDefault();
      const t = e.touches[0];
      if (!t) return;
      updateFromPointer(t.clientX, t.clientY);
    };

    container.addEventListener("pointerdown", onPointerDown, pointerDownOpts);
    window.addEventListener("pointermove", onPointerMove, moveOpts);
    window.addEventListener("pointerup", endDrag, captureOpts);
    window.addEventListener("pointercancel", endDrag, captureOpts);
    container.addEventListener("touchstart", onTouchStart, pointerDownOpts);
    window.addEventListener("touchmove", onTouchMove, moveOpts);
    window.addEventListener("touchend", endDrag, captureOpts);
    window.addEventListener("touchcancel", endDrag, captureOpts);

    return () => {
      container.removeEventListener("pointerdown", onPointerDown, pointerDownOpts);
      window.removeEventListener("pointermove", onPointerMove, moveOpts);
      window.removeEventListener("pointerup", endDrag, captureOpts);
      window.removeEventListener("pointercancel", endDrag, captureOpts);
      container.removeEventListener("touchstart", onTouchStart, pointerDownOpts);
      window.removeEventListener("touchmove", onTouchMove, moveOpts);
      window.removeEventListener("touchend", endDrag, captureOpts);
      window.removeEventListener("touchcancel", endDrag, captureOpts);
    };
  }, [updateFromPointer]);

  return (
    <div
      ref={containerRef}
      className="relative h-[100dvh] w-full touch-none overflow-hidden bg-zinc-200"
    >
      <img
        src="/parking-region.png"
        alt="Parking area map"
        className="pointer-events-none absolute inset-0 z-0 h-full w-full select-none object-cover object-center"
        draggable={false}
      />

      <div className="pointer-events-none absolute inset-0 z-10">
        <header className="pointer-events-auto absolute left-0 right-0 top-0 z-20 flex flex-wrap items-center justify-between gap-2 bg-black/45 px-3 py-2 text-sm text-white backdrop-blur-sm">
          <span className="font-medium">Where we parked</span>
          <div className="flex gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: "#2563eb" }}
              />
              You
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: "#db2777" }}
              />
              Partner
            </span>
          </div>
        </header>

        {(["me", "partner"] as const).map((id) => {
          const { x, y } = positions[id];
          const color = id === "me" ? "#2563eb" : "#db2777";
          const label = id === "me" ? "Your car" : "Partner’s car";
          return (
            <div
              key={id}
              role="button"
              tabIndex={0}
              data-car-marker={id}
              aria-label={label}
              title={label}
              className="pointer-events-auto absolute z-30 flex min-h-[48px] min-w-[48px] touch-none cursor-grab items-center justify-center rounded-full border-2 border-white bg-white/90 p-1 shadow-lg outline-none active:cursor-grabbing"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <CarIcon fill={color} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
