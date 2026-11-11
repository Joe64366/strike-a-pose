/**
 * Saved camera angles. A pose can keep several exact views (where the
 * camera stands and what it looks at), so you can always get back to the
 * angle you were drawing from after orbiting away.
 *
 * The camera lives inside the 3D scene; this bridge lets the interface read
 * it and send it somewhere without reaching into the scene.
 */

type V3 = [number, number, number];

export interface CameraView {
  position: V3;
  target: V3;
}

export interface SavedView extends CameraView {
  id: string;
  /** Taken through the fish-eye lens (restoring it turns the lens back on). */
  fisheye: boolean;
  /** Small JPEG of the stage at that angle. */
  thumb?: string;
  createdAt: number;
}

/** Most angles one pose keeps (each carries a small thumbnail). */
export const MAX_VIEWS = 12;

interface CameraApi {
  get(): CameraView;
  go(view: CameraView): void;
}

let api: CameraApi | null = null;

export const cameraBridge = {
  register(next: CameraApi | null) {
    api = next;
  },
  get(): CameraView | null {
    return api?.get() ?? null;
  },
  go(view: CameraView) {
    api?.go(view);
  },
};

/** The same view, near enough (a few mm, a fraction of a degree). */
export function sameView(a: CameraView, b: CameraView, tolerance = 0.01): boolean {
  return a.position.every((n, i) => Math.abs(n - b.position[i]) < tolerance) && a.target.every((n, i) => Math.abs(n - b.target[i]) < tolerance);
}

/**
 * A name for a view, the way an artist would say it: which side of the
 * figure, and how high. "Front left · High angle", "Back · Eye level".
 */
export function describeView(view: CameraView, fisheye: boolean): string {
  const [px, py, pz] = view.position;
  const [tx, ty, tz] = view.target;
  const dx = px - tx;
  const dy = py - ty;
  const dz = pz - tz;
  const az = (Math.atan2(dx, dz) * 180) / Math.PI;
  const el = (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
  // The camera on +X sees the figure's left side.
  const sides = ["Front", "Front left", "Left side", "Back left", "Back", "Back right", "Right side", "Front right"];
  const side = sides[((Math.round(az / 45) % 8) + 8) % 8];
  const height =
    el > 55 ? "Overhead" : el > 12 ? "High angle" : el >= -12 ? "Eye level" : el >= -55 ? "Low angle" : "Worm's-eye";
  return `${side} · ${height}${fisheye ? " · Fish-eye" : ""}`;
}
