/**
 * Copies the chosen CMU clips out of a full download into data/cmu/, named
 * for what they show (the name is what prompts search).
 *
 *   npm run import:cmu -- "C:\path\to\cmu-download"
 *
 * The download can be laid out any way (e.g. one folder per subject: 80\80_01.bvh);
 * every .bvh under it is found by its number. Then run `npm run build:poses`.
 *
 * Picked from CMU's descriptions: one clear action per clip (every frame
 * gets the clip's name), later subjects over early ones (CMU's own note:
 * the early sessions are lower quality), no plain walks/runs, calibration,
 * props-only or partner-only clips.
 */

import fs from "node:fs";
import path from "node:path";

const PICKS: Record<string, string> = {
  // Emotion and body language
  "79_68": "cold",
  "79_69": "very-happy",
  "79_70": "laughing",
  "79_71": "sad",
  "79_72": "crying",
  "79_73": "scared",
  "79_74": "upset",
  "80_41": "freezing",
  "80_43": "happy",
  "80_44": "laughing",
  "80_45": "crying",
  "80_48": "arguing",
  "141_21": "shrug",
  "141_27": "mope",
  "111_25": "shrug",
  "22_03": "sitting-face-in-hands",
  "22_10": "protecting-someone",
  "74_12": "thinker",
  "120_15": "surprised",
  // Sitting
  "13_04": "sitting-chin-in-hand",
  "14_30": "sitting-ankle-on-knee-chin-in-hand",
  "75_17": "sitting-medium-seat",
  "75_18": "sitting-high-seat",
  "75_20": "sitting-low-seat",
  "82_05": "sitting-on-ground-relaxing",
  "114_05": "sitting-in-chair",
  "114_16": "sitting-stretching",
  "141_17": "sitting-on-stool",
  "79_76": "sitting-driving",
  // Kneeling, crouching, low
  "23_03": "kneeling-comforting",
  "77_06": "crouching-searching-ground",
  "77_08": "crouching-investigating",
  "139_06": "crouching-poking-ground",
  "115_06": "squatting-lifting-box",
  "22_14": "squats",
  "136_09": "walking-crouched",
  "77_14": "creeping",
  "111_03": "crawling",
  "133_01": "crawling-baby",
  // Lying and getting up
  "140_01": "lying-face-down",
  "140_03": "lying-on-side",
  "140_08": "lying-on-back",
  "111_12": "lying-down",
  "111_21": "rolling-over",
  "77_18": "lying-on-back-getting-up",
  // Bending and reaching
  "115_01": "bending-from-waist",
  "26_09": "bending-picking-up",
  "13_10": "reaching-up-on-tiptoe",
  "15_07": "leaning-reaching-forward",
  "144_22": "reaching-left",
  "144_24": "reaching-right",
  "74_10": "peeking",
  "82_16": "banging-high-object",
  "81_05": "pushing-heavy",
  "81_07": "pulling-heavy",
  // Fighting and martial arts
  "13_17": "boxing",
  "143_23": "punching",
  "143_24": "kicking",
  "141_14": "punch-and-kick",
  "76_04": "defensive-guard",
  "76_01": "attack-punch",
  "135_04": "karate-front-kick",
  "135_07": "karate-roundhouse-kick",
  "135_11": "karate-side-kick",
  "135_09": "karate-punch",
  "135_05": "karate-low-block",
  "135_10": "karate-knife-hand-block",
  "144_07": "blocking",
  "144_20": "punch-combo",
  "144_05": "front-kicks",
  "144_11": "lunges",
  "75_16": "jump-kick",
  "02_07": "sword-fighting",
  "79_96": "aiming-gun",
  "139_05": "drawing-gun",
  "79_86": "archery-bow",
  // Sports
  "124_01": "baseball-pitch",
  "124_07": "baseball-swing",
  "124_03": "basketball-shot",
  "124_05": "basketball-jump-shot",
  "124_06": "basketball-layup",
  "124_09": "frisbee-throw",
  "64_01": "golf-swing",
  "64_11": "golf-putt",
  "10_01": "soccer-kick",
  "143_22": "football-throw-catch",
  "79_93": "weight-lifting",
  "79_94": "flexing-muscles",
  "79_95": "rowing",
  "125_06": "swimming-freestyle",
  // Dance
  "49_09": "dance-arms-high-arabesque",
  "49_15": "dance-pose-folded",
  "49_18": "balancing-one-leg-arms-out",
  "49_22": "dance-lean-back",
  "05_17": "grand-jete",
  "05_12": "dance-arms-high",
  "60_01": "salsa",
  "93_03": "charleston",
  "90_32": "moonwalk",
  "143_35": "macarena",
  "141_12": "dance-twist",
  "55_02": "lambada",
  "90_30": "russian-dance",
  "85_04": "breakdance-footwork",
  "90_28": "breakdance",
  // Acrobatics
  "49_06": "cartwheel",
  "88_02": "handstand",
  "89_03": "one-hand-stand",
  "87_03": "backflip",
  "90_08": "side-flip",
  "85_05": "handstand-kicks",
  "85_08": "breakdance-helicopter",
  // Jumping
  "13_11": "forward-jump",
  "75_01": "running-jump",
  "75_06": "jump-180",
  "75_12": "box-jump",
  "118_01": "jump",
  "143_06": "high-jump",
  "143_08": "jump-twist",
  "49_04": "running-leap",
  "142_20": "joy-jump",
  "13_29": "jumping-jacks",
  "75_13": "hopscotch",
  // Falling
  "90_16": "falling-on-face",
  "90_17": "slipping",
  "90_18": "falling-backward",
  "85_15": "twisting-fall",
  // Gestures and everyday actions
  "141_16": "waving-hello",
  "13_27": "pointing-directing",
  "141_22": "high-five",
  "141_23": "handshake",
  "141_18": "peekaboo",
  "141_13": "stretch-and-yawn",
  "111_02": "bowing",
  "141_26": "curtsey",
  "79_36": "phone-call",
  "79_38": "drinking",
  "79_41": "sipping-coffee",
  "79_15": "eating-sandwich",
  "79_85": "typing-laptop",
  "79_17": "playing-violin",
  "79_19": "playing-piano",
  "79_18": "playing-drums",
  "79_31": "writing-on-board",
  "79_43": "painting",
  "79_81": "brushing-teeth",
  "79_84": "combing-hair",
  "79_89": "holding-baby",
  "79_20": "hanging-picture",
  "79_01": "chopping-wood",
  "79_04": "digging",
  "80_14": "teaching",
  "62_07": "hammering",
  "62_14": "opening-umbrella",
  "77_05": "searching-with-flashlight",
  "77_09": "ducking",
  "76_05": "swatting-bug",
  "120_04": "conducting",
  // Walking and running styles
  "91_09": "drunk-walk",
  "91_14": "depressed-walk",
  "91_20": "shy-walk",
  "91_16": "limping",
  "91_33": "macho-walk",
  "91_30": "sexy-walk",
  "91_05": "mummy-walk",
  "104_41": "zombie-walk",
  "120_21": "robot-walk",
  "120_02": "gorilla-walk",
  "137_33": "old-man-walk",
  "137_42": "strong-man-walk",
  "137_24": "graceful-lady-walk",
  "132_01": "balancing-walk-arms-out",
  "139_29": "sneaking",
  "17_01": "angry-walk",
  "136_01": "walking-bent-forward",
  "20_06": "marching",
  "127_03": "running",
  "127_23": "dive-roll",
  "127_29": "ducking-under",
  // Characters
  "54_16": "superhero",
  "55_23": "devil",
  "55_03": "genie",
  "54_10": "ghost",
  "120_03": "casting-spell",
};

