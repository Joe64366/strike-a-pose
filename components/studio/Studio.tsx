"use client";

import { Sun } from "lucide-react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { spring } from "@/lib/motion";
import { createPoseEntry, type PoseEntry } from "@/lib/poses";
import { poseStore, usePoseStore } from "@/lib/poseStore";
import { useMediaQuery } from "@/lib/useColorScheme";
import { usePoseHistory } from "@/lib/usePoseHistory";
import { settingsStore, stageColor, useScheme, useSettings, type OutlineWeight } from "@/lib/settings";
import { installDevHooks } from "@/lib/devHooks";
import { lightingUi, useLightingUi } from "@/lib/lighting";
import { VIEW_ORDER, type ViewPreset, type ViewRequest } from "@/lib/views";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TooltipLayer } from "@/components/ui/TooltipLayer";
import { Composer, type ComposerHandle } from "./Composer";
import { ControlsHint } from "./ControlsHint";
import { FocusToggle } from "./FocusToggle";
import { HistoryControls } from "./HistoryControls";
import { HoverLabel } from "./HoverLabel";
import { JointInspector } from "./JointInspector";
import { LightingPanel } from "./LightingPanel";
import { LoadingVeil } from "./LoadingVeil";
import { CollapsedSidebarButtons, Sidebar, SIDEBAR_SPACE } from "./Sidebar";
import { StatusPill } from "./StatusPill";
import { UndoToast } from "./UndoToast";
import { usePoseEditing } from "./usePoseEditing";
import { usePoseGeneration } from "./usePoseGeneration";
import { SettingsPanel, type SettingsAnchor } from "./SettingsPanel";
import { ViewSwitcher } from "./ViewSwitcher";

// WebGL is browser-only; skip prerendering the canvas.
const Scene = dynamic(() => import("@/components/scene/Scene"), { ssr: false });

