import type { RootState } from "@react-three/fiber";
import { Vector3, type Camera, type Object3D, type PerspectiveCamera, type Raycaster, type Vector2 } from "three";
import { perspective } from "@/lib/perspective";
import { viewFlip } from "@/lib/viewFlip";

/**
 * Screen ↔ scene through whatever lens is on. With the fish-eye lens the
 * picture isn't a plain perspective projection (PerspectiveRig re-projects a
 * cube capture through an equidistant fish-eye), so a pointer's ray and a
 * label's screen spot must go through the same mapping, or a click lands on
 * the wrong body part and labels float away from what they name.
 *
 * Mapping (as in PerspectiveRig's shader): the canvas point p, measured from
 * the optical centre in units of half the canvas height, looks along the
 * direction at angle |p| · halfAngle from the lens axis.
 */

const DEG = Math.PI / 180;
const tmp = new Vector3();
const labelAt = new Vector3();

export const lensOn = () => perspective.ui().on;
const halfAngle = () => perspective.get().curvature * DEG;

/** Optical centre across the canvas (0–1): it follows the visible stage beside the sidebar. */
function centerX(camera: Camera) {
  const view = (camera as PerspectiveCamera).view;
  // Exactly as the lens shader reads it (setLensUniforms).
  return view ? 0.5 - view.offsetX / view.fullWidth : 0.5;
}

/** Aim `raycaster` through the canvas point at `ndc` (−1…1, y up). */
export function setPointerRay(raycaster: Raycaster, ndc: Vector2, camera: Camera, aspect: number) {
  if (!lensOn()) return raycaster.setFromCamera(ndc, camera);
  const px = ((ndc.x + 1) / 2 - centerX(camera)) * aspect * 2;
  const py = ndc.y;
  const rho = Math.hypot(px, py);
  const theta = Math.min(Math.PI, rho * halfAngle());
  const s = rho > 1e-6 ? Math.sin(theta) / rho : 0;
  raycaster.camera = camera;
  raycaster.ray.origin.setFromMatrixPosition(camera.matrixWorld);
  raycaster.ray.direction.set(px * s, py * s, -Math.cos(theta)).transformDirection(camera.matrixWorld);
}

/** Where a world point appears on the canvas, in CSS pixels from its top left. */
export function projectToCanvas(point: Vector3, camera: Camera, width: number, height: number): [number, number] {
  if (!lensOn()) {
    tmp.copy(point).project(camera);
    return [((tmp.x + 1) / 2) * width, ((1 - tmp.y) / 2) * height];
  }
  tmp.copy(point).applyMatrix4(camera.matrixWorldInverse);
  const len = tmp.length() || 1;
  const theta = Math.acos(Math.max(-1, Math.min(1, -tmp.z / len)));
  const r = Math.hypot(tmp.x, tmp.y);
  const rho = theta / halfAngle();
  const px = r > 1e-9 ? (tmp.x / r) * rho : 0;
  const py = r > 1e-9 ? (tmp.y / r) * rho : 0;
  const aspect = width / Math.max(height, 1);
  return [(centerX(camera) + px / (2 * aspect)) * width, (0.5 - py / 2) * height];
}

/**
 * A pointer's screen position → the canvas point under it (−1…1, y up).
 * In mirror view the canvas is shown flipped, so the left of the screen is
 * the right of the picture.
 */
export function pointerNdc(clientX: number, clientY: number, rect: DOMRect, out: Vector2) {
  const u = (clientX - rect.left) / rect.width;
  return out.set((viewFlip.get() ? 1 - u : u) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
}

/** A canvas x (CSS px from the picture's left) → where it appears on screen. */
export function canvasToClientX(x: number, rect: DOMRect) {
  return viewFlip.get() ? rect.right - x : rect.left + x;
}

/** R3F's pointer → ray step, through the lens and the mirror view (`setEvents({ compute })`). */
export function lensCompute(event: PointerEvent | MouseEvent | WheelEvent, state: RootState) {
  pointerNdc(event.clientX, event.clientY, state.gl.domElement.getBoundingClientRect(), state.pointer);
  setPointerRay(state.raycaster, state.pointer, state.camera, state.size.width / Math.max(state.size.height, 1));
}

/** drei Html's screen position, through the lens. */
export function lensCalculatePosition(el: Object3D, camera: Camera, size: { width: number; height: number }) {
  return projectToCanvas(labelAt.setFromMatrixPosition(el.matrixWorld), camera, size.width, size.height);
}

/**
 * How much bigger an on-screen-sized marker must be through the lens to look
 * the same size: the lens spreads its (much wider) view over the same pixels.
 */
export function lensMarkerScale(camera: Camera) {
  if (!lensOn()) return 1;
  const fov = (camera as PerspectiveCamera).fov ?? 35;
  return halfAngle() / ((fov / 2) * DEG);
}