const ROOT = path.resolve(__dirname, "..");
const DEST = path.join(ROOT, "data/cmu");

/** "2_7", "02_07" and "02_07" all name the same clip. */
const key = (id: string) => id.split("_").map((n) => String(Number(n))).join("_");

function findClips(dir: string, out = new Map<string, string>()) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) findClips(p, out);
    else if (/^\d+_\d+\.bvh$/i.test(e.name)) out.set(key(e.name.replace(/\.bvh$/i, "")), p);
  }
  return out;
}

function main() {
  const src = process.argv[2];
  if (!src || !fs.existsSync(src)) {
    console.error('Usage: npm run import:cmu -- "C:\\path\\to\\cmu-download"');
    process.exit(1);
  }
  const found = findClips(path.resolve(src));
  fs.mkdirSync(DEST, { recursive: true });
  // Clips already here under any name (e.g. imported before) aren't copied twice.
  const have = new Set(fs.readdirSync(DEST).map((f) => f.match(/(\d+_\d+)\.bvh$/i)?.[1]).filter(Boolean).map((id) => key(id!)));

  let copied = 0;
  const missing: string[] = [];
  for (const [id, name] of Object.entries(PICKS)) {
    if (have.has(key(id))) continue;
    const from = found.get(key(id));
    if (!from) {
      missing.push(id);
      continue;
    }
    fs.copyFileSync(from, path.join(DEST, `${name}-${id}.bvh`));
    copied++;
  }
  console.log(`${found.size} clips in the download; copied ${copied} into data/cmu/ (${Object.keys(PICKS).length} picked, ${have.size} already there).`);
  if (missing.length) console.log(`Not found in the download: ${missing.join(", ")}`);
  console.log("Next: npm run build:poses");
}

main();