export function Studio() {
  const history = usePoseHistory();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<PoseEntry | null>(null);
  const editing = usePoseEditing(history, activeId, setActiveId);
  const generation = usePoseGeneration(history, editing.applyPose, activeId);

  const isCompact = useMediaQuery("(max-width: 767px)");
  // Starts closed: the stage is the first thing you see.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [view, setView] = useState<ViewPreset | null>("front");
  const [viewRequest, setViewRequest] = useState<ViewRequest | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const onSceneReady = useCallback(() => setSceneReady(true), []);
  const dismissToast = useCallback(() => setDeleted(null), []);
  // "O" flips the outline off and back to whatever weight it had.
  const lastOutline = useRef<OutlineWeight>("regular");
  const toggleOutline = useCallback(() => {
    const { outlineWeight } = settingsStore.get();
    if (outlineWeight !== "off") lastOutline.current = outlineWeight;
    settingsStore.set({ outlineWeight: outlineWeight === "off" ? lastOutline.current : "off" });
  }, []);
  const posingByHand = usePoseStore((s) => s.dragging);
  const jointSelected = usePoseStore((s) => s.selected !== null);
  const [settingsAnchor, setSettingsAnchor] = useState<SettingsAnchor | null>(null);
  const closeSettings = useCallback(() => setSettingsAnchor(null), []);

  // "Just the pose": every piece of interface fades away and the figure
  // can be orbited but not posed. The corner button (or Esc / H) brings it back.
  const [focus, setFocus] = useState(false);
  const focusRef = useRef(false);
  const setFocusMode = useCallback((on: boolean) => {
    focusRef.current = on;
    setFocus(on);
    poseStore.setViewOnly(on);
    if (on) {
      setSettingsAnchor(null);
      lightingUi.set({ open: false, dragging: null });
      (document.activeElement as HTMLElement | null)?.blur();
    }
  }, []);

  // Lighting mode: the lights appear in the scene and can be dragged; the
  // body can't be posed meanwhile, so a missed grab never bends an arm.
  const lightingOpen = useLightingUi((s) => s.open);
  const setLighting = useCallback((open: boolean) => {
    lightingUi.set({ open, dragging: null });
    if (open) poseStore.select(null);
    poseStore.setViewOnly(open || focusRef.current);
  }, []);
  const closeLighting = useCallback(() => setLighting(false), [setLighting]);
  const toggleSettings = useCallback((trigger: HTMLElement) => {
    setSettingsAnchor((cur) =>
      cur ? null : { rect: trigger.getBoundingClientRect(), returnFocus: trigger },
    );
  }, []);

  // Apply the theme and stage colour app-wide (the boot script did the
  // first paint; this keeps them in sync with Settings and the OS).
  const scheme = useScheme();
  const { background, promptIdeas } = useSettings();
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.scheme = scheme;
    root.style.setProperty("--stage", stageColor(background, scheme));
  }, [scheme, background]);

  const composer = useRef<ComposerHandle>(null);

  const active = history.entries.find((e) => e.id === activeId) ?? null;

  /**
   * With a pose open, a prompt refines it (iterate until it's right);
   * otherwise it starts a new one. The model names new poses.
   */
  const submitPrompt = useCallback(
    (prompt: string) => {
      if (active) {
        const next = { ...active, prompts: [...active.prompts, prompt], status: "posing" as const };
        history.update(active.id, { prompts: next.prompts, status: "posing" });
        void generation.run(next, prompt);
      } else {
        const entry = createPoseEntry(prompt);
        history.add(entry);
        setActiveId(entry.id);
        void generation.run(entry, prompt);
      }
      if (isCompact) setSidebarOpen(false);
    },
    [active, history, isCompact, generation],
  );

  const deleteEntry = useCallback(
    (entry: PoseEntry) => {
      generation.cancel(entry.id);
      history.remove(entry.id);
      if (activeId === entry.id) setActiveId(null);
      // A pose still generating can't be resumed, so restore it as interrupted.
      setDeleted(entry.status === "posing" ? { ...entry, status: "error" } : entry);
    },
    [history, activeId, generation],
  );

  // Deleting asks first (with the pose's name), then still offers Undo.
  const [pendingDelete, setPendingDelete] = useState<PoseEntry | null>(null);
  const cancelDelete = useCallback(() => setPendingDelete(null), []);
  const confirmDelete = useCallback(() => {
    if (pendingDelete) deleteEntry(pendingDelete);
    setPendingDelete(null);
  }, [pendingDelete, deleteEntry]);

  const undoDelete = useCallback(() => {
    if (!deleted) return;
    history.restore(deleted);
    setDeleted(null);
  }, [deleted, history]);

  const newPose = useCallback(() => {
    setActiveId(null);
    if (isCompact) setSidebarOpen(false);
    composer.current?.focus();
  }, [isCompact]);

  const selectEntry = useCallback(
    (id: string) => {
      setActiveId(id);
      if (isCompact) setSidebarOpen(false);
    },
    [isCompact],
  );

  const requestView = useCallback((preset: ViewPreset) => {
    setView(preset);
    setViewRequest({ preset, nonce: Date.now() });
  }, []);

  const onUserInteract = useCallback(() => {
    setView(null);
    setHasInteracted(true);
  }, []);

  useEffect(() => {
    // The hint has done its job once someone poses by hand, too.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (posingByHand) setHasInteracted(true);
  }, [posingByHand]);

  useEffect(() => installDevHooks(), []);

  // Keyboard, ignored while typing:
  //   /  prompt   1–4  camera angles   O  outline   Esc  deselect
  //   Ctrl/⌘ Z  undo   Ctrl/⌘ ⇧ Z or Ctrl Y  redo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input:not([type=range]), textarea, [contenteditable=true], [role=menu], [role=dialog], [role=alertdialog]")) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) editing.redo();
        else editing.undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        editing.redo();
        return;
      }
      if (mod || e.altKey) return;
      const preset = VIEW_ORDER[Number(e.key) - 1];
      if (e.key === "/") {
        e.preventDefault();
        composer.current?.focus();
      } else if (e.key === "Escape") {
        if (focusRef.current) setFocusMode(false);
        else if (lightingUi.get().open) setLighting(false);
        else poseStore.select(null);
      } else if (key === "l" && target.tagName !== "INPUT") {
        if (!focusRef.current) setLighting(!lightingUi.get().open);
      } else if (key === "h" && target.tagName !== "INPUT") {
        setFocusMode(!focusRef.current);
      } else if (preset && target.tagName !== "INPUT") {
        requestView(preset);
      } else if (key === "o" && target.tagName !== "INPUT") {
        toggleOutline();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestView, toggleOutline, editing, setFocusMode, setLighting]);

  const contentInset = sidebarOpen && !isCompact && !focus ? SIDEBAR_SPACE : 0;

  return (
    <MotionConfig reducedMotion="user" transition={spring}>
      <main className="fixed inset-0 overflow-hidden bg-stage text-label">
        <div className="absolute inset-0">
          <Scene
            viewRequest={viewRequest}
            onUserInteract={onUserInteract}
            onReady={onSceneReady}
            leftInset={contentInset}
          />
        </div>
        <LoadingVeil loaded={sceneReady} />

        {/* The whole interface, as one layer that can step aside. */}
        <motion.div
          className="pointer-events-none absolute inset-0 z-10"
          inert={focus}
          aria-hidden={focus || undefined}
          initial={false}
          animate={{ opacity: focus ? 0 : 1 }}
          transition={{ duration: focus ? 0.22 : 0.3, ease: "easeOut" }}
        >
        <AnimatePresence initial={false}>
          {sidebarOpen && isCompact && (
            <motion.div
              key="scrim"
              className="pointer-events-auto absolute inset-0 z-20 bg-black/25"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              aria-hidden
            />
          )}
        </AnimatePresence>

        <AnimatePresence initial={false} mode="popLayout">
          {sidebarOpen ? (
            <Sidebar
              key="sidebar"
              entries={history.entries}
              hydrated={history.hydrated}
              activeId={activeId}
              onSelect={selectEntry}
              onDelete={setPendingDelete}
              onRename={history.rename}
              onTogglePin={history.togglePin}
              onResetPose={editing.resetPose}
              onNewPose={newPose}
              onCollapse={() => setSidebarOpen(false)}
              onSettings={toggleSettings}
            />
          ) : (
            <CollapsedSidebarButtons
              key="collapsed"
              onExpand={() => setSidebarOpen(true)}
              onNewPose={newPose}
              onSettings={toggleSettings}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {settingsAnchor && <SettingsPanel key="settings" anchor={settingsAnchor} onClose={closeSettings} />}
        </AnimatePresence>

        {/* Floating chrome centred over the visible stage. */}
        <motion.div
          className="pointer-events-none absolute inset-0 z-10 flex flex-col"
          initial={false}
          animate={{ paddingLeft: contentInset }}
        >
          <div className="flex items-start justify-end gap-3 p-3 sm:grid sm:grid-cols-[1fr_auto_1fr]">
            <div className="hidden sm:block" />
            <div className="hidden flex-col items-center gap-2 sm:flex">
              <StatusPill
                entry={active}
                onTogglePin={history.togglePin}
                result={generation.lastResult}
              />
              {/* Posing is paused in lighting mode, so its hint would mislead. */}
              <ControlsHint visible={!hasInteracted && !lightingOpen} />
            </div>
            <div className="flex items-center gap-2 justify-self-end">
              <HistoryControls
                canUndo={editing.canUndo}
                canRedo={editing.canRedo}
                onUndo={editing.undo}
                onRedo={editing.redo}
              />
              <ViewSwitcher value={view} onChange={requestView} />
              <button
                type="button"
                onClick={() => setLighting(!lightingOpen)}
                aria-pressed={lightingOpen}
                aria-label="Lighting"
                data-tip="Lighting"
                data-tip-kbd="L"
                className={`pressable pointer-events-auto flex size-9 items-center justify-center rounded-full ${
                  lightingOpen ? "bg-accent text-on-accent shadow-[var(--shadow-float)]" : "material text-label-2 hover:text-label"
                }`}
              >
                <Sun size={17} aria-hidden />
              </button>
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 items-start justify-end px-3">
            {/* Opening lighting deselects the joint, so only one of these shows. */}
            <JointInspector className="w-[272px] max-md:absolute max-md:inset-x-3 max-md:bottom-2 max-md:w-auto" />
            <AnimatePresence initial={false}>
              {lightingOpen && (
                <LightingPanel
                  key="lighting"
                  onClose={closeLighting}
                  className="w-[300px] max-md:absolute max-md:inset-x-3 max-md:bottom-2 max-md:w-auto"
                />
              )}
            </AnimatePresence>
          </div>

          <div className="flex flex-col items-center gap-3 px-3 pt-3 pb-3 sm:pb-5">
            <UndoToast entry={deleted} onUndo={undoDelete} onDismiss={dismissToast} />
            <Composer
              ref={composer}
              onSubmit={submitPrompt}
              showSuggestions={promptIdeas && !active && !jointSelected}
              placeholder={active ? `Refine “${active.title}”…` : "Describe a pose…"}
              busy={active?.status === "posing"}
              error={active ? generation.errors[active.id] : undefined}
              onRetry={active ? () => generation.retry(active.id) : undefined}
            />
          </div>
        </motion.div>
        <HoverLabel />
        </motion.div>

        <FocusToggle focus={focus} onChange={setFocusMode} />
      </main>
      <TooltipLayer />
      <ConfirmDialog
        open={!!pendingDelete}
        title={`Delete “${pendingDelete?.title ?? ""}”?`}
        message="This pose and its prompt history will be removed."
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </MotionConfig>
  );
}
