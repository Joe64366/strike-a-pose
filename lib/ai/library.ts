/**
 * The reference library: real human poses (extracted from motion capture
 * by scripts/build-pose-library.ts) that the model studies before posing.
 *
 * They are *references*, not templates: the model is shown the few most
 * relevant ones so it learns how real bodies arrange themselves for that
 * kind of action (how a kneeling body's legs fold, how arms swing in a
 * run), then composes a new pose for the request — mixing, adapting, or
 * ignoring them as the prompt demands.
 */

import type { JointId } from "../joints";
import type { AiAngles, AiHandShape } from "./spec";

export interface LibraryPose {
  id: string;
  /** Source animation name, e.g. "Crying", "Sitting Idle". */
  name: string;
  /** What the body is doing: "kneeling", "hands to face", "airborne"… */
  tags: string[];
  pose: Partial<Record<JointId, AiAngles>>;
  left_hand: AiHandShape;
  right_hand: AiHandShape;
  stick_to_floor: boolean;
  lift_cm: number;
}

/**
 * Words people use → words in the library's names and tags. Keeps retrieval
 * fast and local (no embedding call) while still catching "sobbing" →
 * crying/sad, "brawl" → punch/kick, "nap" → sleeping/lying.
 */
const SYNONYMS: Record<string, string[]> = {
  cry: ["crying", "sad", "defeated", "head down", "hands to face"],
  sob: ["crying", "sad", "hands to face"],
  weep: ["crying", "sad"],
  sad: ["sad", "crying", "defeated", "head down"],
  depressed: ["sad", "defeated", "head down"],
  grief: ["crying", "sad", "kneeling"],
  defeat: ["defeated", "kneeling", "head down"],
  lose: ["defeated"],
  tired: ["defeated", "sad", "sitting"],
  happy: ["happy", "cheering", "laughing", "victory"],
  joy: ["cheering", "jumping", "victory", "happy"],
  celebrate: ["cheering", "victory", "fist pump", "arms raised"],
  win: ["victory", "cheering", "fist pump"],
  excited: ["cheering", "jumping", "fist pump"],
  laugh: ["laughing"],
  angry: ["punching", "reacting"],
  scared: ["reacting", "crouching", "falling"],
  surprised: ["reacting"],
  shock: ["reacting"],
  think: ["thinking", "hand to face"],
  ponder: ["thinking"],
  confused: ["thinking", "looking around"],
  kneel: ["kneeling", "kneel"],
  knee: ["kneeling"],
  pray: ["kneeling", "head down"],
  propose: ["kneeling"],
  sit: ["sitting", "sitting on floor"],
  seat: ["sitting"],
  chair: ["sitting"],
  floor: ["sitting on floor", "lying", "crawling"],
  ground: ["sitting on floor", "lying"],
  crouch: ["crouching", "crouch"],
  squat: ["crouching"],
  hide: ["crouching", "sneaking"],
  sneak: ["sneaking", "crouching"],
  tiptoe: ["sneaking"],
  lie: ["lying", "laying", "sleeping"],
  lay: ["lying", "laying"],
  lying: ["lying", "laying"],
  sleep: ["sleeping", "laying", "lying"],
  nap: ["sleeping", "lying"],
  rest: ["sleeping", "sitting"],
  relax: ["sitting", "lying", "idle"],
  stand: ["standing", "idle"],
  idle: ["idle", "standing"],
  run: ["running", "sprint", "stride"],
  sprint: ["sprint", "running", "stride"],
  jog: ["running"],
  flee: ["running", "sprint"],
  chase: ["running", "sprint"],
  walk: ["walking", "stride"],
  stroll: ["walking"],
  jump: ["jumping", "airborne"],
  leap: ["jumping", "airborne"],
  hop: ["jumping"],
  fly: ["airborne", "jumping"],
  fall: ["falling", "airborne"],
  trip: ["falling"],
  land: ["landing", "hard landing"],
  superhero: ["hard landing", "landing", "kneeling", "action"],
  hero: ["hard landing", "action", "dynamic"],
  fight: ["punching", "kicking", "sword", "combo punch"],
  brawl: ["punching", "kicking"],
  box: ["punching", "combo punch"],
  punch: ["punching", "combo punch", "punch"],
  hit: ["punching"],
  kick: ["kicking", "kick", "mma kick", "side kick", "flip kick", "drop kick"],
  karate: ["kick", "punching"],
  martial: ["kick", "punching"],
  sword: ["sword", "slash"],
  slash: ["slash", "sword"],
  attack: ["slash", "punching", "kick"],
  shield: ["shield", "sword"],
  bow: ["draw arrow", "leaning forward"],
  arrow: ["draw arrow"],
  archer: ["draw arrow"],
  throw: ["throw", "throw object"],
  pitch: ["throw"],
  toss: ["throw"],
  climb: ["climbing", "climbing up wall", "ladder", "rope"],
  crawl: ["crawling", "low crawl", "zombie crawl"],
  zombie: ["zombie crawl"],
  dance: ["dance", "dancing"],
  ballet: ["dance", "leg raised"],
  ballerina: ["dance", "leg raised"],
  arabesque: ["leg raised", "dance"],
  pirouette: ["dance", "turn"],
  gymnast: ["flip kick", "leg raised", "hands on floor"],
  telescope: ["hand to face"],
  binoculars: ["hand to face"],
  spyglass: ["hand to face"],
  wave: ["waving"],
  hello: ["waving"],
  bye: ["waving"],
  greet: ["waving", "salute"],
  salute: ["salute"],
  point: ["pointing"],
  clap: ["clapping", "sitting clap"],
  applaud: ["clapping"],
  cheer: ["cheering"],
  phone: ["talking on phone", "texting"],
  call: ["talking on phone"],
  text: ["texting"],
  drink: ["drinking"],
  eat: ["drinking"],
  pick: ["picking up"],
  lift: ["picking up"],
  grab: ["picking up"],
  push: ["push", "pushing"],
  pushup: ["push up"],
  exercise: ["push up", "running"],
  workout: ["push up"],
  look: ["looking around", "crouch look around corner"],
  search: ["looking around"],
  peek: ["crouch look around corner"],
  turn: ["turn", "twisted torso"],
  pose: ["pose", "dynamic", "action"],
  model: ["pose", "standing pose"],
  action: ["action", "dynamic"],
  dynamic: ["dynamic", "action"],
  slide: ["running slide"],
  stretch: ["arms raised"],
  reach: ["reaching forward", "arms raised"],
  hug: ["arms forward"],
  float: ["airborne", "falling idle"],
  hover: ["airborne"],
  levitate: ["airborne"],
  astronaut: ["airborne", "falling idle"],
  swim: ["airborne", "lying face down"],
  dive: ["airborne", "falling"],
  cartwheel: ["hands on floor", "airborne", "flip kick"],
  handstand: ["hands on floor"],
  flip: ["flip kick", "airborne"],
  acrobat: ["flip kick", "airborne"],
  meditate: ["sitting on floor", "ground sitting"],
  yoga: ["stride", "leg raised", "sitting on floor"],
  beg: ["kneeling"],
  surrender: ["arms raised", "kneeling"],
  bored: ["idle", "standing", "sitting"],
  wait: ["idle", "looking around"],
  shy: ["sad idle", "head down"],
  proud: ["victory", "standing pose"],
  confident: ["standing pose", "action pose"],
  heroic: ["action pose", "dynamic pose"],
  sexy: ["standing pose", "dance pose"],
  elegant: ["dance pose", "standing pose"],
  injured: ["defeated", "crawling", "falling flat"],
  hurt: ["defeated", "reacting"],
  dodge: ["reacting", "crouching"],
  block: ["shield", "reacting"],
  shoot: ["draw arrow", "pointing"],
  aim: ["draw arrow", "pointing"],
  football: ["kicking", "running"],
  soccer: ["kicking", "running"],
  basketball: ["jumping", "throw"],
  baseball: ["throw"],
  tennis: ["sword", "slash"],
  golf: ["sword", "slash"],
};

