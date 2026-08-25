import {
  type CSSProperties,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { EditorArea } from "./editor-area";
import { CompactRecentsList } from "./compact-recents-list";
import { ScrollFade } from "@/components/scroll-fade";
import {
  useActiveFilePath,
  useCanNavigateBack,
  useCanNavigateForward,
  useNavigateBack,
  useNavigateForward,
  useOpenFiles,
} from "@/hooks/use-tabs";
import { openStandaloneFile } from "@/hooks/use-open-drop";
import { getFileName } from "@/lib/paths";

const PICKER_POPUP_ID = "compact-file-picker-popup";
const PICKER_ANIMATION_MS = 260;
const PICKER_TRIGGER_BG_CLOSE_DELAY_MS = 90;
const PICKER_TRIGGER_SURFACE_CLOSE_HOLD_MS = 300;
const PICKER_GAP_PX = 8;
const PICKER_MAX_LIST_HEIGHT = 420;
const PICKER_VIEWPORT_HEIGHT_OFFSET = 96;
const PICKER_CLOSED_RADIUS = 8;
const PICKER_OPEN_RADIUS = 16;
const FALLBACK_PICKER_METRICS = {
  triggerWidth: 120,
  triggerHeight: 32,
  rootWidth: 360,
  openHeight: PICKER_MAX_LIST_HEIGHT,
};

interface PickerFrameGeometry {
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
  radius: number;
}

// eslint-disable-next-line react-doctor/no-giant-component, react-doctor/prefer-useReducer
export function CompactFileLayout() {
  const activeFilePath = useActiveFilePath();
  const openFiles = useOpenFiles();
  const [isNavigatorOpen, setIsNavigatorOpen] = useState(false);
  const [isPickerMounted, setIsPickerMounted] = useState(false);
  const [isTriggerHovered, setIsTriggerHovered] = useState(false);
  const [isTriggerFocused, setIsTriggerFocused] = useState(false);
  const [pickerMetrics, setPickerMetrics] = useState(FALLBACK_PICKER_METRICS);
  const pickerRootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pickerFrameRef = useRef<HTMLDivElement>(null);
  const pickerShadowRef = useRef<HTMLDivElement>(null);
  const pickerListRef = useRef<HTMLDivElement>(null);
  const pickerContentScaleRef = useRef<HTMLDivElement>(null);
  const pickerBorderRef = useRef<HTMLDivElement>(null);
  const openFrameRef = useRef<number | null>(null);
  const pickerAnimationFrameRef = useRef<number | null>(null);
  const currentPickerGeometryRef = useRef<PickerFrameGeometry | null>(null);
  const activeFile = activeFilePath ? openFiles.get(activeFilePath) : null;
  const title = activeFilePath ? activeFile?.title || getFileName(activeFilePath) : "Choose file";

  const measurePickerMetrics = useCallback(() => {
    const triggerRect = triggerRef.current?.getBoundingClientRect();
    const rootRect = pickerRootRef.current?.getBoundingClientRect();
    const triggerHeight = Math.ceil(triggerRect?.height ?? FALLBACK_PICKER_METRICS.triggerHeight);
    const maxOpenHeight = Math.max(
      triggerHeight,
      Math.min(PICKER_MAX_LIST_HEIGHT, window.innerHeight - PICKER_VIEWPORT_HEIGHT_OFFSET),
    );
    const measuredListHeight = pickerListRef.current?.offsetHeight;
    const nextMetrics = {
      triggerWidth: Math.ceil(triggerRect?.width ?? FALLBACK_PICKER_METRICS.triggerWidth),
      triggerHeight,
      rootWidth: Math.ceil(rootRect?.width ?? FALLBACK_PICKER_METRICS.rootWidth),
      openHeight: Math.max(
        triggerHeight,
        Math.min(maxOpenHeight, Math.ceil(measuredListHeight ?? maxOpenHeight)),
      ),
    };
    setPickerMetrics((currentMetrics) => {
      if (
        currentMetrics.triggerWidth === nextMetrics.triggerWidth &&
        currentMetrics.triggerHeight === nextMetrics.triggerHeight &&
        currentMetrics.rootWidth === nextMetrics.rootWidth &&
        currentMetrics.openHeight === nextMetrics.openHeight
      ) {
        return currentMetrics;
      }
      return nextMetrics;
    });
  }, []);

  const handleOpenFile = useCallback(async (path: string) => {
    await openStandaloneFile(path);
  }, []);

  const openNavigator = useCallback(() => {
    if (openFrameRef.current) {
      window.cancelAnimationFrame(openFrameRef.current);
    }
    measurePickerMetrics();
    setIsPickerMounted(true);
    openFrameRef.current = window.requestAnimationFrame(() => {
      openFrameRef.current = null;
      setIsNavigatorOpen(true);
    });
  }, [measurePickerMetrics]);

  const closeNavigator = useCallback(() => {
    if (openFrameRef.current) {
      window.cancelAnimationFrame(openFrameRef.current);
      openFrameRef.current = null;
    }
    setIsNavigatorOpen(false);
  }, []);

  const onDismiss = useEffectEvent(() => {
    closeNavigator();
  });

  useEffect(() => {
    if (!isNavigatorOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && pickerRootRef.current?.contains(target)) return;
      onDismiss();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onDismiss();
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isNavigatorOpen]);

  // eslint-disable-next-line react-doctor/advanced-event-handler-refs
  useLayoutEffect(() => {
    measurePickerMetrics();

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measurePickerMetrics);
    if (triggerRef.current) resizeObserver?.observe(triggerRef.current);
    if (pickerRootRef.current) resizeObserver?.observe(pickerRootRef.current);
    if (pickerListRef.current) resizeObserver?.observe(pickerListRef.current);
    window.addEventListener("resize", measurePickerMetrics);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measurePickerMetrics);
    };
  }, [isPickerMounted, measurePickerMetrics]);

  useEffect(() => {
    if (isNavigatorOpen || !isPickerMounted) return;
    const timeout = window.setTimeout(() => {
      setIsPickerMounted(false);
    }, PICKER_ANIMATION_MS + PICKER_TRIGGER_SURFACE_CLOSE_HOLD_MS);
    return () => window.clearTimeout(timeout);
  }, [isNavigatorOpen, isPickerMounted]);

  // eslint-disable-next-line react-doctor/exhaustive-deps
  useEffect(() => {
    return () => {
      if (openFrameRef.current) {
        window.cancelAnimationFrame(openFrameRef.current);
      }
      if (pickerAnimationFrameRef.current) {
        window.cancelAnimationFrame(pickerAnimationFrameRef.current);
      }
    };
  }, []);

  const pickerOpenTop = pickerMetrics.triggerHeight + PICKER_GAP_PX;
  const pickerShellHeight = pickerOpenTop + pickerMetrics.openHeight;
  const pickerMaskLeft = isNavigatorOpen
    ? 0
    : Math.max(0, (pickerMetrics.rootWidth - pickerMetrics.triggerWidth) / 2);
  const pickerMaskTop = isNavigatorOpen ? pickerOpenTop : 0;
  const pickerMaskWidth = isNavigatorOpen ? pickerMetrics.rootWidth : pickerMetrics.triggerWidth;
  const pickerMaskHeight = isNavigatorOpen ? pickerMetrics.openHeight : pickerMetrics.triggerHeight;
  const pickerMaskRadius = isNavigatorOpen ? PICKER_OPEN_RADIUS : PICKER_CLOSED_RADIUS;
  const pickerFrameScaleX = pickerMaskWidth / pickerMetrics.rootWidth;
  const pickerFrameScaleY = pickerMaskHeight / pickerMetrics.openHeight;
  const pickerContentScaleX = 1 / pickerFrameScaleX;
  const pickerContentScaleY = 1 / pickerFrameScaleY;
  const pickerFrameGeometry = useMemo<PickerFrameGeometry>(
    () => ({
      left: pickerMaskLeft,
      top: pickerMaskTop,
      scaleX: pickerFrameScaleX,
      scaleY: pickerFrameScaleY,
      radius: pickerMaskRadius,
    }),
    [pickerMaskLeft, pickerMaskTop, pickerFrameScaleX, pickerFrameScaleY, pickerMaskRadius],
  );
  const pickerShellStyle = {
    width: `${pickerMetrics.rootWidth}px`,
    height: `${pickerShellHeight}px`,
    "--compact-picker-trigger-bg-opacity": isNavigatorOpen
      ? "0"
      : "var(--compact-picker-trigger-bg-closed-opacity)",
    "--compact-picker-trigger-bg-delay": isNavigatorOpen
      ? "0ms"
      : `${PICKER_TRIGGER_BG_CLOSE_DELAY_MS}ms`,
  } as CSSProperties;
  const shouldShowTriggerSurface = isPickerMounted || isTriggerHovered || isTriggerFocused;
  const pickerFrameStyle = {
    width: `${pickerMetrics.rootWidth}px`,
    height: `${pickerMetrics.openHeight}px`,
    transform: `translate3d(${pickerMaskLeft}px, ${pickerMaskTop}px, 0) scale(${pickerFrameScaleX}, ${pickerFrameScaleY})`,
    "--compact-picker-border-color": isNavigatorOpen ? "var(--line-subtler)" : "transparent",
    borderRadius: `${pickerMaskRadius / pickerFrameScaleX}px / ${pickerMaskRadius / pickerFrameScaleY}px`,
  } as CSSProperties;
  const pickerContentScaleStyle = {
    transform: `scale(${pickerContentScaleX}, ${pickerContentScaleY})`,
  } as CSSProperties;
  const pickerBorderStyle = {
    borderTopWidth: `${1 / pickerFrameScaleY}px`,
    borderRightWidth: `${1 / pickerFrameScaleX}px`,
    borderBottomWidth: `${1 / pickerFrameScaleY}px`,
    borderLeftWidth: `${1 / pickerFrameScaleX}px`,
  } as CSSProperties;

  useLayoutEffect(() => {
    const frame = pickerFrameRef.current;
    const shadow = pickerShadowRef.current;
    const contentScale = pickerContentScaleRef.current;
    const border = pickerBorderRef.current;
    if (!frame || !shadow || !contentScale || !border) return;

    const previousGeometry = currentPickerGeometryRef.current;
    if (!previousGeometry) {
      applyPickerFrameGeometry(frame, shadow, contentScale, border, pickerFrameGeometry);
      currentPickerGeometryRef.current = pickerFrameGeometry;
      return;
    }
    const frameElement = frame;
    const shadowElement = shadow;
    const contentScaleElement = contentScale;
    const borderElement = border;
    const fromGeometry = previousGeometry;

    if (pickerAnimationFrameRef.current) {
      window.cancelAnimationFrame(pickerAnimationFrameRef.current);
      pickerAnimationFrameRef.current = null;
    }

    const startTime = performance.now();

    function tick(now: number) {
      const progress = Math.min(1, (now - startTime) / PICKER_ANIMATION_MS);
      const easedProgress = compactPickerEase(progress);
      const nextGeometry = interpolatePickerFrameGeometry(
        fromGeometry,
        pickerFrameGeometry,
        easedProgress,
      );
      applyPickerFrameGeometry(
        frameElement,
        shadowElement,
        contentScaleElement,
        borderElement,
        nextGeometry,
      );
      currentPickerGeometryRef.current = nextGeometry;

      if (progress < 1) {
        pickerAnimationFrameRef.current = window.requestAnimationFrame(tick);
      } else {
        pickerAnimationFrameRef.current = null;
        applyPickerFrameGeometry(
          frameElement,
          shadowElement,
          contentScaleElement,
          borderElement,
          pickerFrameGeometry,
        );
        currentPickerGeometryRef.current = pickerFrameGeometry;
      }
    }

    pickerAnimationFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (pickerAnimationFrameRef.current) {
        window.cancelAnimationFrame(pickerAnimationFrameRef.current);
        pickerAnimationFrameRef.current = null;
      }
    };
  }, [pickerFrameGeometry]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-transparent text-text-primary">
      <div
        data-tauri-drag-region
        className="absolute inset-x-0 top-0 z-30"
        style={{ height: "var(--chrome-drag-height)" }}
      />
      <div
        className="pointer-events-none absolute left-0 top-0 z-50 flex items-center"
        style={{
          height: "calc(var(--chrome-control-height) + var(--chrome-control-padding) * 2)",
          padding: "var(--chrome-control-padding) 12px var(--chrome-control-padding) 92px",
        }}
      >
        <CompactNavControls />
      </div>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-50 flex justify-center"
        style={{
          height: "calc(var(--chrome-control-height) + var(--chrome-control-padding) * 2)",
          paddingBlock: "var(--chrome-control-padding)",
        }}
      >
        <div
          ref={pickerRootRef}
          className="pointer-events-none relative isolate flex w-[min(360px,calc(100vw-40px))] justify-center"
        >
          <div
            id={isPickerMounted ? PICKER_POPUP_ID : undefined}
            role={isPickerMounted ? "dialog" : undefined}
            aria-label={isPickerMounted ? "File navigator" : undefined}
            data-state={isNavigatorOpen ? "open" : "closed"}
            className={`compact-picker-shell absolute left-0 top-0 z-0 ${
              shouldShowTriggerSurface ? "opacity-100" : "opacity-0"
            }`}
            style={{
              ...pickerShellStyle,
              pointerEvents: isNavigatorOpen ? "auto" : "none",
            }}
          >
            <div
              ref={pickerShadowRef}
              aria-hidden="true"
              className="compact-picker-card-shadow absolute left-0 top-0"
              style={pickerFrameStyle}
            />
            <div
              ref={pickerFrameRef}
              className="compact-picker-card-frame absolute left-0 top-0"
              style={pickerFrameStyle}
            >
              <div aria-hidden="true" className="compact-picker-card-surface absolute inset-0" />
              {isPickerMounted && (
                <div
                  ref={pickerContentScaleRef}
                  className="compact-picker-content-scale absolute left-0 top-0 z-10 w-full"
                  style={pickerContentScaleStyle}
                >
                  <div
                    className={`compact-picker-content ${
                      isNavigatorOpen ? "compact-picker-content-open" : ""
                    }`}
                  >
                    <ScrollFade
                      ref={pickerListRef}
                      className="max-h-[420px] overflow-y-auto px-2 py-3 scrollbar-none"
                    >
                      <CompactRecentsList
                        openFile={handleOpenFile}
                        onOpenFileComplete={closeNavigator}
                        className="flex flex-col gap-2"
                      />
                    </ScrollFade>
                  </div>
                </div>
              )}
              <div
                ref={pickerBorderRef}
                aria-hidden="true"
                className="compact-picker-card-border absolute inset-0 z-20"
                style={pickerBorderStyle}
              />
            </div>
          </div>

          <button
            ref={triggerRef}
            type="button"
            aria-label="Open file navigator"
            aria-haspopup="dialog"
            aria-controls={isNavigatorOpen ? PICKER_POPUP_ID : undefined}
            aria-expanded={isNavigatorOpen}
            onClick={isNavigatorOpen ? closeNavigator : openNavigator}
            onFocus={() => setIsTriggerFocused(true)}
            onBlur={() => setIsTriggerFocused(false)}
            onPointerEnter={() => setIsTriggerHovered(true)}
            onPointerLeave={() => setIsTriggerHovered(false)}
            className="pointer-events-auto relative z-30 inline-flex h-[var(--chrome-control-height)] max-w-[240px] items-center justify-center gap-1.5 rounded-lg border border-transparent bg-transparent px-3 font-[inherit] text-[13px] text-[var(--fg-base)]"
          >
            <span className="relative min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              {title}
            </span>
            <span
              aria-hidden="true"
              className={`relative flex h-3 w-3 shrink-0 items-center justify-center text-[var(--text-icon-muted)] transition-transform duration-150 ease-out ${
                isNavigatorOpen ? "-rotate-90" : "rotate-90"
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M4.5 3.5L7.5 6L4.5 8.5"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
        </div>
      </div>

      <div className="relative h-full min-w-0 bg-bg">
        <EditorArea showFooter={false} layout="tabs" />
      </div>
    </div>
  );
}

function CompactNavControls() {
  const navigateBack = useNavigateBack();
  const navigateForward = useNavigateForward();
  const canNavigateBack = useCanNavigateBack();
  const canNavigateForward = useCanNavigateForward();

  return (
    <div className="pointer-events-auto flex items-center gap-0.5">
      <CompactNavButton
        label="Back"
        glyph="←"
        disabled={!canNavigateBack}
        onClick={() => void navigateBack()}
      />
      <CompactNavButton
        label="Forward"
        glyph="→"
        disabled={!canNavigateForward}
        onClick={() => void navigateForward()}
      />
    </div>
  );
}

interface CompactNavButtonProps {
  label: string;
  glyph: string;
  disabled: boolean;
  onClick: () => void;
}

function CompactNavButton({ label, glyph, disabled, onClick }: CompactNavButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="flex h-[var(--chrome-control-height)] w-7 items-center justify-center rounded-lg text-base text-[var(--text-icon-muted)] transition-colors enabled:hover:bg-[var(--surface-subtle)] enabled:hover:text-[var(--text-secondary)] disabled:opacity-30"
    >
      {glyph}
    </button>
  );
}

function applyPickerFrameGeometry(
  frame: HTMLDivElement,
  shadow: HTMLDivElement,
  contentScale: HTMLDivElement,
  border: HTMLDivElement,
  geometry: PickerFrameGeometry,
) {
  frame.style.transform = `translate3d(${geometry.left}px, ${geometry.top}px, 0) scale(${geometry.scaleX}, ${geometry.scaleY})`;
  frame.style.borderRadius = `${geometry.radius / geometry.scaleX}px / ${
    geometry.radius / geometry.scaleY
  }px`;
  shadow.style.transform = frame.style.transform;
  shadow.style.borderRadius = frame.style.borderRadius;
  contentScale.style.transform = `scale(${1 / geometry.scaleX}, ${1 / geometry.scaleY})`;
  border.style.borderTopWidth = `${1 / geometry.scaleY}px`;
  border.style.borderRightWidth = `${1 / geometry.scaleX}px`;
  border.style.borderBottomWidth = `${1 / geometry.scaleY}px`;
  border.style.borderLeftWidth = `${1 / geometry.scaleX}px`;
}

function interpolatePickerFrameGeometry(
  from: PickerFrameGeometry,
  to: PickerFrameGeometry,
  progress: number,
): PickerFrameGeometry {
  return {
    left: interpolateNumber(from.left, to.left, progress),
    top: interpolateNumber(from.top, to.top, progress),
    scaleX: interpolateNumber(from.scaleX, to.scaleX, progress),
    scaleY: interpolateNumber(from.scaleY, to.scaleY, progress),
    radius: interpolateNumber(from.radius, to.radius, progress),
  };
}

function interpolateNumber(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

function compactPickerEase(progress: number) {
  return cubicBezier(progress, 0.32, 0, 0.2, 1);
}

function cubicBezier(progress: number, x1: number, y1: number, x2: number, y2: number) {
  if (progress <= 0 || progress >= 1) return progress;

  let t = progress;
  for (let i = 0; i < 4; i += 1) {
    const x = bezierCoordinate(t, x1, x2) - progress;
    const derivative = bezierDerivative(t, x1, x2);
    if (Math.abs(x) < 0.001 || derivative === 0) break;
    t -= x / derivative;
  }

  return bezierCoordinate(t, y1, y2);
}

function bezierCoordinate(t: number, point1: number, point2: number) {
  const inverseT = 1 - t;
  return 3 * inverseT * inverseT * t * point1 + 3 * inverseT * t * t * point2 + t * t * t;
}

function bezierDerivative(t: number, point1: number, point2: number) {
  const inverseT = 1 - t;
  return (
    3 * inverseT * inverseT * point1 +
    6 * inverseT * t * (point2 - point1) +
    3 * t * t * (1 - point2)
  );
}
