"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  BufferGeometry,
  CubeCamera,
  Float32BufferAttribute,
  HalfFloatType,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Matrix3,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLCubeRenderTarget,
  type PerspectiveCamera,
  type WebGLRenderer,
} from "three";
import { AXIS_COLORS, usePerspective, usePerspectiveUi, type PerspectiveSettings } from "@/lib/perspective";
import { usePoseStore } from "@/lib/poseStore";
import { NO_SNAPSHOT } from "./snapshotPrep";

/** Chest height of the 1.8 m figure. */
const CENTER_Y = 0.95;
/** Guide lines run this far each way (inside the camera's far plane). */
const GUIDE_LENGTH = 60;
/** Pieces per half-line (see `fan`). */
const SEGMENTS = 24;
const HORIZON_RADIUS = 85;

const deg = (d: number) => (d * Math.PI) / 180;

/* ------------------------------------------------------------- the rig */

/**
 * The fish-eye lens mode: the lens itself and its guides. It never touches
 * the camera: turning the lens on or off shows the same view, just seen
 * through a different lens (curvature is the lens's angle of view).
 */
export function PerspectiveRig() {
  const p = usePerspective();
  const on = usePerspectiveUi((s) => s.on);
  return (
    <>
      {on && p.guides && <Guides settings={p} />}
      {on && <FisheyeLens halfAngle={deg(p.curvature)} />}
    </>
  );
}

/* -------------------------------------------------------------- guides */

/** Points on a ring around `c`, in the plane perpendicular to `d`. */
function ring(c: Vector3, d: Vector3, radius: number, count: number): Vector3[] {
  const a = Math.abs(d.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const u = new Vector3().crossVectors(d, a).normalize();
  const w = new Vector3().crossVectors(d, u).normalize();
  return Array.from({ length: count }, (_, i) => {
    const t = (i / count) * Math.PI * 2;
    return c.clone().addScaledVector(u, Math.cos(t) * radius).addScaledVector(w, Math.sin(t) * radius);
  });
}

function fan(d: Vector3, c: Vector3, count: number, color: string, out: { pos: number[]; col: number[] }) {
  const rgb = [parseInt(color.slice(1, 3), 16) / 255, parseInt(color.slice(3, 5), 16) / 255, parseInt(color.slice(5, 7), 16) / 255];
  // Each line is many short pieces, close together near the figure and
  // longer toward the distance: a single 120 m segment that passes behind
  // the camera doesn't clip reliably everywhere (and the fish-eye's six
  // capture cameras each see a different part of it).
  const steps: number[] = [];
  for (let k = -SEGMENTS; k <= SEGMENTS; k++) steps.push(Math.sign(k) * GUIDE_LENGTH * (k / SEGMENTS) ** 2);
  for (const p of ring(c, d, 1.35, count)) {
    for (let k = 0; k < steps.length - 1; k++) {
      const a = p.clone().addScaledVector(d, steps[k]);
      const b = p.clone().addScaledVector(d, steps[k + 1]);
      out.pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      out.col.push(...rgb, ...rgb);
    }
  }
}

const AXES: Record<"x" | "y" | "z", Vector3> = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1),
};

/**
 * Guide lines as real 3D lines, parallel to the floor grid axes (plus the
 * horizon at eye height). Through the fish-eye lens they bow into the curves
 * of curvilinear perspective, like any other straight line in the scene.
 */
function Guides({ settings }: { settings: PerspectiveSettings }) {
  const camera = useThree((s) => s.camera);
  // Centred on the figure, wherever it's moved to.
  const x = usePoseStore((s) => s.pose.root?.[0] ?? 0);
  const z = usePoseStore((s) => s.pose.root?.[2] ?? 0);
  const lift = usePoseStore((s) => s.floorGap);

  const { strong, horizon } = useMemo(() => {
    const c = new Vector3(x, CENTER_Y + lift, z);
    const count = settings.dense ? 28 : 16;
    const build = (axes: ("x" | "y" | "z")[], n: number) => {
      const out = { pos: [] as number[], col: [] as number[] };
      for (const a of axes) fan(AXES[a], c, n, AXIS_COLORS[a], out);
      const g = new BufferGeometry();
      g.setAttribute("position", new Float32BufferAttribute(out.pos, 3));
      g.setAttribute("color", new Float32BufferAttribute(out.col, 3));
      return g;
    };
    const ringPts: number[] = [];
    for (let i = 0; i < 256; i++) {
      const t = (i / 256) * Math.PI * 2;
      ringPts.push(c.x + Math.cos(t) * HORIZON_RADIUS, 0, c.z + Math.sin(t) * HORIZON_RADIUS);
    }
    const hg = new BufferGeometry();
    hg.setAttribute("position", new Float32BufferAttribute(ringPts, 3));
    const mat = (opacity: number, color?: string) =>
      new LineBasicMaterial({ vertexColors: !color, color, transparent: true, opacity, depthWrite: false, toneMapped: false, fog: false });
    return {
      strong: new LineSegments(build(["x", "z", "y"], count), mat(0.78)),
      horizon: new LineLoop(hg, mat(0.95, AXIS_COLORS.horizon)),
    };
  }, [settings.dense, x, z, lift]);

  useEffect(
    () => () => {
      for (const o of [strong, horizon]) {
        o.geometry.dispose();
        (o.material as LineBasicMaterial).dispose();
      }
    },
    [strong, horizon],
  );

  // The horizon is at the camera's own height, wherever it moves.
  useFrame(() => followHeight(horizon, camera.position.y));

  // Guides are a drawing aid, left out of camera-angle thumbnails.
  return (
    <>
      <primitive object={strong} renderOrder={5} userData={NO_SNAPSHOT} />
      <primitive object={horizon} renderOrder={5} userData={NO_SNAPSHOT} />
    </>
  );
}