/** Synonym keys stemmed the same way as the prompt ("propose" ↔ "proposing"). */
const STEMMED_SYNONYMS = new Map<string, string[]>();
function synonymsFor(word: string) {
  if (!STEMMED_SYNONYMS.size)
    for (const [k, v] of Object.entries(SYNONYMS)) STEMMED_SYNONYMS.set(stem(k), [...(STEMMED_SYNONYMS.get(stem(k)) ?? []), ...v]);
  return STEMMED_SYNONYMS.get(stem(word)) ?? [];
}

const STOP = new Set([
  "a", "an", "the", "of", "on", "in", "at", "with", "and", "to", "while", "is", "pose", "person", "someone", "their", "his", "her", "my", "very", "like",
  // Sides and amounts say how, not what: "raise the LEFT arm" mustn't fetch "Left Strafe Walking".
  "left", "right", "higher", "lower", "more", "less", "bit", "little", "slightly", "both", "other", "make", "it", "them",
]);

/**
 * Words that name a body part or direction rather than an activity. They
 * still count, but at half weight, so "looking through a telescope" isn't
 * won by "Crouch LOOK Around Corner" on that word alone.
 */
const GENERIC = new Set(["look", "arm", "leg", "hand", "head", "body", "up", "down", "rais", "forward", "back", "stand", "idl"]);

