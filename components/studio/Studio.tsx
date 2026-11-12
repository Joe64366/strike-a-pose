"use client";

import { Axis3d, Camera, FlipHorizontal2, Sun, Timer } from "lucide-react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { spring } from "@/lib/motion";
import { createPoseEntry, createUntitledEntry, type PoseEntry } from "@/lib/poses";
import { showLook, withCurrentLook } from "@/lib/poseLook";
import { poseStore, usePoseStore } from "@/lib/poseStore";
import { useMediaQuery } from "@/lib/useColorScheme";
import { usePoseHistory } from "@/lib/usePoseHistory";
import { settingsStore, stageColor, useScheme, useSettings, type OutlineWeight } from "@/lib/settings";
import { installDevHooks } from "@/lib/devHooks";
import { lightingUi, useLightingUi } from "@/lib/lighting";
import { perspective, usePerspectiveUi } from "@/lib/perspective";
import { cameraBridge, MAX_VIEWS, viewSnapshots, type SavedView } from "@/lib/cameraViews";
import { session, timerSettings, useSession, type SessionPose } from "@/lib/drawingTimer";
import { isRestPose } from "@/lib/poseMath";
import { VIEW_ORDER, type ViewPreset, type ViewRequest } from "@/lib/views";
import { viewFlip, useViewFlip } from "@/lib/viewFlip";
import { hasUnseenChanges } from "@/lib/changelog";
import type { PopoverAnchor } from "@/components/ui/AnchoredPopover";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TooltipLayer } from "@/components/ui/TooltipLayer";
import { Composer, type ComposerHandle } from "./Composer";
import { ControlsHint } from "./ControlsHint";
import { FocusToggle } from "./FocusToggle";
import { HistoryControls } from "./HistoryControls";
import { HoverLabel } from "./HoverLabel";
import { JointInspector } from "./JointInspector";
import { CameraViewsMenu, type ViewsAnchor } from "./CameraViewsMenu";
import { LightingPanel } from "./LightingPanel";
import { PerspectivePanel } from "./PerspectivePanel";
import { LoadingVeil } from "./LoadingVeil";
import { CollapsedSidebarButtons, Sidebar, SIDEBAR_SPACE } from "./Sidebar";
import { StatusPill } from "./StatusPill";
import { SessionSummary } from "./SessionSummary";
import { capsulePhase, ReadyOverlay, TimerCapsule } from "./TimerCapsule";
import { TimerPanel, type TimerAnchor } from "./TimerPanel";
import { UndoToast } from "./UndoToast";
import { REST_POSE, usePoseEditing } from "./usePoseEditing";
import { usePoseGeneration } from "./usePoseGeneration";
import { usePoseLook } from "./usePoseLook";
import { SettingsPanel, type SettingsAnchor } from "./SettingsPanel";
import { InfoPanel } from "./InfoPanel";
import { ChangelogPanel } from "./ChangelogPanel";
import { ViewSwitcher } from "./ViewSwitcher";

// WebGL is browser-only; skip prerendering the canvas.
const Scene = dynamic(() => import("@/components/scene/Scene"), { ssr: false });