function followHeight(o: LineLoop, y: number) {
  o.position.y = y;
}

/* ------------------------------------------------------------- fish-eye */

const FISHEYE_FRAGMENT = /* glsl */ `
  uniform samplerCube tCube;
  uniform mat3 rot;
  uniform float halfAngle;
  uniform float aspect;
  uniform vec2 center;
  uniform vec3 background;
  varying vec2 vUv;
  void main() {
    // Equidistant fish-eye: distance from the centre is proportional to the
    // angle off the lens axis (top edge = halfAngle).
    vec2 p = ( vUv - center ) * vec2( aspect, 1.0 ) * 2.0;
    float rho = length( p );
    float theta = rho * halfAngle;
    if ( theta > 3.14159 ) {
      gl_FragColor = vec4( background, 1.0 );
    } else {
      vec2 d = rho > 1e-6 ? p / rho : vec2( 0.0 );
      vec3 view = vec3( sin( theta ) * d.x, sin( theta ) * d.y, - cos( theta ) );
      gl_FragColor = vec4( textureCube( tCube, rot * view ).rgb, 1.0 );
    }
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface FisheyePass {
  cube: WebGLCubeRenderTarget;
  cubeCamera: CubeCamera;
  quadScene: Scene;
  quadCamera: OrthographicCamera;
  material: ShaderMaterial;
}

/** The lens's resources: a cube capture and the full-frame re-projection. */
export function createFisheyePass(cubeSize: number): FisheyePass {
  const cube = new WebGLCubeRenderTarget(cubeSize, { type: HalfFloatType, generateMipmaps: false });
  const cubeCamera = new CubeCamera(0.05, 100, cube);
  const material = new ShaderMaterial({
    uniforms: {
      tCube: { value: cube.texture },
      rot: { value: new Matrix3() },
      halfAngle: { value: 1 },
      aspect: { value: 1 },
      center: { value: new Vector2(0.5, 0.5) },
      background: { value: new Vector3() },
    },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }",
    fragmentShader: FISHEYE_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  const quadScene = new Scene();
  quadScene.add(new Mesh(new PlaneGeometry(2, 2), material));
  return { cube, cubeCamera, quadScene, quadCamera: new OrthographicCamera(-1, 1, 1, -1, 0, 1), material };
}

export function disposeFisheyePass(pass: FisheyePass) {
  pass.cube.dispose();
  pass.material.dispose();
}

/**
 * Draw `scene` through the lens, as seen from `camera`, into the current
 * viewport. `aspect` is the frame's width / height; `centerX` the optical
 * centre across it (0–1).
 */
export function renderFisheye(
  pass: FisheyePass,
  gl: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  { halfAngle, aspect, centerX }: { halfAngle: number; aspect: number; centerX: number },
) {
  camera.updateMatrixWorld();
  pass.cubeCamera.position.copy(camera.position);
  pass.cubeCamera.update(gl, scene);

  const u = pass.material.uniforms;
  u.rot.value.setFromMatrix4(camera.matrixWorld);
  u.halfAngle.value = halfAngle;
  u.aspect.value = aspect;
  u.center.value.set(centerX, 0.5);
  const bg = scene.background as { r: number; g: number; b: number } | null;
  if (bg && "r" in bg) u.background.value.set(bg.r, bg.g, bg.b);

  gl.setRenderTarget(null);
  gl.render(pass.quadScene, pass.quadCamera);
}

/**
 * A true curvilinear lens: the scene is captured in every direction from the
 * camera (a cube map), then re-projected through an equidistant fish-eye
 * mapping. Sharp at any curvature, and straight lines bow exactly as in
 * curvilinear perspective drawing.
 */
function FisheyeLens({ halfAngle }: { halfAngle: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;

  const pass = useMemo(() => createFisheyePass(1024), []);
  useEffect(() => () => disposeFisheyePass(pass), [pass]);

  // Priority 1: we render the frame ourselves (the default render pauses).
  useFrame(() => {
    const size = gl.getDrawingBufferSize(new Vector2());
    // Optical centre follows the visible stage (it shifts right of the sidebar).
    const view = camera.view;
    renderFisheye(pass, gl, scene, camera, {
      halfAngle,
      aspect: size.x / Math.max(size.y, 1),
      centerX: view ? 0.5 - view.offsetX / view.fullWidth : 0.5,
    });
  }, 1);

  return null;
}
