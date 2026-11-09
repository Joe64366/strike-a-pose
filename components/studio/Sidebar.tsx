"use client";

import {
  CircleAlert,
  Ellipsis,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PersonStanding,
  Pin,
  Settings,
  SquarePen,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { springSnappy } from "@/lib/motion";
import { isRestPose } from "@/lib/poseMath";
import { groupByRecency, lastPrompt, MAX_TITLE_LENGTH, type PoseEntry } from "@/lib/poses";
import { Logo } from "@/components/ui/Logo";
import { PoseMenu, type MenuRequest } from "./PoseMenu";

const SIDEBAR_WIDTH = 272;
const SIDEBAR_GAP = 12;
/** Horizontal space the open sidebar takes from the stage. */
export const SIDEBAR_SPACE = SIDEBAR_WIDTH + SIDEBAR_GAP;

// Enter and exit along the same path: in from the left, back out to the left.
const slide = {
  initial: { x: -SIDEBAR_WIDTH * 0.35, opacity: 0, scale: 0.98 },
  animate: { x: 0, opacity: 1, scale: 1 },
  exit: { x: -SIDEBAR_WIDTH * 0.35, opacity: 0, scale: 0.98 },
};

type ListItem =
  | { kind: "header"; key: string; label: string; pinned?: boolean }
  | { kind: "entry"; key: string; entry: PoseEntry };

interface SidebarProps {
  ref?: Ref<HTMLElement>;
  entries: PoseEntry[];
  hydrated: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (entry: PoseEntry) => void;
  onRename: (id: string, title: string) => void;
  onTogglePin: (id: string) => void;
  onResetPose: (entry: PoseEntry) => void;
  onNewPose: () => void;
  onCollapse: () => void;
  onSettings: (trigger: HTMLElement) => void;
}

export function Sidebar({
  ref,
  entries,
  hydrated,
  activeId,
  onSelect,
  onDelete,
  onRename,
  onTogglePin,
  onResetPose,
  onNewPose,
  onCollapse,
  onSettings,
}: SidebarProps) {
  const [menu, setMenu] = useState<MenuRequest | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  // One flat list (headers + rows) so a pinned pose glides from its date
  // group up into "Pinned" instead of vanishing and reappearing.
  const items = useMemo<ListItem[]>(
    () =>
      groupByRecency(entries).flatMap((g) => [
        { kind: "header" as const, key: `h:${g.label}`, label: g.label, pinned: g.pinned },
        ...g.items.map((entry) => ({ kind: "entry" as const, key: entry.id, entry })),
      ]),
    [entries],
  );

  const closeMenu = useCallback(() => setMenu(null), []);
  const menuEntry = menu && entries.find((e) => e.id === menu.entry.id);

  return (
    <motion.aside
      ref={ref}
      {...slide}
      style={{ width: SIDEBAR_WIDTH, transformOrigin: "left center" }}
      className="material-thick pointer-events-auto absolute top-3 bottom-3 left-3 z-30 flex max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-[22px]"
      aria-label="Pose history"
    >
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        <Logo size={32} className="shrink-0 drop-shadow-[0_1px_2px_rgb(10_132_255/0.35)]" />
        <h1 className="flex-1 text-[15px] font-semibold tracking-[-0.01em]">Strike a Pose</h1>
        <IconButton label="Hide sidebar" onClick={onCollapse}>
          <PanelLeftClose size={18} />
        </IconButton>
      </header>

      <div className="px-2 pb-1">
        <button
          type="button"
          onClick={onNewPose}
          data-tip="Start a new pose"
          data-tip-kbd="/"
          data-tip-side="right"
          className="pressable flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left font-medium hover:bg-fill active:bg-fill-strong"
        >
          <SquarePen size={16} className="text-label-2" aria-hidden />
          New pose
        </button>
      </div>

      <nav className="scroll-fade min-h-0 flex-1 overflow-y-auto px-2 pt-2 pb-4" onScroll={closeMenu}>
        {hydrated && entries.length === 0 && <EmptyHistory />}
        <ul>
          <AnimatePresence initial={false}>
            {items.map((item, i) =>
              item.kind === "header" ? (
                <motion.li
                  key={item.key}
                  layout="position"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.12 } }}
                  transition={springSnappy}
                  className={`flex items-center gap-1.5 px-2.5 pb-1 text-[12px] font-semibold text-label-3 ${i === 0 ? "pt-1" : "pt-4"}`}
                  role="presentation"
                >
                  {item.pinned && <Pin size={11} strokeWidth={2.5} aria-hidden />}
                  {item.label}
                </motion.li>
              ) : (
                <HistoryRow
                  key={item.key}
                  entry={item.entry}
                  active={item.entry.id === activeId}
                  renaming={item.entry.id === renamingId}
                  menuOpen={menu?.entry.id === item.entry.id}
                  onSelect={onSelect}
                  onDelete={onDelete}
                  onStartRename={setRenamingId}
                  onFinishRename={(title) => {
                    if (title !== null) onRename(item.entry.id, title);
                    setRenamingId(null);
                  }}
                  onOpenMenu={(req) => setMenu((m) => (m?.entry.id === req.entry.id && req.fromButton ? null : req))}
                />
              ),
            )}
          </AnimatePresence>
        </ul>
      </nav>

      <div className="px-2 pt-1 pb-2">
        <button
          type="button"
          onClick={(e) => onSettings(e.currentTarget)}
          aria-haspopup="dialog"
          className="pressable group/gear flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-label-2 hover:bg-fill hover:text-label active:bg-fill-strong"
        >
          <Settings
            size={16}
            aria-hidden
            className="transition-transform duration-300 ease-out group-hover/gear:rotate-45"
          />
          Settings
        </button>
      </div>

      <AnimatePresence>
        {menu && menuEntry && (
          <PoseMenu
            key={menu.entry.id}
            request={{ ...menu, entry: menuEntry }}
            onClose={closeMenu}
            onTogglePin={(e) => onTogglePin(e.id)}
            onRename={(e) => setRenamingId(e.id)}
            onResetPose={
              !isRestPose(menuEntry.pose) ? onResetPose : undefined
            }
            onDelete={onDelete}
          />
        )}
      </AnimatePresence>
    </motion.aside>
  );
}

