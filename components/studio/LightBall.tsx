"use client";

import { useEffect, useRef } from "react";
import {
  anglesOf,
  describeDirection,
  fromView,
  LIGHT_IDS,
  LIGHT_INFO,
  lightingStore,
  lightingUi,
  paintBall,
  viewDirection,
  type LightId,
  type Lighting,
  type ViewQuat,
} from "@/lib/lighting";

const FRONT: ViewQuat = [0, 0, 0, 1];
/** How far past the rim (as a share of the radius) carries a light fully behind. */
const WRAP = 0.3;

/** A sphere lit like the figure. Used for preset thumbnails and the direction control. */
function useBallCanvas(size: number, lighting: Lighting, view: ViewQuat, body: string) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const px = Math.round(size * Math.min(2, window.devicePixelRatio || 1));
    if (el.width !== px) {
      el.width = px;
      el.height = px;
    }
    const img = ctx.createImageData(px, px);
    paintBall(img, lighting, view, body);
    ctx.putImageData(img, 0, 0);
  }, [size, lighting, view, body]);
  return canvas;
}

export function BallThumb({ size, lighting, body }: { size: number; lighting: Lighting; body: string }) {
  const canvas = useBallCanvas(size, lighting, FRONT, body);
  return <canvas ref={canvas} style={{ width: size, height: size }} aria-hidden className="block" />;
}

/**
 * The direction control. The ball shows the current lighting as seen from
 * the camera; each light is a dot where its light comes from. Drag a dot
 * (or anywhere, for the selected light) and the light follows; drag past
 * the rim to carry it round behind the figure (hollow dot). Arrow keys
 * nudge the selected light.
 */
export function LightBall({
  size,
  lighting,
  view,
  body,
  selected,
  mirrored = false,
}: {
  size: number;
  lighting: Lighting;
  view: ViewQuat;
  body: string;
  selected: LightId;
  /** Mirror view: the ball flips with the stage, and drags and arrows follow the screen. */
  mirrored?: boolean;
}) {
  const canvas = useBallCanvas(size, lighting, view, body);
  const pad = Math.round(size * 0.16);
  const r = size / 2 - 1;
  /** Screen x ↔ the ball's own x. */
  const sx = mirrored ? -1 : 1;
  const box = size + pad * 2;

  const dots = LIGHT_IDS.map((id) => {
    const spec = lighting.lights[id];
    const [x, y, z] = viewDirection(spec, view);
    return { id, spec, x: box / 2 + sx * x * r, y: box / 2 - y * r, front: z >= -0.02 };
  });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const at = (ev: { clientX: number; clientY: number }) => ({
      x: ev.clientX - rect.left,
      y: ev.clientY - rect.top,
    });
    // Grab the nearest dot if the press lands on one; otherwise the selected light.
    const p = at(e);
    const hit = dots
      .map((d) => ({ d, dist: Math.hypot(d.x - p.x, d.y - p.y) }))
      .filter((h) => h.dist < 14)
      .sort((a, b) => a.dist - b.dist)[0];
    const id = hit ? hit.d.id : selected;
    el.setPointerCapture(e.pointerId);
    el.focus({ preventScroll: true });
    lightingUi.set({ selected: id, dragging: id });

    const start = viewDirection(lightingStore.get().lights[id], view);
    let side = start[2] >= 0 ? 1 : -1;
    let past = 0;
    const move = (ev: { clientX: number; clientY: number }) => {
      const q = at(ev);
      const nx = (sx * (q.x - box / 2)) / r;
      const ny = -(q.y - box / 2) / r;
      const rr = Math.hypot(nx, ny);
      let v: [number, number, number];
      if (rr <= 1) {
        if (past > 0.35) side = -side;
        past = 0;
        v = [nx, ny, side * Math.sqrt(1 - rr * rr)];
      } else {
        past = Math.min(1, (rr - 1) / WRAP) * (Math.PI / 2);
        const c = Math.cos(past) / rr;
        v = [nx * c, ny * c, -side * Math.sin(past)];
      }
      const w = fromView(v, view);
      const { azimuth, elevation } = anglesOf(...w);
      lightingStore.setLight(id, { azimuth: Math.round(azimuth), elevation: Math.round(elevation) });
    };
    // A plain press (no drag on a dot) moves the selected light there too.
    if (!hit) move(e);
    const onMove = (ev: PointerEvent) => move(ev);
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      lightingUi.set({ dragging: null });
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const spec = lightingStore.get().lights[selected];
    const step = e.shiftKey ? 15 : 5;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      lightingStore.setLight(selected, { elevation: spec.elevation + (e.key === "ArrowUp" ? step : -step) });
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      // Move the light the way the arrow points *on screen*, whichever way the camera faces.
      const want = (e.key === "ArrowRight" ? 1 : -1) * sx;
      const x0 = viewDirection(spec, view)[0];
      const x1 = viewDirection({ ...spec, azimuth: spec.azimuth + step }, view)[0];
      const sign = (x1 - x0) * want >= 0 ? 1 : -1;
      lightingStore.setLight(selected, { azimuth: spec.azimuth + sign * step });
    }
  };

  const sel = lighting.lights[selected];

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={`${LIGHT_INFO[selected].name} light direction`}
      aria-valuetext={describeDirection(sel.azimuth, sel.elevation)}
      aria-valuenow={Math.round(sel.azimuth)}
      aria-valuemin={-180}
      aria-valuemax={180}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className="light-ball relative mx-auto cursor-crosshair touch-none rounded-full outline-none select-none"
      style={{ width: box, height: box }}
    >
      {/* Faint ring: past it, a light goes round behind the figure. */}
      <span
        aria-hidden
        className="absolute rounded-full border border-dashed border-label-3"
        style={{ inset: pad - Math.round(size * WRAP * 0.5), opacity: 0.6 }}
      />
      <canvas
        ref={canvas}
        aria-hidden
        className="absolute rounded-full shadow-[0_6px_18px_rgb(0_0_0/0.18)]"
        style={{ left: pad, top: pad, width: size, height: size, transform: mirrored ? "scaleX(-1)" : undefined }}
      />
      {dots
        .slice()
        // Selected on top.
        .sort((a, b) => Number(a.id === selected) - Number(b.id === selected))
        .map((d) => {
          const isSel = d.id === selected;
          const dim = d.spec.on ? 1 : 0.45;
          return (
            <span
              key={d.id}
              aria-hidden
              className="pointer-events-none absolute flex items-center justify-center"
              style={{ left: d.x, top: d.y, transform: "translate(-50%, -50%)", opacity: dim }}
            >
              <span
                className="block rounded-full"
                style={{
                  width: isSel ? 18 : 13,
                  height: isSel ? 18 : 13,
                  background: d.front ? d.spec.color : "transparent",
                  border: d.front ? "2px solid #fff" : `2px dashed ${d.spec.color === "#ffffff" ? "#fff" : d.spec.color}`,
                  boxShadow: isSel
                    ? "0 0 0 2.5px var(--accent), 0 1px 5px rgb(0 0 0 / 0.45)"
                    : "0 1px 4px rgb(0 0 0 / 0.45)",
                }}
              />
              {/* Only the light being edited is named; the tabs colour-code the rest. */}
              {isSel && (
                <span
                  className="absolute top-full mt-0.5 text-[10px] font-semibold whitespace-nowrap text-white"
                  style={{ textShadow: "0 1px 2px rgb(0 0 0 / 0.7)" }}
                >
                  {LIGHT_INFO[d.id].name}
                  {!d.front && " (behind)"}
                </span>
              )}
            </span>
          );
        })}
    </div>
  );
}
