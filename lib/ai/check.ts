import type { PostureId } from "./postures";

/**
 * A sanity check on the model's choice of posture. Some words leave no doubt
 * about how the body is supported ("kneeling", "lying", "cross-legged");
 * if the model picked a posture that contradicts them, the route asks again
 * once, saying what was wrong. Most specific rule first; anything else is
 * the model's call.
 */

const KNEEL: PostureId[] = ["kneel_upright", "kneel_sit_back", "kneel_left_knee", "kneel_right_knee"];
const ONE_KNEE: PostureId[] = ["kneel_left_knee", "kneel_right_knee"];
const LYING: PostureId[] = ["lie_back", "lie_front", "lie_left_side", "lie_right_side"];
const FLOOR_SIT: PostureId[] = ["sit_floor", "sit_knees_up", "sit_cross_legged", "kneel_sit_back"];
const ANY_SIT: PostureId[] = ["sit_chair", ...FLOOR_SIT];

const RULES: [RegExp, PostureId[], RegExp?][] = [
  [/\bone knee\b|\bpropos(e|es|ed|ing|al)\b(?! a toast)/, ONE_KNEE],
  [/\bcross[- ]?legged\b|\blotus\b/, ["sit_cross_legged"]],
  [/\bhug(s|ged|ging)? (his |her |their |my )?knees\b|\bknees (pulled |drawn )?(up )?to (the |his |her |their )?chest\b/, ["sit_knees_up"]],
  [/\bkneel|\bknelt\b/, KNEEL],
  // "hands on her knees" is about the hands; "on her knees" alone is kneeling.
  [/\bon (his |her |their |my |both )?knees\b/, KNEEL, /\b(hands?|elbows?|arms?|head|chin|forehead|palms?) (resting )?on (his |her |their |my )?knees\b/],
  [/\ball fours\b|\bcrawl/, ["all_fours"]],
  [/\b(lying|lies|lie|laying|lay|laid)\b|\b(asleep|sleeping|napping|sunbathing)\b(?!.*\b(sit|chair|desk|stand|bench)\w*)/, LYING, /\blie to\b|\blay (it|down the|out the)\b/],
  [/\bsquat|\bcrouch/, ["squat", ...ONE_KNEE]],
  [/\b(sit|sits|sitting|seated|sat)\b.*\b(floor|ground|grass|sand|beach|rug|carpet)\b/, FLOOR_SIT],
  [/\b(sit|sits|sitting|seated|sat)\b.*\b(chair|bench|stool|ledge|desk|couch|sofa|throne|edge|bed|steps?|wall|car)\b/, ["sit_chair"]],
  [/\b(sit|sits|sitting|seated|sat)\b/, ANY_SIT],
];

/** Postures the request's wording allows, or null if it doesn't say. */
export function expectedPostures(prompt: string): PostureId[] | null {
  const text = prompt.toLowerCase();
  for (const [re, postures, unless] of RULES) {
    if (re.test(text) && !(unless && unless.test(text))) return postures;
  }
  return null;
}