function HistoryRow({
  entry,
  active,
  renaming,
  menuOpen,
  onSelect,
  onDelete,
  onStartRename,
  onFinishRename,
  onOpenMenu,
}: {
  entry: PoseEntry;
  active: boolean;
  renaming: boolean;
  menuOpen: boolean;
  onSelect: (id: string) => void;
  onDelete: (entry: PoseEntry) => void;
  onStartRename: (id: string) => void;
  /** null = cancelled */
  onFinishRename: (title: string | null) => void;
  onOpenMenu: (req: MenuRequest) => void;
}) {
  const rowButton = useRef<HTMLButtonElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onDelete(entry);
    } else if (e.key === "F2") {
      e.preventDefault();
      onStartRename(entry.id);
    } else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      onOpenMenu({ entry, anchor: { x: r.left + 12, y: r.bottom + 4 }, returnFocus: rowButton.current });
    }
  };

  const prompt = lastPrompt(entry);
  const tip = prompt && prompt.toLowerCase() !== entry.title.toLowerCase() ? `“${prompt}”` : undefined;

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={springSnappy}
      className="group relative overflow-hidden"
    >
      {renaming ? (
        <RenameField title={entry.title} onDone={onFinishRename} />
      ) : (
        <button
          ref={rowButton}
          type="button"
          onClick={() => onSelect(entry.id)}
          onDoubleClick={() => onStartRename(entry.id)}
          onKeyDown={onKeyDown}
          onContextMenu={(e) => {
            e.preventDefault();
            onOpenMenu({ entry, anchor: { x: e.clientX, y: e.clientY }, returnFocus: rowButton.current });
          }}
          aria-current={active ? "true" : undefined}
          data-tip={tip}
          data-tip-side="right"
          className={`pressable my-px flex h-9 w-full items-center gap-2 rounded-[10px] pr-9 pl-2.5 text-left ${
            active
              ? "bg-accent-fill text-label"
              : menuOpen
                ? "bg-fill text-label"
                : "text-label hover:bg-fill active:bg-fill-strong"
          }`}
        >
          <StatusGlyph status={entry.status} />
          <span className={`truncate ${active ? "font-medium" : ""}`}>{entry.title}</span>
        </button>
      )}
      {!renaming && (
        <button
          ref={moreButton}
          type="button"
          aria-label={`More actions for “${entry.title}”`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          data-tip="More"
          data-tip-side="right"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onOpenMenu({
              entry,
              anchor: { x: r.left, y: r.bottom + 4 },
              returnFocus: moreButton.current,
              fromButton: true,
            });
          }}
          className={`pressable absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-[8px] text-label-2 hover:bg-fill-strong hover:text-label focus-visible:opacity-100 pointer-coarse:opacity-100 ${
            menuOpen ? "bg-fill-strong text-label opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          }`}
        >
          <Ellipsis size={16} aria-hidden />
        </button>
      )}
    </motion.li>
  );
}

