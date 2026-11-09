"use client";

import { ArrowUp, CircleAlert, LoaderCircle, RotateCw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import { springSnappy } from "@/lib/motion";

export interface ComposerHandle {
  focus: () => void;
}

const SUGGESTIONS = [
  "Crying on knees",
  "Mid-sprint, leaning forward",
  "Sitting cross-legged, reading",
  "Looking back over shoulder",
  "Superhero landing",
];

const MAX_LENGTH = 300;
const MAX_ROWS_HEIGHT = 140;

export function Composer({
  ref,
  onSubmit,
  showSuggestions,
  placeholder,
  busy = false,
  error,
  onRetry,
}: {
  ref?: Ref<ComposerHandle>;
  onSubmit: (prompt: string) => void;
  showSuggestions: boolean;
  placeholder: string;
  /** The open pose is being generated: keep typing, but don't send yet. */
  busy?: boolean;
  /** Why the last attempt failed, shown right where you typed. */
  error?: string;
  onRetry?: () => void;
}) {
  const [value, setValue] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !busy;

  useImperativeHandle(ref, () => ({ focus: () => textarea.current?.focus() }), []);

  // Grow with content up to a cap, then scroll. Re-measure on width changes
  // too, since wrapping depends on how much room the sidebar leaves.
  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "0px";
      el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS_HEIGHT)}px`;
    };
    fit();
    let lastWidth = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return;
      lastWidth = el.clientWidth;
      fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [value]);

  const submit = (text = value) => {
    const prompt = text.trim();
    if (!prompt || busy) return;
    onSubmit(prompt);
    setValue("");
  };

  return (
    <div className="pointer-events-auto flex w-full max-w-[640px] flex-col gap-2.5">
      <AnimatePresence initial={false}>
        {showSuggestions && !value && (
          <motion.ul
            key="suggestions"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={springSnappy}
            className="flex flex-wrap justify-center gap-1.5"
            aria-label="Suggested poses"
          >
            {SUGGESTIONS.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => submit(s)}
                  className="material pressable h-8 rounded-full px-3.5 text-[13px] text-label-2 hover:text-label"
                >
                  {s}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {error && !busy && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={springSnappy}
            role="alert"
            className="material mx-auto flex max-w-full items-center gap-2.5 rounded-full py-1 pr-1 pl-3 text-[13px]"
          >
            <CircleAlert size={15} className="shrink-0 text-danger" aria-hidden />
            <span className="min-w-0 truncate text-label-2">{error}</span>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="pressable flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-fill px-3 font-semibold text-label hover:bg-fill-strong"
              >
                <RotateCw size={13} aria-hidden />
                Retry
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="material flex items-end gap-2 rounded-[24px] py-2 pr-2 pl-4 transition-shadow focus-within:shadow-[inset_0_1px_0_var(--material-edge),0_0_0_1px_var(--accent),var(--shadow-float)]"
      >
        <label htmlFor="pose-prompt" className="sr-only">
          Describe a pose
        </label>
        <textarea
          id="pose-prompt"
          ref={textarea}
          rows={1}
          value={value}
          maxLength={MAX_LENGTH}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              e.currentTarget.blur();
            }
          }}
          placeholder={placeholder}
          className="min-h-9 flex-1 resize-none bg-transparent py-[7px] text-[15px] leading-[22px] text-label outline-none placeholder:text-label-3 focus-visible:outline-none"
        />
        {/* Enabled: hover deepens the blue and adds a soft glow.
            Disabled: inert, no hover response and no tooltip.
            Busy: stays blue with a spinner, so it reads as "working". */}
        <button
          type="submit"
          disabled={!canSend}
          aria-label={busy ? "Posing…" : "Strike the pose"}
          aria-busy={busy}
          data-tip={canSend ? "Strike the pose" : undefined}
          data-tip-kbd="↵"
          data-tip-side="top"
          className={`pressable flex size-9 shrink-0 items-center justify-center rounded-full text-on-accent enabled:bg-accent enabled:hover:bg-accent-hover enabled:hover:shadow-[0_2px_10px_-2px_var(--accent)] ${
            busy ? "bg-accent" : "disabled:bg-fill-strong disabled:text-label-3"
          }`}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={busy ? "busy" : "idle"}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={springSnappy}
              className="flex"
            >
              {busy ? (
                <LoaderCircle size={18} strokeWidth={2.4} className="animate-spin" aria-hidden />
              ) : (
                <ArrowUp size={18} strokeWidth={2.4} aria-hidden />
              )}
            </motion.span>
          </AnimatePresence>
        </button>
      </form>
    </div>
  );
}
