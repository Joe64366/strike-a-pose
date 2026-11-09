"use client";

import { Html, Line } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import type CameraControlsImpl from "camera-controls";
import { useMemo, useRef, useState } from "react";
import { Color, DoubleSide, Group, Plane, Raycaster, Shape, ShapeGeometry, Vector2, Vector3 } from "three";
import { MAX_LIFT, MAX_TRAVEL, type RootPosition } from "@/lib/poseMath";
import { poseStore, usePoseStore } from "@/lib/poseStore";
import type { Rig } from "./rig";

const ACCENT = new Color("#0a84ff");

function setCursor(el: HTMLElement, cursor: string) {
  el.style.cursor = cursor;
}
const RING_IN = 0.44;
const RING_OUT = 0.475;

/** A small chevron pointing outward, for the four "you can slide me" hints. */
function chevronGeometry() {
  const s = new Shape();
  s.moveTo(-0.045, 0);
  s.lineTo(0, 0.04);
  s.lineTo(0.045, 0);
  s.lineTo(0.032, 0);
  s.lineTo(0, 0.026);
  s.lineTo(-0.032, 0);
  s.closePath();
  return new ShapeGeometry(s);
}

/**
 * Shown when the whole body is selected: a ring on the floor under the
 * figure. Drag it to slide the figure across the floor; hold Shift to lift
 * it into the air. A dashed plumb line and height label appear when lifted.
 */
export function BodyMover({ rig }: { rig: Rig }) {
  const active = usePoseStore((s) => s.selected === "hips");
  const lift = usePoseStore((s) => s.floorGap);
  const { camera, gl } = useThree();
  const getState = useThree((s) => s.get);
  const ring = useRef<Group>(null);
  const plumb = useRef<Group>(null);
  const [hot, setHot] = useState(false);
  const [dragging, setDragging] = useState(false);
  const chevron = useMemo(() => chevronGeometry(), []);
  const hips = rig.byId.hips?.bone;
  const tmp = useMemo(() => new Vector3(), []);

  // Follow the pelvis: the ring sits on the floor directly beneath it.
  useFrame(() => {
    if (!hips || !ring.current) return;
    hips.getWorldPosition(tmp);
    ring.current.position.set(tmp.x, 0.004, tmp.z);
    if (plumb.current) plumb.current.position.set(tmp.x, 0, tmp.z);
  });

  if (!active || !hips) return null;

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const cc = getState().controls as unknown as CameraControlsImpl | null;
    if (cc) cc.enabled = false;
    poseStore.beginEdit();
    poseStore.setDragging(true);
    setDragging(true);

    let start: RootPosition = poseStore.placement();
    const rect = gl.domElement.getBoundingClientRect();
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    const hit = new Vector3();
    const floor = new Plane(new Vector3(0, 1, 0), 0);
    // For lifting: an upright plane through the grab point, facing the camera.
    const facing = camera.getWorldDirection(new Vector3()).setY(0).normalize();
    const wall = new Plane().setFromNormalAndCoplanarPoint(facing, e.point);
    const grabFloor = e.point.clone();
    const grabWall = e.point.clone();
    let mode: "move" | "lift" | null = null;
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

    const move = (ev: PointerEvent) => {
      ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const next: "move" | "lift" = ev.shiftKey ? "lift" : "move";
      if (next !== mode) {
        // Switching mid-drag: continue from wherever the figure is now.
        start = poseStore.placement();
        if (raycaster.ray.intersectPlane(floor, hit)) grabFloor.copy(hit);
        if (raycaster.ray.intersectPlane(wall, hit)) grabWall.copy(hit);
        mode = next;
      }
      if (mode === "lift") {
        // Lifting takes the figure off the floor: grounding turns off for
        // this pose, so it stays up while you pose its limbs.
        if (!raycaster.ray.intersectPlane(wall, hit)) return;
        const h = clamp(
          start[1] + hit.y - grabWall.y,
          poseStore.heightForGap(0),
          poseStore.heightForGap(MAX_LIFT),
        );
        poseStore.setPlacement([start[0], h, start[2]], true);
      } else {
        if (!raycaster.ray.intersectPlane(floor, hit)) return;
        poseStore.setPlacement(
          [
            clamp(start[0] + hit.x - grabFloor.x, -MAX_TRAVEL, MAX_TRAVEL),
            start[1],
            clamp(start[2] + hit.z - grabFloor.z, -MAX_TRAVEL, MAX_TRAVEL),
          ],
          !!poseStore.get().pose.floating,
        );
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (cc) cc.enabled = true;
      poseStore.setDragging(false);
      poseStore.endEdit();
      setDragging(false);
      setCursor(gl.domElement, "");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const strong = hot || dragging;

  return (
    <>
      <group ref={ring}>
        <group rotation-x={-Math.PI / 2}>
          {/* Generous invisible-ish disc: the whole footprint is grabbable. */}
          <mesh
            onPointerDown={onPointerDown}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHot(true);
              setCursor(gl.domElement, "move");
            }}
            onPointerOut={() => {
              setHot(false);
              if (!dragging) setCursor(gl.domElement, "");
            }}
            renderOrder={2}
          >
            <circleGeometry args={[RING_OUT + 0.08, 64]} />
            <meshBasicMaterial color={ACCENT} transparent opacity={strong ? 0.12 : 0.06} depthWrite={false} />
          </mesh>
          <mesh renderOrder={3} raycast={() => {}}>
            <ringGeometry args={[RING_IN, RING_OUT, 96]} />
            <meshBasicMaterial color={ACCENT} transparent opacity={strong ? 0.95 : 0.7} depthWrite={false} side={DoubleSide} />
          </mesh>
          {[0, 1, 2, 3].map((i) => (
            <group key={i} rotation-z={(i * Math.PI) / 2}>
              <mesh geometry={chevron} position={[0, RING_OUT + 0.035, 0]} renderOrder={3} raycast={() => {}}>
                <meshBasicMaterial color={ACCENT} transparent opacity={strong ? 0.95 : 0.7} depthWrite={false} side={DoubleSide} />
              </mesh>
            </group>
          ))}
        </group>
      </group>

      {lift > 0.005 && (
        <group ref={plumb}>
          <Line points={[[0, 0, 0], [0, lift, 0]]} color="#0a84ff" lineWidth={1.5} dashed dashSize={0.04} gapSize={0.03} />
          <Html position={[0, lift / 2, 0]} center zIndexRange={[4, 0]} style={{ pointerEvents: "none" }}>
            <div className="lift-badge">{Math.round(lift * 100)} cm</div>
          </Html>
        </group>
      )}
    </>
  );
}