/**
 * Light stemming so word forms meet: crying/cries/cried → "cry",
 * saluting/salute → "salut", napping/nap → "nap", proposing/propose → "propos".
 */
function stem(w: string) {
  return w
    .replace(/(ing|ed|s)$/u, "")
    .replace(/e$/u, "")
    .replace(/([^aeiou])\1$/u, "$1")
    .replace(/i$/u, "y");
}

function tokens(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

interface Indexed {
  pose: LibraryPose;
  /** Stemmed words from the name (weighted higher) and tags. */
  nameWords: Set<string>;
  tagWords: Set<string>;
}

let index: Indexed[] | null = null;
let idf = new Map<string, number>();

function build(library: LibraryPose[]) {
  index = library.map((pose) => ({
    pose,
    nameWords: new Set(tokens(pose.name).map(stem)),
    tagWords: new Set(pose.tags.flatMap(tokens).map(stem)),
  }));
  const df = new Map<string, number>();
  for (const e of index) for (const w of new Set([...e.nameWords, ...e.tagWords])) df.set(w, (df.get(w) ?? 0) + 1);
  idf = new Map([...df].map(([w, n]) => [w, Math.log(1 + index!.length / n)]));
}

/**
 * One group per word of the prompt: the word itself (weight 1) plus its
 * synonyms (0.7). Each group counts once — through its best match — so a
 * word with many synonyms ("crying") can't drown out another ("knees").
 */
function queryGroups(prompt: string) {
  // Multi-word synonyms are kept as phrases and only match when every word
  // is present together: "head down" must not fire on the "down" of
  // "Kneeling Down".
  const groups = new Map<string, Map<string, { words: string[]; weight: number }>>();
  for (const raw of tokens(prompt)) {
    const w = stem(raw);
    if (groups.has(w)) continue;
    const terms = new Map([[w, { words: [w], weight: GENERIC.has(w) ? 0.5 : 1 }]]);
    for (const syn of synonymsFor(raw)) {
      const words = tokens(syn).map(stem);
      const key = words.join(" ");
      if (words.length && !terms.has(key)) terms.set(key, { words, weight: 0.7 });
    }
    groups.set(w, terms);
  }
  return groups;
}

/**
 * Below this, a match is incidental (one common tag such as "arms raised")
 * and would only distract: no reference beats a misleading one. Real
 * matches score 5+; a lone generic tag about 2.5.
 */
const MIN_SCORE = 4;
/** Below this share of the best match's score, a reference is noise. */
const MIN_RELATIVE_SCORE = 0.35;
/** Terms an earlier pick already covers count for this much afterwards. */
const COVERED_WEIGHT = 0.3;

/**
 * Up to `k` library poses relevant to the prompt. Picked greedily so they
 * *cover different parts of the request* ("crying on knees" → something
 * crying, then something kneeling) and come from different animations, so
 * the model gets complementary material instead of near-copies.
 */
export function findReferences(library: LibraryPose[], prompt: string, k = 3): LibraryPose[] {
  if (!index || index.length !== library.length) build(library);
  const groups = queryGroups(prompt);
  if (!groups.size) return [];

  // Score = sum over the prompt's words of that word's best match in this
  // pose (name matches count double; rarer words count more). A word an
  // earlier pick already covered counts for less, steering toward variety.
  const score = (e: Indexed, covered: Set<string>) => {
    let s = 0;
    const hits: string[] = [];
    for (const [word, terms] of groups) {
      let best = 0;
      let extra = 0;
      let strong = false;
      for (const { words, weight } of terms.values()) {
        // A phrase is as telling as its rarest word.
        const rarity = Math.max(...words.map((w) => idf.get(w) ?? 0));
        // A name match says what the animation is; a tag match says this
        // particular moment shows it (the kneeling frame of "Kneeling Down",
        // not its standing start). Both together rank highest.
        const inName = words.every((w) => e.nameWords.has(w));
        const inTags = words.every((w) => e.tagWords.has(w));
        const m = (inName ? 2 : 0) + (inTags ? 1 : 0);
        const v = m * weight * rarity;
        extra += v;
        if (v > best) {
          best = v;
          strong = m >= 2 || weight === 1;
        }
      }
      if (best > 0) {
        // The word counts through its best match; its other matches add a
        // little, so within "Crying" the frame that also shows "head down"
        // and "hand to face" beats the neutral first frame.
        s += (best + 0.15 * (extra - best)) * (covered.has(word) ? COVERED_WEIGHT : 1);
        // Only a convincing match "covers" the word; a passing synonym tag
        // (a kneel that happens to look down) still leaves room for "crying".
        if (strong) hits.push(word);
      }
    }
    return { s, hits };
  };

  const picked: LibraryPose[] = [];
  const names = new Set<string>();
  const covered = new Set<string>();
  let top = 0;
  while (picked.length < k) {
    // Always the single best match: the runners-up are usually transition
    // frames (half-way down into a kneel, getting up from a landing) that
    // teach broken poses. Variety comes from the prompt's VARIATION instead.
    let best: { e: Indexed; s: number; hits: string[] } | null = null;
    for (const e of index!) {
      if (names.has(e.pose.name)) continue;
      const { s, hits } = score(e, covered);
      if (s > 0 && (!best || s > best.s)) best = { e, s, hits };
    }
    if (!best) break;
    if (best.s < MIN_SCORE) break;
    if (!picked.length) top = best.s;
    else if (best.s < top * MIN_RELATIVE_SCORE) break;
    picked.push(best.e.pose);
    names.add(best.e.pose.name);
    for (const h of best.hits) covered.add(h);
  }
  return picked;
}

/** Compact text for the prompt: name, what it shows, and its angles. */
export function formatReference(p: LibraryPose, i: number): string {
  // Near-rest joints carry no information about the pose; leaving them out
  // keeps each reference around 120 tokens (the free tier is token-metered).
  const pose = Object.fromEntries(Object.entries(p.pose).filter(([, a]) => a && a.some((x) => Math.abs(x) >= 4)));
  const body = {
    pose,
    left_hand: p.left_hand,
    right_hand: p.right_hand,
    stick_to_floor: p.stick_to_floor,
    lift_cm: p.lift_cm,
  };
  return `${i + 1}. "${p.name}" (${p.tags.join(", ")}): ${JSON.stringify(body)}`;
}
