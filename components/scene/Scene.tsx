"use client";

import {
  CameraControls,
  Environment,
  Grid,
  Lightformer,
} from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { DoubleSide, Vector3, type PerspectiveCamera } from "three";
import { Suspense, useCallback, useEffect, useRef } from "react";
import { cameraBridge } from "@/lib/cameraViews";
import { lightingUi, useLighting } from "@/lib/lighting";
import { poseStore } from "@/lib/poseStore";
import { viewFlip } from "@/lib/viewFlip";
import { bodyHex, grayHex, OUTLINE_PX, outlineHex, silhouetteHex, stagePalette, useScheme, useSettings } from "@/lib/settings";
import { ORBIT_TARGET, VIEW_PRESETS, type ViewPreset, type ViewRequest } from "@/lib/views";
// Before any shader compiles: smoother soft-shadow filtering.
import "./softShadows";
import { lensCompute } from "./lens";
import { Mannequin } from "./Mannequin";
import { PerspectiveRig } from "./PerspectiveRig";
import { StageLights } from "./StageLights";
import { ViewSnapshots } from "./ViewSnapshots";

/** Environment (reflections + soft bounce) strength at ambient 1. */
const ENV_AT_FULL = 1.9;

export interface SceneProps {
  viewRequest: ViewRequest | null;
  /** Fired when the user starts orbiting/panning/zooming by hand. */
  onUserInteract: () => void;
  onReady?: () => void;
  /** Pixels covered by UI on the left; the figure stays centred in what's left. */
  leftInset?: number;
}