/** The panels and popovers that take turns (one open at a time). */
type Menu = "lighting" | "timer" | "fisheye" | "views" | "settings" | "info" | "changelog";

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
  const [timerAnchor, setTimerAnchor] = useState<TimerAnchor | null>(null);
  const closeTimer = useCallback(() => setTimerAnchor(null), []);
  const [viewsAnchor, setViewsAnchor] = useState<ViewsAnchor | null>(null);
  const closeViews = useCallback(() => setViewsAnchor(null), []);
  const [infoAnchor, setInfoAnchor] = useState<PopoverAnchor | null>(null);
  const closeInfo = useCallback(() => setInfoAnchor(null), []);
  const [changelogAnchor, setChangelogAnchor] = useState<PopoverAnchor | null>(null);
  const closeChangelog = useCallback(() => setChangelogAnchor(null), []);
  // A dot on What's New until the newest release has been opened on this device.
  const [unseenChanges, setUnseenChanges] = useState(false);
  useEffect(() => {
    // localStorage only exists in the browser, so read it after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUnseenChanges(hasUnseenChanges());
  }, []);
  // Mirror view (M): the stage flipped left to right, like flipping a canvas.
  const flipped = useViewFlip();
  const sessionPhase = useSession((s) => s.phase);
  // The capsule takes the top bar's centre spot whenever it has something to show.
  const timing = capsulePhase(sessionPhase);
  // A pose session owns the screen: the interface stays hidden until it ends.
  const [sessionLocked, setSessionLocked] = useState(false);

  // "Just the pose": every piece of interface fades away and the figure
  // can be orbited but not posed. The corner button (or Esc / H) brings it back.
  const [focus, setFocus] = useState(false);
  const focusRef = useRef(false);
  // Posing pauses while the interface is hidden, while lighting is being
  // set up, and while a pose session has the stage. One place decides.
  const sessionHoldsStage = useRef(false);
  // Lighting and the fish-eye lens belong to the open pose.
  usePoseLook(history, activeId, sessionHoldsStage);
  const refreshViewOnly = useCallback(() => {
    poseStore.setViewOnly(focusRef.current || lightingUi.get().open || sessionHoldsStage.current);
  }, []);
  /**
   * One menu at a time. Every button that opens a panel or popover calls
   * this first, so opening one closes whichever was open: lighting, the
   * timer, the fish-eye menu (the lens itself stays as it is),
   * camera angles, settings, and anything added later.
   */
  const closeMenusExcept = useCallback(
    (keep: Menu | null) => {
      if (keep !== "lighting" && lightingUi.get().open) lightingUi.set({ open: false, dragging: null });
      if (keep !== "timer") setTimerAnchor(null);
      if (keep !== "views") setViewsAnchor(null);
      if (keep !== "settings") setSettingsAnchor(null);
      if (keep !== "info") setInfoAnchor(null);
      if (keep !== "changelog") setChangelogAnchor(null);
      if (keep !== "fisheye" && perspective.ui().open) perspective.setUi({ open: false });
      refreshViewOnly();
    },
    [refreshViewOnly],
  );

  const setFocusMode = useCallback(
    (on: boolean) => {
      // During a pose session the history, prompt and "New pose" would let
      // you swap or save the session's poses by accident, so they stay away.
      if (!on && sessionHoldsStage.current) return;
      focusRef.current = on;
      setFocus(on);
      if (on) {
        closeMenusExcept(null);
        (document.activeElement as HTMLElement | null)?.blur();
      }
      refreshViewOnly();
    },
    [refreshViewOnly, closeMenusExcept],
  );

  // Lighting mode: the lights appear in the scene and can be dragged; the
  // body can't be posed meanwhile, so a missed grab never bends an arm.
  const lightingOpen = useLightingUi((s) => s.open);
  const setLighting = useCallback(
    (open: boolean) => {
      if (open) {
        closeMenusExcept("lighting");
        poseStore.select(null);
      }
      lightingUi.set({ open, dragging: null });
      refreshViewOnly();
    },
    [refreshViewOnly, closeMenusExcept],
  );
  const closeLighting = useCallback(() => setLighting(false), [setLighting]);

  // The drawing timer's setup popover, from its top-bar button (or T).
  const timerButton = useRef<HTMLButtonElement>(null);
  const toggleTimer = useCallback(() => {
    const trigger = timerButton.current;
    if (!trigger) return;
    if (timerAnchor) return setTimerAnchor(null);
    closeMenusExcept("timer");
    setTimerAnchor({ rect: trigger.getBoundingClientRect(), returnFocus: trigger });
  }, [timerAnchor, closeMenusExcept]);

  // Exact views kept with the open pose, to come back to after orbiting away.
  const viewsButton = useRef<HTMLButtonElement>(null);
  const toggleViews = useCallback(() => {
    const trigger = viewsButton.current;
    if (!trigger) return;
    if (viewsAnchor) return setViewsAnchor(null);
    closeMenusExcept("views");
    setViewsAnchor({ rect: trigger.getBoundingClientRect(), returnFocus: trigger });
  }, [viewsAnchor, closeMenusExcept]);

  // Fish-eye lens: curvilinear perspective, with optional guide lines. Its
  // button (or P) opens its menu like any other; the lens is switched on and
  // off inside the menu, and stays as it is when the menu closes.
  const perspectiveOn = usePerspectiveUi((s) => s.on);
  const fisheyeMenuOpen = usePerspectiveUi((s) => s.open);
  const setPerspective = useCallback((on: boolean) => perspective.toggle(on), []);
  const toggleFisheyeMenu = useCallback(() => {
    if (perspective.ui().open) return perspective.setUi({ open: false });
    closeMenusExcept("fisheye");
    poseStore.select(null);
    perspective.setUi({ open: true });
  }, [closeMenusExcept]);
  const closeFisheyeMenu = useCallback(() => perspective.setUi({ open: false }), []);
  // Posing carries on through the lens (clicks are traced through it: scene/lens.ts).
  // Selecting a part brings up its inspector in the menu's place.
  useEffect(() => {
    if (jointSelected && perspective.ui().open) perspective.setUi({ open: false });
  }, [jointSelected]);
  const toggleSettings = useCallback(
    (trigger: HTMLElement) => {
      if (settingsAnchor) return setSettingsAnchor(null);
      closeMenusExcept("settings");
      setSettingsAnchor({ rect: trigger.getBoundingClientRect(), returnFocus: trigger });
    },
    [settingsAnchor, closeMenusExcept],
  );
  const toggleInfo = useCallback(
    (trigger: HTMLElement) => {
      if (infoAnchor) return setInfoAnchor(null);
      closeMenusExcept("info");
      setInfoAnchor({ rect: trigger.getBoundingClientRect(), returnFocus: trigger });
    },
    [infoAnchor, closeMenusExcept],
  );
  const toggleChangelog = useCallback(
    (trigger: HTMLElement) => {
      if (changelogAnchor) return setChangelogAnchor(null);
      closeMenusExcept("changelog");
      setChangelogAnchor({ rect: trigger.getBoundingClientRect(), returnFocus: trigger });
      setUnseenChanges(false);
    },
    [changelogAnchor, closeMenusExcept],
  );

  // Apply the theme and stage colour app-wide (the boot script did the
  // first paint; this keeps them in sync with Settings and the OS).
  const scheme = useScheme();
  const { background, promptIdeas, showToolbar, showPromptBar } = useSettings();
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.scheme = scheme;
    root.style.setProperty("--stage", stageColor(background, scheme));
  }, [scheme, background]);

  const composer = useRef<ComposerHandle>(null);

  const active = history.entries.find((e) => e.id === activeId) ?? null;

  // With the prompt bar hidden in Settings, / summons it; it steps back after
  // sending, on Escape, or when left empty. A failed pose brings it up so
  // Retry is in reach.
  const [promptSummoned, setPromptSummoned] = useState(false);
  const activeError = active ? generation.errors[active.id] : undefined;
  const promptVisible = showPromptBar || promptSummoned || !!activeError;
  const focusPrompt = useCallback(() => {
    if (settingsStore.get().showPromptBar) return composer.current?.focus();
    setPromptSummoned(true);
    // Next frame: once the bar is interactive again.
    requestAnimationFrame(() => composer.current?.focus());
  }, []);
  const dismissPrompt = useCallback(() => setPromptSummoned(false), []);

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
        const entry = withCurrentLook(createPoseEntry(prompt));
        history.add(entry);
        setActiveId(entry.id);
        void generation.run(entry, prompt);
      }
      if (isCompact) setSidebarOpen(false);
      setPromptSummoned(false);
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
    // Already on the default pose: start it over with the default look
    // (leaving a saved pose does this once that pose has kept its own).
    if (!activeId) showLook(null);
    setActiveId(null);
    if (isCompact) setSidebarOpen(false);
    // Ready to describe it (unless the prompt bar is hidden: / brings it up).
    if (settingsStore.get().showPromptBar) composer.current?.focus();
  }, [isCompact, activeId]);

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
  //   /  prompt   1–4  camera presets   C  saved camera angles   O  outline   P  fish-eye lens   L  lighting   T  timer   Esc  deselect
  //   Ctrl/⌘ Z  undo   Ctrl/⌘ ⇧ Z or Ctrl Y  redo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      // Undo / redo (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y) reach the pose from anywhere
      // except a field with text in it, where they undo the typing as usual.
      // The prompt box is usually focused (after New pose or a prompt), so an
      // empty one must not swallow them.
      const field = target.closest<HTMLInputElement | HTMLTextAreaElement>("input:not([type=range]), textarea");
      const editingText = (field && field.value !== "") || target.closest("[contenteditable=true], [role=alertdialog]");
      if (mod && !e.altKey && (key === "z" || key === "y") && !editingText) {
        e.preventDefault();
        if (key === "y" || e.shiftKey) editing.redo();
        else editing.undo();
        return;
      }
      if (target.closest("input:not([type=range]), textarea, [contenteditable=true], [role=menu], [role=dialog], [role=alertdialog]")) return;
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
      // While a timer runs: Space pauses / resumes, → skips to the next pose.
      const phase = session.get().phase;
      if (phase !== "idle" && phase !== "summary" && target.tagName !== "INPUT") {
        if (e.key === " " && !target.closest("button")) {
          e.preventDefault();
          if (phase === "drawing") session.pause();
          else if (phase === "paused") session.resume();
          else if (phase === "timeUp") session.again();
          return;
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          session.next();
          return;
        }
      }
      const preset = VIEW_ORDER[Number(e.key) - 1];
      if (e.key === "?") {
        e.preventDefault();
        // Opens from whichever help button is on screen (sidebar or its collapsed corner).
        const trigger = document.querySelector<HTMLElement>('button[aria-label="Shortcuts and tips"]');
        if (trigger && !focusRef.current) toggleInfo(trigger);
      } else if (e.key === "/") {
        e.preventDefault();
        focusPrompt();
      } else if (e.key === "Escape") {
        if (focusRef.current) setFocusMode(false);
        else if (lightingUi.get().open) setLighting(false);
        else poseStore.select(null);
      } else if (key === "p" && target.tagName !== "INPUT") {
        if (!focusRef.current) toggleFisheyeMenu();
      } else if (key === "c" && target.tagName !== "INPUT") {
        if (!focusRef.current) toggleViews();
      } else if (key === "t" && target.tagName !== "INPUT") {
        // Not while a session has the screen (the interface is hidden then).
        if (!focusRef.current) toggleTimer();
      } else if (key === "l" && target.tagName !== "INPUT") {
        if (!focusRef.current) setLighting(!lightingUi.get().open);
      } else if (key === "h" && target.tagName !== "INPUT") {
        setFocusMode(!focusRef.current);
      } else if (preset && target.tagName !== "INPUT") {
        requestView(preset);
      } else if (key === "o" && target.tagName !== "INPUT") {
        toggleOutline();
      } else if (key === "m" && target.tagName !== "INPUT") {
        // Works with the interface hidden too: checking a drawing against a clean, flipped stage.
        viewFlip.toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestView, toggleOutline, editing, setFocusMode, setLighting, toggleTimer, toggleFisheyeMenu, toggleViews, toggleInfo, focusPrompt]);

  const contentInset = sidebarOpen && !isCompact && !focus ? SIDEBAR_SPACE : 0;

  /* ------------------------------------------------- saved camera angles */

  const savedViews = active?.views ?? [];

  /**
   * Thumbnails always show the pose as it is now: whenever the menu opens
   * (and for a newly saved angle), each angle is re-rendered from the live
   * scene. The menu's own entrance covers the frame or two this takes.
   */
  const { setThumbs } = history;
  const refreshThumbs = useCallback(
    (poseId: string, views: SavedView[]) => {
      void viewSnapshots.take(views).then((thumbs) => setThumbs(poseId, thumbs));
    },
    [setThumbs],
  );
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  });
  const viewsOpen = viewsAnchor !== null;
  useEffect(() => {
    const pose = activeRef.current;
    if (viewsOpen && pose?.views?.length) refreshThumbs(pose.id, pose.views);
  }, [viewsOpen, activeId, refreshThumbs]);

  const saveView = useCallback(() => {
    const camera = cameraBridge.get();
    if (!camera) return;
    const view: SavedView = {
      id: crypto.randomUUID(),
      ...camera,
      fisheye: perspective.ui().on,
      createdAt: Date.now(),
    };
    let poseId: string;
    if (active) {
      poseId = active.id;
      history.update(active.id, { views: [...(active.views ?? []), view].slice(-MAX_VIEWS) });
    } else {
      // The default pose isn't saved yet: keep it (like editing it does), with this angle.
      const entry = { ...withCurrentLook(createUntitledEntry(poseStore.get().pose)), views: [view] };
      poseId = entry.id;
      history.add(entry);
      setActiveId(entry.id);
    }
    refreshThumbs(poseId, [view]);
  }, [active, history, refreshThumbs]);

  /** Glide back to a saved angle (switching the fish-eye lens on or off to match). */
  const goToView = useCallback((view: SavedView) => {
    if (view.fisheye !== perspective.ui().on) perspective.toggle(view.fisheye);
    cameraBridge.go(view);
  }, []);

  const deleteView = useCallback(
    (id: string) => {
      if (active) history.update(active.id, { views: (active.views ?? []).filter((v) => v.id !== id) });
    },
    [active, history],
  );

  /* ----------------------------------------------------- drawing timer */

  const latest = useRef({ history, activeId, view, contentInset });
  useEffect(() => {
    latest.current = { history, activeId, view, contentInset };
  });
  const savedPoseCount = history.entries.filter((e) => !isRestPose(e.pose)).length;


  /** A small JPEG of the figure (for the session summary). */
  const captureStage = useCallback(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("main canvas");
    if (!canvas || !canvas.clientWidth) return undefined;
    try {
      const { width: W, height: H } = canvas;
      const cropH = H * 0.92;
      const cropW = Math.min(W, cropH * 0.7);
      // The figure sits in the middle of the visible stage (right of the sidebar).
      const cx = (W + latest.current.contentInset * (W / canvas.clientWidth)) / 2;
      const out = document.createElement("canvas");
      out.width = 210;
      out.height = 300;
      out.getContext("2d")?.drawImage(canvas, Math.max(0, Math.min(W - cropW, cx - cropW / 2)), (H - cropH) * 0.4, cropW, cropH, 0, 0, 210, 300);
      return out.toDataURL("image/jpeg", 0.82);
    } catch {
      return undefined;
    }
  }, []);

  const startTimer = useCallback(() => {
    const s = timerSettings.get();
    setTimerAnchor(null);
    lightingUi.set({ open: false, dragging: null });
    poseStore.select(null);
    // A session shows its own poses: step off the open pose (and come back after).
    const returnTo = latest.current.activeId;
    const viewBefore = latest.current.view;
    // A pose session takes the whole screen (and the interface comes back
    // when it ends); the plain timer leaves everything as it is.
    const isSession = s.mode === "session";
    const hid = isSession && !focusRef.current;
    if (isSession) {
      if (hid) setFocusMode(true);
      sessionHoldsStage.current = true;
      setSessionLocked(true);
      setActiveId(null);
    }
    refreshViewOnly();

    session.start({
      savedPoses: () =>
        latest.current.history.entries.filter((e) => !isRestPose(e.pose)).map((e) => ({ title: e.title, pose: e.pose })),
      show: (pose) => poseStore.load(pose),
      randomView: () => {
        const others = VIEW_ORDER.filter((v) => v !== latest.current.view);
        requestView(others[Math.floor(Math.random() * others.length)]);
      },
      capture: captureStage,
      end: () => {
        if (sessionHoldsStage.current) {
          sessionHoldsStage.current = false;
          setSessionLocked(false);
          if (hid && focusRef.current) setFocusMode(false);
          // Back to a clear stage: the sidebar stays tucked away after a session.
          setSidebarOpen(false);
          setActiveId(returnTo);
          const entry = latest.current.history.entries.find((e) => e.id === returnTo);
          poseStore.load(entry?.pose ?? REST_POSE);
          // Random angles moved the camera; go back to where you were.
          if (s.randomView && viewBefore && latest.current.view !== viewBefore) requestView(viewBefore);
        }
        refreshViewOnly();
      },
    });
  }, [setFocusMode, refreshViewOnly, requestView, captureStage]);

  /** Starred session poses → history (skipping ones that came from history). */
  const saveSessionPoses = useCallback(
    (poses: SessionPose[]) => {
      const existing = new Set(latest.current.history.entries.map((e) => e.pose));
      const now = Date.now();
      poses
        .filter((p) => !existing.has(p.pose))
        .forEach((p, i) =>
          history.add({
            id: crypto.randomUUID(),
            title: p.title,
            prompts: p.prompt && p.prompt !== p.title ? [p.prompt] : [],
            pose: p.pose,
            createdAt: now + i,
            status: "ready",
          }),
        );
    },
    [history],
  );

  return (
    <MotionConfig reducedMotion="user" transition={spring}>
      <main className="fixed inset-0 overflow-hidden bg-stage text-label">
        {/* Mirror view: the stage flipped left to right, instantly. */}
        <div className="absolute inset-0" style={flipped ? { transform: "scaleX(-1)" } : undefined}>
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
              onInfo={toggleInfo}
              onChangelog={toggleChangelog}
              unseenChanges={unseenChanges}
            />
          ) : (
            <CollapsedSidebarButtons
              key="collapsed"
              onExpand={() => setSidebarOpen(true)}
              onNewPose={newPose}
              onSettings={toggleSettings}
              onInfo={toggleInfo}
              onChangelog={toggleChangelog}
              unseenChanges={unseenChanges}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {settingsAnchor && <SettingsPanel key="settings" anchor={settingsAnchor} onClose={closeSettings} />}
          {infoAnchor && <InfoPanel key="info" anchor={infoAnchor} onClose={closeInfo} />}
          {changelogAnchor && <ChangelogPanel key="changelog" anchor={changelogAnchor} onClose={closeChangelog} />}
        </AnimatePresence>

        {/* Floating chrome centred over the visible stage. */}
        <motion.div
          className="pointer-events-none absolute inset-0 z-10 flex flex-col"
          initial={false}
          animate={{ paddingLeft: contentInset }}
        >
          <div className="flex items-start justify-end gap-3 p-3 sm:grid sm:grid-cols-[1fr_auto_1fr]">
            <div className="hidden sm:block" />
            <div className={`flex-col items-center gap-2 ${timing ? "flex" : "hidden sm:flex"}`}>
              {/* A running timer docks here, in place of the pose name, so it
                  never covers the controls around it. */}
              {timing ? (
                <TimerCapsule variant="docked" show={!focus} />
              ) : (
                <>
                  <StatusPill entry={active} onTogglePin={history.togglePin} result={generation.lastResult} />
                  {/* Posing is paused in lighting mode, so its hint would mislead. */}
                  <ControlsHint visible={!hasInteracted && !lightingOpen} />
                </>
              )}
            </div>
            {/* Hidden in Settings, the toolbar stays in place, just invisible and
                untouchable: its shortcuts still work, and panels they open
                still grow from where their buttons are. */}
            <motion.div
              className="flex items-center gap-2 justify-self-end"
              initial={false}
              animate={{ opacity: showToolbar ? 1 : 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              inert={!showToolbar}
              aria-hidden={!showToolbar || undefined}
              style={{ pointerEvents: showToolbar ? undefined : "none" }}
            >
              <HistoryControls
                canUndo={editing.canUndo}
                canRedo={editing.canRedo}
                onUndo={editing.undo}
                onRedo={editing.redo}
              />
              <button
                ref={viewsButton}
                type="button"
                onClick={toggleViews}
                aria-pressed={!!viewsAnchor}
                aria-label="Camera angles"
                data-tip="Camera angles"
                data-tip-kbd="C"
                className={`pressable pointer-events-auto flex size-9 items-center justify-center rounded-full ${
                  viewsAnchor ? "bg-accent text-on-accent shadow-[var(--shadow-float)]" : "material text-label-2 hover:text-label"
                }`}
              >
                <Camera size={17} aria-hidden />
              </button>
              <ViewSwitcher value={view} onChange={requestView} />
              <button
                type="button"
                onClick={() => viewFlip.toggle()}
                aria-pressed={flipped}
                aria-label="Mirror view"
                data-tip={flipped ? "Mirror view: on" : "Mirror view"}
                data-tip-kbd="M"
                className={`pressable pointer-events-auto flex size-9 items-center justify-center rounded-full ${
                  flipped ? "material text-accent" : "material text-label-2 hover:text-label"
                }`}
              >
                {/* Lucide draws this icon as a top-to-bottom flip; turned a quarter it reads left-to-right. */}
                <FlipHorizontal2 size={17} aria-hidden className="rotate-90" />
              </button>
              <button
                type="button"
                onClick={toggleFisheyeMenu}
                aria-pressed={fisheyeMenuOpen}
                aria-label={perspectiveOn ? "Fish-eye lens (on)" : "Fish-eye lens"}
                data-tip={perspectiveOn ? "Fish-eye lens: on" : "Fish-eye lens"}
                data-tip-kbd="P"
                className={`pressable pointer-events-auto flex size-9 items-center justify-center rounded-full ${
                  fisheyeMenuOpen
                    ? "bg-accent text-on-accent shadow-[var(--shadow-float)]"
                    : // Menu closed but the lens is on: the icon stays tinted.
                      perspectiveOn
                      ? "material text-accent"
                      : "material text-label-2 hover:text-label"
                }`}
              >
                <Axis3d size={17} aria-hidden />
              </button>
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
              <button
                type="button"
                ref={timerButton}
                onClick={toggleTimer}
                aria-pressed={!!timerAnchor || timing}
                aria-label="Drawing timer"
                data-tip="Drawing timer"
                data-tip-kbd="T"
                className={`pressable pointer-events-auto flex size-9 items-center justify-center rounded-full ${
                  timerAnchor || timing ? "bg-accent text-on-accent shadow-[var(--shadow-float)]" : "material text-label-2 hover:text-label"
                }`}
              >
                <Timer size={17} aria-hidden />
              </button>
            </motion.div>
          </div>

          <div className="relative min-h-0 flex-1 px-3">
            {/* One panel at a time, each in its own layer at the top right:
                one sliding out never squeezes the one sliding in. */}
            <div className="absolute top-0 right-3 max-md:inset-x-3 max-md:top-auto max-md:bottom-2">
              <JointInspector className="w-[272px] max-md:w-auto" />
            </div>
            <AnimatePresence initial={false}>
              {lightingOpen && (
                <div key="lighting" className="absolute top-0 right-3 max-md:inset-x-3 max-md:top-auto max-md:bottom-2">
                  <LightingPanel onClose={closeLighting} className="w-[300px] max-md:w-auto" />
                </div>
              )}
              {fisheyeMenuOpen && (
                <div key="fisheye" className="absolute top-0 right-3 max-md:inset-x-3 max-md:top-auto max-md:bottom-2">
                  <PerspectivePanel
                    on={perspectiveOn}
                    onToggle={setPerspective}
                    onClose={closeFisheyeMenu}
                    className="w-[300px] max-md:w-auto"
                  />
                </div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex flex-col items-center gap-3 px-3 pt-3 pb-3 sm:pb-5">
            <UndoToast entry={deleted} onUndo={undoDelete} onDismiss={dismissToast} />
            {/* Hidden in Settings: it stays mounted (keeping anything typed)
                and slides up when / summons it. */}
            <motion.div
              className="flex w-full justify-center"
              initial={false}
              animate={promptVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
              transition={{ type: "spring", bounce: 0, duration: 0.35 }}
              inert={!promptVisible}
              aria-hidden={!promptVisible || undefined}
              style={{ pointerEvents: promptVisible ? undefined : "none" }}
            >
              <Composer
                ref={composer}
                onSubmit={submitPrompt}
                onDismiss={dismissPrompt}
                showSuggestions={promptIdeas && !active && !jointSelected}
                placeholder={active ? `Refine “${active.title}”…` : "Describe a pose…"}
                busy={active?.status === "posing"}
                error={activeError}
                onRetry={active ? () => generation.retry(active.id) : undefined}
              />
            </motion.div>
          </div>
        </motion.div>
        <HoverLabel />
        </motion.div>

        {/* During a pose session the interface stays hidden until it ends. */}
        {/* Part of the toolbar: hidden with it in Settings (H still works). */}
        {!sessionLocked && showToolbar && <FocusToggle focus={focus} onChange={setFocusMode} />}

        {/* With the interface hidden, the timer floats at the top of the stage. */}
        <TimerCapsule variant="floating" show={focus} inset={contentInset} />
        <ReadyOverlay />
      </main>
      <AnimatePresence>
        {timerAnchor && (
          <TimerPanel key="timer" anchor={timerAnchor} savedCount={savedPoseCount} onStart={startTimer} onClose={closeTimer} />
        )}
      </AnimatePresence>
      <SessionSummary onSave={saveSessionPoses} />
      <AnimatePresence>
        {viewsAnchor && (
          <CameraViewsMenu
            key="views"
            anchor={viewsAnchor}
            poseTitle={active?.title ?? null}
            views={savedViews}
            onSave={saveView}
            onGo={goToView}
            onDelete={deleteView}
            onClose={closeViews}
          />
        )}
      </AnimatePresence>
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