/** Inline title editor: Enter or clicking away saves, Escape cancels. */
function RenameField({ title, onDone }: { title: string; onDone: (title: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(value && value.trim() ? value : null);
  };

  return (
    <input
      ref={input}
      defaultValue={title}
      maxLength={MAX_TITLE_LENGTH}
      aria-label="Pose title"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finish(e.currentTarget.value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(null);
        }
      }}
      onBlur={(e) => finish(e.currentTarget.value)}
      className="my-px h-9 w-full rounded-[10px] bg-[var(--material)] px-2.5 text-label shadow-[0_0_0_2px_var(--accent)] outline-none focus-visible:outline-none"
    />
  );
}

function StatusGlyph({ status }: { status: PoseEntry["status"] }) {
  if (status === "posing")
    return <LoaderCircle size={14} className="shrink-0 animate-spin text-accent" aria-label="Posing" />;
  if (status === "error")
    return <CircleAlert size={14} className="shrink-0 text-label-3" aria-label="Interrupted" />;
  return null;
}

function EmptyHistory() {
  return (
    <div className="flex flex-col items-center px-6 pt-10 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-fill text-label-3">
        <PersonStanding size={22} aria-hidden />
      </div>
      <p className="font-medium text-label-2">No poses yet</p>
      <p className="mt-1 text-[13px] leading-snug text-label-3">
        Describe one below and it’ll be saved here.
      </p>
    </div>
  );
}

export function IconButton({
  label,
  kbd,
  side = "bottom",
  onClick,
  children,
  className = "",
}: {
  label: string;
  kbd?: string;
  side?: "top" | "bottom" | "left" | "right";
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      data-tip={label}
      data-tip-kbd={kbd}
      data-tip-side={side}
      className={`pressable flex size-8 items-center justify-center rounded-[10px] text-label-2 hover:bg-fill hover:text-label active:bg-fill-strong ${className}`}
    >
      {children}
    </button>
  );
}

/** What remains at the sidebar's origin when it's hidden, so it can return from there. */
export function CollapsedSidebarButtons({
  ref,
  onExpand,
  onNewPose,
  onSettings,
}: {
  ref?: Ref<HTMLDivElement>;
  onExpand: () => void;
  onNewPose: () => void;
  onSettings: (trigger: HTMLElement) => void;
}) {
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      style={{ transformOrigin: "left top" }}
      className="material pointer-events-auto absolute top-3 left-3 z-30 flex gap-0.5 rounded-[14px] p-1"
    >
      <IconButton label="Show sidebar" onClick={onExpand}>
        <PanelLeftOpen size={18} />
      </IconButton>
      <IconButton label="New pose" kbd="/" onClick={onNewPose}>
        <SquarePen size={17} />
      </IconButton>
      <IconButton label="Settings" onClick={(e) => onSettings(e.currentTarget)} className="group/gear">
        <Settings
          size={17}
          className="transition-transform duration-300 ease-out group-hover/gear:rotate-45"
        />
      </IconButton>
    </motion.div>
  );
}