export default function Scene({ viewRequest, onUserInteract, onReady, leftInset = 0 }: SceneProps) {
  const scheme = useScheme();
  const settings = useSettings();
  const lighting = useLighting();
  const c = stagePalette(settings.background, scheme);
  const silhouette = silhouetteHex(c.bg);
  const initial = VIEW_PRESETS.front.position;

  return (
    <Canvas
      // PCF (soft PCF was removed from three); shadow-radius softens it.
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ fov: 35, position: initial, near: 0.05, far: 100 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      aria-label="3D posing stage. Drag the body to pose it; drag around it to orbit, right-drag to pan, scroll to zoom."
      // A click on empty space (not a drag) clears the joint selection.
      onPointerMissed={() => poseStore.select(null)}
    >
      <color attach="background" args={[c.bg]} />
      <fog attach="fog" args={[c.bg, 10, 30]} />

      <StageLights ground={c.ground} />
      {/* Soft studio reflections, generated locally (no HDR download).
          Scaled by the ambient slider so dramatic setups get truly dark shadows. */}
      <Environment resolution={256} frames={1} environmentIntensity={lighting.ambient * ENV_AT_FULL}>
        <Lightformer form="rect" intensity={1.6} position={[0, 5, 4]} scale={[8, 4, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[-5, 2, -2]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={0.6} position={[5, 2, -2]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} />
      </Environment>

      {settings.grid && (
        <Grid
          position={[0, 0.001, 0]}
          args={[40, 40]}
          infiniteGrid
          cellSize={0.25}
          cellThickness={0.6}
          cellColor={c.cell}
          sectionSize={1}
          sectionThickness={1}
          sectionColor={c.section}
          fadeDistance={26}
          fadeStrength={1.6}
          // Visible from underneath too, so worm's-eye views keep a reference plane.
          side={DoubleSide}
        />
      )}

      {/* Invisible floor that only shows the figure's shadow: out to where
          fog hides the floor, so a low light's long shadow never ends at its edge. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.002, 0]} receiveShadow>
        <planeGeometry args={[2 * 40, 2 * 40]} />
        <shadowMaterial transparent opacity={c.shadowOpacity} />
      </mesh>

      <Suspense fallback={null}>
        <Mannequin
          onReady={onReady}
          outline={settings.outlineWeight !== "off"}
          outlineWidth={OUTLINE_PX[settings.outlineWeight]}
          // The outline joins the silhouette's colour, or goes grey with the body.
          outlineColor={
            lighting.silhouette ? silhouette : lighting.grayscale ? grayHex(outlineHex(settings.outlineColor)) : outlineHex(settings.outlineColor)
          }
          bodyColor={bodyHex(settings.bodyColor)}
          silhouette={lighting.silhouette}
          grayscale={lighting.grayscale}
          silhouetteColor={silhouette}
        />
      </Suspense>

      <Rig viewRequest={viewRequest} onUserInteract={onUserInteract} />
      <PerspectiveRig />
      <LensEvents />
      <ViewSnapshots />
      <StageOffset inset={leftInset} />
    </Canvas>
  );
}

/**
 * Pointer events (posing, the light bulbs, the body mover) find what's under
 * the pointer through the lens in use, so they still land on the right part
 * through the fish-eye lens.
 */
function LensEvents() {
  const setEvents = useThree((s) => s.setEvents);
  useEffect(() => setEvents({ compute: lensCompute }), [setEvents]);
  return null;
}

/**
 * Shifts the projection centre right by half the sidebar so the figure sits
 * in the middle of the visible stage. Eased per frame, so it glides with the
 * sidebar instead of jumping when it opens or closes.
 */
function StageOffset({ inset }: { inset: number }) {
  const current = useRef(inset);

  useFrame(({ camera, size }, delta) => {
    const cam = camera as PerspectiveCamera;
    const target = inset;
    // Exponential approach ≈ critically damped feel, frame-rate independent.
    current.current += (target - current.current) * (1 - Math.exp(-delta * 14));
    if (Math.abs(target - current.current) < 0.1) current.current = target;

    // Mirror view shows the picture flipped, so the shift goes the other way
    // to land the figure beside the sidebar on screen.
    const shift = (viewFlip.get() ? 1 : -1) * (current.current / 2);
    const view = cam.view;
    if (view && view.offsetX === shift && view.fullWidth === size.width && view.fullHeight === size.height) return;
    cam.setViewOffset(size.width, size.height, shift, 0, size.width, size.height);
  });

  return null;
}

type DragInternals = {
  _rotateInternal: (dx: number, dy: number) => void;
  _truckInternal: (dx: number, dy: number, dragToOffset: boolean, screenSpace: boolean) => void;
  __mirrored?: boolean;
};

/**
 * camera-controls reads raw pointer movement; in mirror view the picture is
 * flipped, so its horizontal drags are flipped back (vertical stays as is).
 */
function mirrorDrags(cc: CameraControls) {
  const c = cc as unknown as DragInternals;
  if (c.__mirrored) return;
  c.__mirrored = true;
  const rotate = c._rotateInternal;
  const truck = c._truckInternal;
  c._rotateInternal = (dx, dy) => rotate(viewFlip.get() ? -dx : dx, dy);
  c._truckInternal = (dx, dy, a, b) => truck(viewFlip.get() ? -dx : dx, dy, a, b);
}

/** Owns the camera: left-drag orbits, right-drag pans, wheel zooms. */
function Rig({ viewRequest, onUserInteract }: Pick<SceneProps, "viewRequest" | "onUserInteract">) {
  const controls = useRef<CameraControls>(null);
  const getSize = useThree((s) => s.get);

  /**
   * Camera position + target for a preset, framed on the figure wherever it
   * stands (and however high it's lifted), pulled back on portrait screens
   * so the arms fit.
   */
  const presetLookAt = useCallback(
    (preset: ViewPreset): [number, number, number, number, number, number] => {
      const { width, height } = getSize().size;
      const aspect = width / Math.max(height, 1);
      const pullBack = aspect < 1 ? Math.min(1.5, 0.8 / aspect) : 1;
      const [rx, , rz] = poseStore.get().pose.root ?? [0, 0, 0];
      // Aim halfway up a lift, so both the figure and its floor shadow stay in frame.
      const ry = poseStore.get().floorGap / 2;
      const [x, y, z] = VIEW_PRESETS[preset].position;
      const [tx, ty, tz] = ORBIT_TARGET;
      return [
        rx + tx + (x - tx) * pullBack,
        ry + ty + (y - ty) * pullBack,
        rz + tz + (z - tz) * pullBack,
        rx + tx,
        ry + ty,
        rz + tz,
      ];
    },
    [getSize],
  );

  useEffect(() => {
    controls.current?.setLookAt(...presetLookAt("front"), false);
  }, [presetLookAt]);

  useEffect(() => {
    const cc = controls.current;
    if (!viewRequest || !cc) return;
    // The same in both lenses: the fish-eye lens never moves the camera.
    const look = presetLookAt(viewRequest.preset);
    // Orbiting accumulates whole turns (720°, 1080°…); animating straight to
    // the preset would unwind every one of them. Swap in the equivalent angle
    // nearest the destination first (invisible — same direction), so the
    // camera always takes the short way round.
    const goal = Math.atan2(look[0] - look[3], look[2] - look[5]);
    const from = cc.azimuthAngle;
    cc.azimuthAngle = goal + Math.atan2(Math.sin(from - goal), Math.cos(from - goal));
    // Animates from wherever the camera is right now, so a preset tapped
    // mid-transition simply re-targets instead of jumping.
    cc.setLookAt(...look, true);
  }, [viewRequest, presetLookAt]);

  // The lighting panel's preview ball is drawn from the camera's point of
  // view; tell it whenever the view turns (only while the panel is open).
  const lastView = useRef([0, 0, 0, 0]);
  useFrame(({ camera }) => {
    if (!lightingUi.get().open) return;
    const q = camera.quaternion;
    const l = lastView.current;
    if (Math.abs(l[0] * q.x + l[1] * q.y + l[2] * q.z + l[3] * q.w) > 0.99999) return;
    lastView.current = [q.x, q.y, q.z, q.w];
    lightingUi.set({ view: [q.x, q.y, q.z, q.w] });
  });

  // Lets the interface read the exact camera (to save an angle) and send it
  // back there later, gliding rather than jumping.
  useEffect(() => {
    const cc = controls.current;
    if (!cc) return;
    cameraBridge.register({
      get: () => ({
        position: cc.getPosition(new Vector3()).toArray() as [number, number, number],
        target: cc.getTarget(new Vector3()).toArray() as [number, number, number],
      }),
      go: ({ position: [x, y, z], target: [tx, ty, tz] }) => {
        // Take the short way round, however many turns the orbit has wound up.
        const goal = Math.atan2(x - tx, z - tz);
        cc.azimuthAngle = goal + Math.atan2(Math.sin(cc.azimuthAngle - goal), Math.cos(cc.azimuthAngle - goal));
        void cc.setLookAt(x, y, z, tx, ty, tz, true);
      },
    });
    return () => cameraBridge.register(null);
  }, []);

  useEffect(() => {
    // Development-only handle for automated checks (e.g. camera angle).
    if (process.env.NODE_ENV === "development" && controls.current) {
      (window as unknown as { __camera: unknown }).__camera = controls.current;
      (window as unknown as { __scene: unknown }).__scene = getSize().scene;
    }
  }, [getSize]);

  // In mirror view, drags still move the picture the way the pointer goes.
  useEffect(() => {
    if (controls.current) mirrorDrags(controls.current);
  }, []);

  useEffect(() => {
    const cc = controls.current;
    if (!cc) return;
    // controlstart only fires for user input, never for setLookAt.
    cc.addEventListener("controlstart", onUserInteract);
    return () => cc.removeEventListener("controlstart", onUserInteract);
  }, [onUserInteract]);

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={0.8}
      maxDistance={9}
      // Full sphere: straight down to straight up, including under the
      // floor for extreme low angles. (Stops at the poles rather than
      // flipping over, so the horizon never turns upside down.)
      minPolarAngle={0}
      maxPolarAngle={Math.PI}
      smoothTime={0.22}
      draggingSmoothTime={0.08}
    />
  );
}
