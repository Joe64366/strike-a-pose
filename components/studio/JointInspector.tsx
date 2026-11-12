"use client";

import { Crosshair, FlipHorizontal2, RotateCcw, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { springSnappy } from "@/lib/motion";
import {
  AXES,
  fingerJoints,
  groupOf,
  HAND_SHAPES,
  handShapeAngles,
  JOINT_BY_ID,
  mirrorJoint,
  type AxisDef,
  type AxisKey,
  type HandShape,
  type JointId,
} from "@/lib/joints";
import { compose, decompose, IDENTITY, isIdentity, MAX_LIFT, type PoseData, type RigFrames } from "@/lib/poseMath";
import { poseStore, usePoseStore } from "@/lib/poseStore";
import { Switch } from "@/components/ui/Segmented";

/**
 * Precise control for the selected body part. Only the axes the joint
 * really has are shown (an elbow just bends and twists), each labelled at
 * both ends so the direction is never a guess. Fingers are edited a whole
 * finger at a time; the hand offers one-tap shapes; the whole body adds
 * position and lift.
 */
export function JointInspector({ className = "" }: { className?: string }) {
  const selected = usePoseStore((s) => s.selected);
  const hasFrame = usePoseStore((s) => !!(s.selected && s.frames[s.selected]));

  return (
    <AnimatePresence>
      {selected && hasFrame && (
        <motion.section
          key="inspector"
          initial={{ opacity: 0, x: 16, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 16, scale: 0.98 }}
          style={{ transformOrigin: "right top" }}
          className={`material-thick pointer-events-auto max-h-[calc(100dvh-180px)] overflow-x-hidden overflow-y-auto rounded-[20px] p-4 ${className}`}
          aria-label="Joint controls"
        >
          <Panel id={selected} />
        </motion.section>
      )}
    </AnimatePresence>
  );
}

const handSide = (id: JointId) => (id === "leftHand" ? "left" : id === "rightHand" ? "right" : null);

/** Every joint the Mirror button should copy for this selection. */
function mirrorSet(id: JointId): JointId[] {
  const side = handSide(id);
  return side ? [id, ...fingerJoints(side)] : groupOf(id);
}

function Panel({ id }: { id: JointId }) {
  const def = JOINT_BY_ID[id];
  const ids = groupOf(id);
  const pose = usePoseStore((s) => s.pose);
  const frames = usePoseStore((s) => s.frames);
  const mirror = mirrorJoint(id);
  const side = handSide(id);
  const isFinger = !!def.group;

  const setAxis = (jid: JointId, key: AxisKey, value: number) => {
    const frame = poseStore.get().frames[jid];
    if (!frame) return;
    const current = decompose(poseStore.get().pose[jid], frame);
    poseStore.setJoint(jid, compose(jid, { ...current, [key]: value }, frame));
  };
  const commit = () => poseStore.endEdit();

  const reset = () => {
    for (const jid of ids) poseStore.setJoint(jid, IDENTITY);
    poseStore.endEdit();
  };

  const mirrorToOther = () => {
    const { pose, frames } = poseStore.get();
    for (const jid of mirrorSet(id)) {
      const other = mirrorJoint(jid);
      const from = frames[jid];
      const to = other && frames[other];
      // Axes are defined anatomically, so the same angles mirror the pose.
      if (other && from && to) poseStore.setJoint(other, compose(other, decompose(pose[jid], from), to));
    }
    poseStore.endEdit();
  };

  const sliders = ids.flatMap((jid) =>
    AXES.flatMap((key) => {
      const axis = JOINT_BY_ID[jid][key];
      const frame = frames[jid];
      if (!axis || !frame) return [];
      return [{ jid, key, axis, value: decompose(pose[jid], frame)[key] }];
    }),
  );
  const atRest = ids.every((jid) => isIdentity(pose[jid]));

  return (
    <>
      <header className="mb-3 flex items-start gap-2">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={def.group ?? id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={springSnappy}
            className="min-w-0 flex-1"
          >
            <h2 className="text-[15px] leading-5 font-semibold tracking-[-0.01em]">{def.label}</h2>
            <p className="text-[12px] text-label-3">
              {isFinger ? "Each joint, knuckle to tip" : `Rotates at the ${def.pivot.toLowerCase()}`}
            </p>
          </motion.div>
        </AnimatePresence>
        <button
          type="button"
          onClick={() => poseStore.select(null)}
          aria-label="Close"
          data-tip="Done"
          data-tip-kbd="Esc"
          className="pressable -mt-1 -mr-1 flex size-7 items-center justify-center rounded-full text-label-2 hover:bg-fill hover:text-label"
        >
          <X size={16} aria-hidden />
        </button>
      </header>

      <div className="flex flex-col gap-3.5">
        {sliders.map(({ jid, key, axis, value }) => (
          <AxisSlider
            key={`${jid}:${key}`}
            axis={axis}
            value={value}
            highlight={isFinger && jid === id}
            onChange={(v) => setAxis(jid, key, v)}
            onCommit={commit}
            onReset={() => {
              setAxis(jid, key, 0);
              commit();
            }}
          />
        ))}
      </div>

      {side && <HandShapes side={side} pose={pose} frames={frames} />}
      {id === "hips" && <BodyPosition root={pose.root} floating={!!pose.floating} />}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={reset}
          disabled={atRest}
          className="pressable flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[9px] bg-fill text-[13px] font-medium enabled:hover:bg-fill-strong disabled:opacity-40"
        >
          <RotateCcw size={14} aria-hidden />
          Reset
        </button>
        {mirror && (
          <button
            type="button"
            onClick={mirrorToOther}
            data-tip={`Copy to the ${mirror.startsWith("left") ? "left" : "right"} ${side ? "hand" : "side"}`}
            className="pressable flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[9px] bg-fill text-[13px] font-medium hover:bg-fill-strong"
          >
            <FlipHorizontal2 size={14} aria-hidden className="rotate-90" />
            Mirror
          </button>
        )}
      </div>
      <p className="mt-3 hidden text-center text-[11px] text-label-3 md:block">
        {id === "hips" ? (
          <>
            Drag the floor ring to move · <kbd className="font-sans">⇧</kbd> drag to lift
          </>
        ) : (
          <>
            Drag the body to pose · <kbd className="font-sans">⇧</kbd> drag to twist
          </>
        )}
      </p>
    </>
  );
}

/** One-tap hand shapes; the current one is marked when the fingers match it. */
function HandShapes({ side, pose, frames }: { side: "left" | "right"; pose: PoseData; frames: RigFrames }) {
  const matches = (shape: HandShape) =>
    handShapeAngles(side, shape).every(({ id, bend, tilt }) => {
      const f = frames[id];
      if (!f) return true;
      const a = decompose(pose[id], f);
      return Math.abs(a.bend - bend) < 3 && Math.abs(a.tilt - tilt) < 3;
    });
  const apply = (shape: HandShape) => {
    for (const { id, bend, tilt } of handShapeAngles(side, shape)) {
      const f = poseStore.get().frames[id];
      if (f) poseStore.setJoint(id, compose(id, { bend, tilt, twist: 0 }, f));
    }
    poseStore.endEdit();
  };

  return (
    <div className="mt-4">
      <h3 className="mb-1.5 text-[12px] font-semibold text-label-3">Hand shape</h3>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(HAND_SHAPES) as HandShape[]).map((shape) => {
          const on = matches(shape);
          return (
            <button
              key={shape}
              type="button"
              onClick={() => apply(shape)}
              aria-pressed={on}
              className={`pressable h-7 rounded-full px-3 text-[12px] font-medium ${
                on ? "bg-accent text-on-accent" : "bg-fill text-label hover:bg-fill-strong"
              }`}
            >
              {HAND_SHAPES[shape].label}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-label-3">Click a finger on the model to fine-tune it.</p>
    </div>
  );
}

const LIFT_AXIS: AxisDef = {
  label: "Lift",
  from: "tip",
  to: "up",
  ends: ["Floor", "Air"],
  min: 0,
  max: MAX_LIFT * 100,
};

/**
 * Where the whole figure stands, how far off the floor, and whether it
 * sticks to the floor while you pose it.
 */
function BodyPosition({ root, floating }: { root: PoseData["root"]; floating: boolean }) {
  const [x, , z] = root ?? [0, 0, 0];
  const gap = usePoseStore((s) => s.floorGap);
  const moved = Math.abs(x) > 0.005 || Math.abs(z) > 0.005;

  /** Raise or lower so the lowest point is `cm` above the floor. Lifting floats it. */
  const setGap = (cm: number) => {
    const [px, , pz] = poseStore.placement();
    poseStore.setPlacement([px, poseStore.heightForGap(cm / 100), pz], true);
  };

  return (
    <div className="mt-4">
      <h3 className="mb-2 text-[12px] font-semibold text-label-3">Position</h3>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium">Stick to floor</p>
          <p className="text-[11px] leading-snug text-label-3">
            {floating ? "Stays where you put it" : "Kneel or crouch and it stays on the floor"}
          </p>
        </div>
        <Switch
          label="Stick to floor"
          on={!floating}
          onChange={(on) => {
            // Off: freeze exactly where it is now. On: settle onto the floor.
            const [px, ph, pz] = poseStore.placement();
            poseStore.setPlacement([px, ph, pz], !on);
            poseStore.endEdit();
          }}
        />
      </div>
      <AxisSlider
        axis={LIFT_AXIS}
        unit=" cm"
        value={gap * 100}
        onChange={setGap}
        onCommit={() => poseStore.endEdit()}
        onReset={() => {
          setGap(0);
          poseStore.endEdit();
        }}
      />
      <button
        type="button"
        disabled={!moved}
        onClick={() => {
          const [, ph] = poseStore.placement();
          poseStore.setPlacement([0, ph, 0], floating);
          poseStore.endEdit();
        }}
        className="pressable mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-[9px] bg-fill text-[13px] font-medium enabled:hover:bg-fill-strong disabled:opacity-40"
      >
        <Crosshair size={14} aria-hidden />
        Move to center
      </button>
    </div>
  );
}

function AxisSlider({
  axis,
  value,
  unit = "°",
  highlight = false,
  onChange,
  onCommit,
  onReset,
}: {
  axis: AxisDef;
  value: number;
  unit?: string;
  /** Marks the segment you clicked when a whole finger is shown. */
  highlight?: boolean;
  onChange: (v: number) => void;
  onCommit: () => void;
  onReset: () => void;
}) {
  const span = axis.max - axis.min;
  const pct = (n: number) => ((n - axis.min) / span) * 100;
  const zero = pct(Math.min(Math.max(0, axis.min), axis.max));
  const at = pct(value);
  const shown = Math.round(value);

  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between">
        <label className="flex items-center gap-1.5 text-[13px] font-medium">
          {highlight && <span className="size-1.5 rounded-full bg-accent" aria-hidden />}
          {axis.label}
        </label>
        <output className="text-[13px] text-label-2 tabular-nums">
          {shown === 0 ? 0 : shown}
          {unit}
        </output>
      </div>
      <input
        type="range"
        className="joint-slider"
        min={axis.min}
        max={axis.max}
        step={1}
        value={shown}
        aria-label={axis.label}
        aria-valuetext={`${shown}${unit}, ${shown < 0 ? axis.ends[0] : axis.ends[1]}`}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
        onDoubleClick={onReset}
        style={
          {
            "--fill-from": `${Math.min(zero, at)}%`,
            "--fill-to": `${Math.max(zero, at)}%`,
          } as React.CSSProperties
        }
      />
      <div className="flex justify-between text-[11px] text-label-3">
        <span>{axis.ends[0]}</span>
        <span>{axis.ends[1]}</span>
      </div>
    </div>
  );
}
