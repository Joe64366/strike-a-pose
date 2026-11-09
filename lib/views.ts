export type ViewPreset = "front" | "threeQuarter" | "side" | "back";

type Vec3 = [number, number, number];

/** Camera orbits the mannequin's chest; the model is 1.8m tall with feet at y=0. */
export const ORBIT_TARGET: Vec3 = [0, 0.95, 0];

export const VIEW_PRESETS: Record<ViewPreset, { label: string; name: string; position: Vec3 }> = {
  front: { label: "Front", name: "Front view", position: [0, 1.15, 4.6] },
  threeQuarter: { label: "¾", name: "Three-quarter view", position: [3.2, 1.3, 3.3] },
  side: { label: "Side", name: "Side view", position: [4.6, 1.15, 0] },
  back: { label: "Back", name: "Back view", position: [0, 1.15, -4.6] },
};

export const VIEW_ORDER: ViewPreset[] = ["front", "threeQuarter", "side", "back"];

export type ViewRequest = { preset: ViewPreset; nonce: number };
