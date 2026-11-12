/**
 * Things you set once and forget: theme and stage look. Persisted, and
 * applied before first paint by the inline script in the root layout.
 */

export type Appearance = "system" | "light" | "dark";
export type OutlineWeight = "off" | "thin" | "regular" | "bold";
export type Scheme = "light" | "dark";

/**
 * Mannequin finishes: neutral clays first (best for value studies), then a
 * few soft tints. "Charcoal" pairs with a light outline.
 */
export const BODY_COLORS = [
  { id: "clay", name: "Clay", hex: "#e7e5e2" },
  { id: "porcelain", name: "Porcelain", hex: "#f7f6f3" },
  { id: "stone", name: "Stone", hex: "#b7b5b1" },
  { id: "charcoal", name: "Charcoal", hex: "#55565c" },
  { id: "sand", name: "Sand", hex: "#dcc7a8" },
  { id: "terracotta", name: "Terracotta", hex: "#c98e72" },
  { id: "sage", name: "Sage", hex: "#a9b9a2" },
  { id: "sky", name: "Sky", hex: "#a8bdd3" },
] as const;
export type BodyColorId = (typeof BODY_COLORS)[number]["id"];

/**
 * Contour colours, after the pencils and inks artists actually draw with:
 * ink, graphite, sepia, Prussian blue ink, non-photo blue, the animator's
 * red and green construction pencils, and white for dark bodies.
 */
export const OUTLINE_COLORS = [
  { id: "ink", name: "Ink", hex: "#0d0d0f" },
  { id: "graphite", name: "Graphite", hex: "#4a4a50" },
  { id: "sepia", name: "Sepia", hex: "#5a3d2b" },
  { id: "prussian", name: "Prussian blue", hex: "#1f3d63" },
  { id: "blue", name: "Non-photo blue", hex: "#5b9bd5" },
  { id: "red", name: "Red pencil", hex: "#d0453a" },
  { id: "green", name: "Green pencil", hex: "#3c8a55" },
  { id: "white", name: "White", hex: "#ffffff" },
] as const;
export type OutlineColorId = (typeof OUTLINE_COLORS)[number]["id"];

/** A colour picked freely (Custom), instead of one of the named ones. */
export type HexColor = `#${string}`;
export const isHex = (v: unknown): v is HexColor => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

export const bodyHex = (id: BodyColorId | HexColor) =>
  isHex(id) ? id : (BODY_COLORS.find((c) => c.id === id) ?? BODY_COLORS[0]).hex;
export const outlineHex = (id: OutlineColorId | HexColor) =>
  isHex(id) ? id : (OUTLINE_COLORS.find((c) => c.id === id) ?? OUTLINE_COLORS[0]).hex;

/**
 * Stage backgrounds. Soft, low-saturation tones (like Apple's wallpaper and
 * Freeform paper colours) that keep the black contour readable — nothing
 * so dark that the line art disappears. "Studio" follows the theme.
 */
export const BACKGROUNDS = [
  { id: "studio", name: "Studio", light: "#e9e9ec", dark: "#3f3f45" },
  { id: "paper", name: "Paper", light: "#f3efe7" },
  { id: "sand", name: "Sand", light: "#e6dccd" },
  { id: "sage", name: "Sage", light: "#d8e1d3" },
  { id: "mist", name: "Mist", light: "#d9e2ec" },
  { id: "lavender", name: "Lavender", light: "#e2dfee" },
  { id: "peach", name: "Peach", light: "#f0dccf" },
  { id: "slate", name: "Slate", light: "#5d6572" },
] as const satisfies readonly { id: string; name: string; light: string; dark?: string }[];

export type BackgroundId = (typeof BACKGROUNDS)[number]["id"];

export const OUTLINE_PX: Record<OutlineWeight, number> = { off: 0, thin: 1.5, regular: 2.25, bold: 3.25 };

export interface Settings {
  appearance: Appearance;
  /** A named background, or a custom colour. */
  background: BackgroundId | HexColor;
  grid: boolean;
  bodyColor: BodyColorId | HexColor;
  outlineWeight: OutlineWeight;
  outlineColor: OutlineColorId | HexColor;
  /** The suggestion chips above the prompt box. */
  promptIdeas: boolean;
  /** The tool buttons at the top right and the hide-interface button (their shortcuts always work). */
  showToolbar: boolean;
  /** The prompt bar at the bottom (when off, / brings it up). */
  showPromptBar: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  appearance: "system",
  background: "studio",
  grid: true,
  bodyColor: "clay",
  outlineWeight: "regular",
  outlineColor: "ink",
  promptIdeas: true,
  showToolbar: true,
  showPromptBar: true,
};

export const SETTINGS_KEY = "strike-a-pose:settings:v1";

export function stageColor(id: BackgroundId | HexColor, scheme: Scheme): string {
  if (isHex(id)) return id;
  const bg = BACKGROUNDS.find((b) => b.id === id) ?? BACKGROUNDS[0];
  return scheme === "dark" && "dark" in bg ? bg.dark : bg.light;
}

/** Floor grid and lighting tones derived from the background (any colour, custom included). */
export function stagePalette(id: BackgroundId | HexColor, scheme: Scheme) {
  const bg = stageColor(id, scheme);
  const dark = luminance(bg) < 0.25;
  const toward = dark ? "#ffffff" : "#000000";
  return {
    bg,
    dark,
    cell: mix(bg, toward, dark ? 0.07 : 0.09),
    section: mix(bg, toward, dark ? 0.15 : 0.2),
    ground: mix(bg, "#000000", 0.35),
    shadowOpacity: dark ? 0.42 : 0.16,
  };
}

/* -------------------------------------------------------------- colour */

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

function luminance(hex: string): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * The silhouette's colour: the opposite of the stage, as far as it goes:
 * near-black on a light stage, near-white on a dark one. (Inverting the
 * colour would turn a mid-grey stage into a mid-grey figure.)
 */
export function silhouetteHex(stage: string): string {
  return luminance(stage) > 0.18 ? "#111114" : "#f4f4f6";
}

/** The same colour as a grey of equal lightness. */
export function grayHex(hex: string): string {
  const y = Math.round(0.2126 * rgb(hex)[0] + 0.7152 * rgb(hex)[1] + 0.0722 * rgb(hex)[2]);
  const c = y.toString(16).padStart(2, "0");
  return `#${c}${c}${c}`;
}

/**
 * Runs before first paint (inlined in <head>): sets the scheme and stage
 * colour from saved settings so there's no flash of the wrong theme.
 */
export function themeBootScript(): string {
  const stages = Object.fromEntries(
    BACKGROUNDS.map((b) => [b.id, [b.light, "dark" in b ? b.dark : b.light]]),
  );
  return `(function(){try{
var s=JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})||"{}");
var a=s.appearance||"system";
var d=a==="dark"||(a==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);
var r=document.documentElement;r.dataset.scheme=d?"dark":"light";
var b=s.background||"studio";
var st=/^#[0-9a-f]{6}$/i.test(b)?[b,b]:${JSON.stringify(stages)}[b]||${JSON.stringify(stages.studio)};
r.style.setProperty("--stage",st[d?1:0]);
}catch(e){}})();`;
}
