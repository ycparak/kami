import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { type AnimationPlaybackControlsWithThen, animate, motionValue } from "motion";

export type CarouselSlide = {
  src: string;
  tab: string;
  description: string;
};

type CarouselProps = {
  slides: CarouselSlide[];
  label?: string;
};

const DRAG_DISTANCE_TOLERANCE = 0.3;
const DRAG_VELOCITY_TOLERANCE = 3;
const EDGE_RESISTANCE = 0.5;
const WHEEL_SLIP = 0.1;
const WHEEL_GESTURE_DURATION = 150;
const WHEEL_RESTART_DELAY = 1000;
const WHEEL_INTENT_THRESHOLD = 8;
const WHEEL_HORIZONTAL_DOMINANCE = 1.4;
const WHEEL_INTENT_RESET_DELAY = 120;
const KEYBOARD_EDGE_DISTANCE = 0.03;
const INACTIVE_TAB_OPACITY = 0.25;
const PLAYBACK_NEIGHBOURS = 1;
const DESCRIPTION_FADE_DISTANCE = 0.5;
const DESCRIPTION_TRAVEL = 60;

const POSITION_SPRING = {
  type: "spring",
  stiffness: 90,
  damping: 18.1,
  mass: 0.9,
  restSpeed: 0.0000001,
  restDelta: 0.00000001,
} as const;

const TAB_PRESS_SPRING = {
  type: "spring",
  stiffness: 447.4,
  damping: 42,
  mass: 1,
} as const;

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type CarouselDom = {
  viewport: HTMLDivElement | null;
  track: HTMLDivElement | null;
  tabs: HTMLDivElement | null;
  slides: (HTMLDivElement | null)[];
  tabButtons: (HTMLButtonElement | null)[];
  descriptions: (HTMLParagraphElement | null)[];
  videos: (HTMLVideoElement | null)[];
};

type EngineDeps = {
  dom: RefObject<CarouselDom>;
  slideCount: RefObject<number>;
  setActiveIndex: (index: number) => void;
  setDragging: (dragging: boolean) => void;
};

function snapToDevicePixels(value: number) {
  const pixelRatio = window.devicePixelRatio || 1;
  return Math.round(value * pixelRatio) / pixelRatio;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function createCarouselEngine({ dom, slideCount, setActiveIndex, setDragging }: EngineDeps) {
  const progress = motionValue(0);

  let slideWidth = 0;
  let activeIndex = 0;
  let tabOffsets: number[] = [];
  let reduceMotion = false;

  let isDragging = false;
  let activePointerId: number | null = null;
  let lastPointerX = 0;
  let latestInputDelta = 0;
  let positionAnimation: AnimationPlaybackControlsWithThen | null = null;

  let wheelCanStartGesture = true;
  let isDetectingWheelGesture = false;
  let wheelGestureAxis: "pending" | "horizontal" | "vertical" | null = null;
  let accumulatedWheelX = 0;
  let accumulatedWheelY = 0;
  let wheelEndTimer = 0;
  let wheelRestartTimer = 0;
  let wheelIntentResetTimer = 0;

  let initialKeyPress = true;
  let isKeyboardRubberbanding = false;

  let descriptionScope: { from: number; to: number } | null = null;

  let pressedTabIndex: number | null = null;
  const tabPressAnimations = new Map<number, AnimationPlaybackControlsWithThen>();
  const tabScales = new Map<number, number>();

  function clampIndex(index: number) {
    return Math.max(0, Math.min(index, slideCount.current - 1));
  }

  function calculateTabOffsets() {
    const { tabs } = dom.current;
    if (!tabs) return;

    tabOffsets = Array.from(tabs.children, (child) => {
      const tab = child as HTMLElement;
      return snapToDevicePixels(-(tab.offsetLeft + tab.offsetWidth / 2));
    });
  }

  function interpolateTabPosition(value: number) {
    if (tabOffsets.length === 0) return 0;

    if (value < 0) {
      const distance = (tabOffsets[1] ?? tabOffsets[0]) - tabOffsets[0];
      return tabOffsets[0] + value * distance;
    }

    const lastIndex = tabOffsets.length - 1;
    if (value > lastIndex) {
      const distance = tabOffsets[lastIndex] - (tabOffsets[lastIndex - 1] ?? 0);
      return tabOffsets[lastIndex] + (value - lastIndex) * distance;
    }

    const startIndex = Math.floor(value);
    const endIndex = Math.ceil(value);
    const weight = value - startIndex;

    return tabOffsets[startIndex] + (tabOffsets[endIndex] - tabOffsets[startIndex]) * weight;
  }

  function renderProgress(value: number) {
    const { track, tabs, slides, tabButtons, descriptions } = dom.current;
    if (!track || !tabs || slideWidth === 0) return;

    track.style.transform = `translate3d(${-value * slideWidth}px, 0, 0)`;

    tabs.style.transform = `translateX(${interpolateTabPosition(value)}px)`;

    for (let index = 0; index < slides.length; index += 1) {
      const offset = index - value;
      const distance = Math.abs(offset);
      const slideProgress = 1 - distance;

      const slide = slides[index];
      if (slide) slide.style.opacity = slideProgress > 0 ? "1" : "0";

      const tabButton = tabButtons[index];
      if (tabButton) {
        const clampedSlideProgress = Math.max(0, Math.min(slideProgress, 1));
        tabButton.style.opacity = `${
          INACTIVE_TAB_OPACITY + clampedSlideProgress * (1 - INACTIVE_TAB_OPACITY)
        }`;
      }

      const description = descriptions[index];
      if (description) {
        const inScope =
          !descriptionScope || index === descriptionScope.from || index === descriptionScope.to;
        const fade = inScope ? Math.max(0, 1 - distance / DESCRIPTION_FADE_DISTANCE) : 0;
        description.style.opacity = `${fade}`;
        description.style.transform = `translateX(${offset * DESCRIPTION_TRAVEL}px)`;
      }
    }
  }

  function stopPositionAnimation() {
    positionAnimation?.stop();
    positionAnimation = null;
  }

  function animateProgress(target: number, velocity = progress.getVelocity()) {
    stopPositionAnimation();

    if (reduceMotion) {
      progress.jump(target);
      return;
    }

    positionAnimation = animate(progress, target, { ...POSITION_SPRING, velocity });
  }

  function visibleDescriptionIndex(position: number) {
    const candidates = descriptionScope
      ? [descriptionScope.from, descriptionScope.to]
      : [Math.round(position)];

    let visible: number | null = null;
    let closest = DESCRIPTION_FADE_DISTANCE;

    for (const candidate of candidates) {
      const candidateDistance = Math.abs(candidate - position);
      if (candidateDistance < closest) {
        closest = candidateDistance;
        visible = candidate;
      }
    }

    return visible;
  }

  function goToSlide(index: number, instant = false, velocity?: number) {
    if (slideCount.current === 0) return;

    const nextIndex = clampIndex(index);
    descriptionScope = {
      from: visibleDescriptionIndex(progress.get()) ?? nextIndex,
      to: nextIndex,
    };
    activeIndex = nextIndex;
    setActiveIndex(nextIndex);

    if (instant || reduceMotion) {
      stopPositionAnimation();
      progress.jump(nextIndex);
      return;
    }

    animateProgress(nextIndex, velocity);
  }

  function continueTrackingWithDelta(delta: number) {
    if (slideWidth === 0) return;

    latestInputDelta = delta;
    let progressDelta = delta / -slideWidth;
    const currentPosition = progress.get();
    const nextPosition = currentPosition + progressDelta;

    if (nextPosition < 0 || nextPosition > slideCount.current - 1) {
      progressDelta *= EDGE_RESISTANCE;
    }

    progress.set(currentPosition + progressDelta);
  }

  function endTrackingInputMode(inputMode: "drag" | "desktop-scroll") {
    if (slideWidth === 0) return;

    const currentPosition = progress.get();
    const startPosition = activeIndex;
    const positionDelta = currentPosition - startPosition;
    const swipingTowardsCurrentPage =
      (positionDelta > 0 && latestInputDelta > 0) || (positionDelta < 0 && latestInputDelta < 0);
    const passedVelocityTolerance = Math.abs(latestInputDelta) > DRAG_VELOCITY_TOLERANCE;
    const passedDistanceTolerance =
      inputMode === "desktop-scroll" || Math.abs(positionDelta) > DRAG_DISTANCE_TOLERANCE;
    const shouldAdvance =
      (passedDistanceTolerance || passedVelocityTolerance) && !swipingTowardsCurrentPage;
    const directionIsForward = latestInputDelta <= 0;

    let targetIndex = startPosition;
    if (shouldAdvance) {
      if (currentPosition === startPosition) {
        targetIndex = directionIsForward ? currentPosition + 1 : currentPosition - 1;
      } else {
        targetIndex = directionIsForward ? Math.ceil(currentPosition) : Math.floor(currentPosition);
      }
    }

    const releaseVelocity = (latestInputDelta / -slideWidth) * 30;
    goToSlide(targetIndex, false, releaseVelocity);
    latestInputDelta = 0;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const { viewport } = dom.current;
    if (!viewport || event.button !== 0 || activePointerId !== null || slideWidth === 0) return;

    activePointerId = event.pointerId;
    isDragging = true;
    setDragging(true);
    descriptionScope = null;
    lastPointerX = event.clientX;
    latestInputDelta = 0;
    stopPositionAnimation();
    viewport.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isDragging || event.pointerId !== activePointerId) return;

    const delta = event.clientX - lastPointerX;
    lastPointerX = event.clientX;
    continueTrackingWithDelta(delta);
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const { viewport } = dom.current;
    if (!isDragging || event.pointerId !== activePointerId) return;

    if (viewport?.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }

    isDragging = false;
    setDragging(false);
    activePointerId = null;
    endTrackingInputMode("drag");
  }

  function wheelDeltasInPixels(event: WheelEvent) {
    const { viewport } = dom.current;

    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      return { x: event.deltaX * 16, y: event.deltaY * 16 };
    }

    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE && viewport) {
      return { x: event.deltaX * viewport.clientWidth, y: event.deltaY * viewport.clientHeight };
    }

    return { x: event.deltaX, y: event.deltaY };
  }

  function resetWheelIntent() {
    window.clearTimeout(wheelIntentResetTimer);
    wheelGestureAxis = null;
    accumulatedWheelX = 0;
    accumulatedWheelY = 0;
  }

  function scheduleWheelIntentReset() {
    window.clearTimeout(wheelIntentResetTimer);
    wheelIntentResetTimer = window.setTimeout(resetWheelIntent, WHEEL_INTENT_RESET_DELAY);
  }

  function startHorizontalWheelGesture() {
    wheelGestureAxis = "horizontal";
    wheelCanStartGesture = false;
    isDetectingWheelGesture = true;
    descriptionScope = null;
    window.clearTimeout(wheelIntentResetTimer);
    stopPositionAnimation();

    wheelEndTimer = window.setTimeout(() => {
      isDetectingWheelGesture = false;
      endTrackingInputMode("desktop-scroll");

      wheelRestartTimer = window.setTimeout(() => {
        wheelCanStartGesture = true;
        resetWheelIntent();
      }, WHEEL_RESTART_DELAY);
    }, WHEEL_GESTURE_DURATION);
  }

  function handleWheel(event: WheelEvent) {
    const { x: horizontalDelta, y: verticalDelta } = wheelDeltasInPixels(event);
    if (horizontalDelta === 0 && verticalDelta === 0) return;

    if (wheelGestureAxis === "horizontal") {
      event.preventDefault();
      if (isDetectingWheelGesture && horizontalDelta !== 0) {
        continueTrackingWithDelta(-horizontalDelta * WHEEL_SLIP);
      }
      return;
    }

    if (!wheelCanStartGesture) return;

    if (wheelGestureAxis === "vertical") {
      scheduleWheelIntentReset();
      return;
    }

    wheelGestureAxis = "pending";
    accumulatedWheelX += Math.abs(horizontalDelta);
    accumulatedWheelY += Math.abs(verticalDelta);
    scheduleWheelIntentReset();

    if (Math.max(accumulatedWheelX, accumulatedWheelY) < WHEEL_INTENT_THRESHOLD) return;

    if (accumulatedWheelY >= accumulatedWheelX) {
      wheelGestureAxis = "vertical";
      return;
    }

    if (accumulatedWheelX < accumulatedWheelY * WHEEL_HORIZONTAL_DOMINANCE) return;

    event.preventDefault();
    startHorizontalWheelGesture();
    continueTrackingWithDelta(-horizontalDelta * WHEEL_SLIP);
  }

  function focusActiveTab() {
    requestAnimationFrame(() => dom.current.tabButtons[activeIndex]?.focus());
  }

  function handleDocumentKeydown(event: KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (isEditableTarget(event.target)) return;

    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const positionTolerance = 0.001;
    const currentPosition = progress.get();
    const atBoundary =
      direction < 0
        ? currentPosition < positionTolerance
        : currentPosition > slideCount.current - 1 - positionTolerance;

    if (atBoundary && initialKeyPress) {
      isKeyboardRubberbanding = true;
      if (!reduceMotion) animateProgress(currentPosition + direction * KEYBOARD_EDGE_DISTANCE);
    } else if (!atBoundary) {
      isKeyboardRubberbanding = false;
      const cameFromTab =
        event.target instanceof HTMLElement && event.target.getAttribute("role") === "tab";
      goToSlide(activeIndex + direction);
      if (cameFromTab) focusActiveTab();
    }

    initialKeyPress = false;
  }

  function handleDocumentKeyup(event: KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    if (isKeyboardRubberbanding) goToSlide(activeIndex);

    isKeyboardRubberbanding = false;
    initialKeyPress = true;
  }

  function animateTabPress(index: number, pressed: boolean) {
    const button = dom.current.tabButtons[index];
    if (!button) return;

    tabPressAnimations.get(index)?.stop();
    const targetScale = pressed ? 0.92 : 1;

    if (reduceMotion) {
      tabScales.set(index, targetScale);
      button.style.transform = `scale(${targetScale})`;
      return;
    }

    const currentScale = tabScales.get(index) ?? 1;
    tabPressAnimations.set(
      index,
      animate(currentScale, targetScale, {
        ...TAB_PRESS_SPRING,
        onUpdate: (scale) => {
          tabScales.set(index, scale);
          button.style.transform = `scale(${scale})`;
        },
      }),
    );
  }

  function handleTabPointerDown(index: number) {
    pressedTabIndex = index;
    animateTabPress(index, true);
  }

  function handleTabPointerEnter(index: number, buttons: number) {
    if (pressedTabIndex === index && buttons === 1) animateTabPress(index, true);
  }

  function handleTabPointerLeave(index: number) {
    if (pressedTabIndex === index) animateTabPress(index, false);
  }

  function handleTabPointerEnd(index: number) {
    if (pressedTabIndex !== index) return;
    pressedTabIndex = null;
    animateTabPress(index, false);
  }

  function releasePressedTab() {
    if (pressedTabIndex === null) return;

    const index = pressedTabIndex;
    pressedTabIndex = null;
    animateTabPress(index, false);
  }

  function measureAndAlign() {
    const { viewport, tabs } = dom.current;
    if (!viewport || !tabs) return;

    slideWidth = viewport.clientWidth;
    if (slideWidth === 0) return;

    calculateTabOffsets();
    tabs.style.visibility = "visible";
    goToSlide(activeIndex, true);
    renderProgress(activeIndex);
  }

  function mount() {
    const { viewport, tabs } = dom.current;
    if (!viewport || !tabs) return () => {};

    reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const unsubscribeProgress = progress.on("change", renderProgress);
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    document.addEventListener("keydown", handleDocumentKeydown);
    document.addEventListener("keyup", handleDocumentKeyup);
    document.addEventListener("pointerup", releasePressedTab);
    document.addEventListener("pointercancel", releasePressedTab);

    measureAndAlign();

    const resizeObserver = new ResizeObserver(measureAndAlign);
    resizeObserver.observe(viewport);
    resizeObserver.observe(tabs);

    let unmounted = false;
    void document.fonts.ready.then(() => {
      if (!unmounted) measureAndAlign();
    });

    return () => {
      unmounted = true;
      stopPositionAnimation();
      for (const animation of tabPressAnimations.values()) animation.stop();
      tabPressAnimations.clear();
      tabScales.clear();
      unsubscribeProgress();
      resizeObserver.disconnect();
      viewport.removeEventListener("wheel", handleWheel);
      document.removeEventListener("keydown", handleDocumentKeydown);
      document.removeEventListener("keyup", handleDocumentKeyup);
      document.removeEventListener("pointerup", releasePressedTab);
      document.removeEventListener("pointercancel", releasePressedTab);
      window.clearTimeout(wheelEndTimer);
      window.clearTimeout(wheelRestartTimer);
      window.clearTimeout(wheelIntentResetTimer);
    };
  }

  return {
    mount,
    goToSlide,
    handlePointerDown,
    handlePointerMove,
    handlePointerEnd,
    handleTabPointerDown,
    handleTabPointerEnter,
    handleTabPointerLeave,
    handleTabPointerEnd,
  };
}

export function Carousel({ slides, label = "Kami product demos" }: CarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const slideId = useId();

  const dom = useRef<CarouselDom>({
    viewport: null,
    track: null,
    tabs: null,
    slides: [],
    tabButtons: [],
    descriptions: [],
    videos: [],
  });
  const slideCount = useRef(slides.length);

  const engineRef = useRef<ReturnType<typeof createCarouselEngine> | null>(null);
  engineRef.current ??= createCarouselEngine({
    dom,
    slideCount,
    setActiveIndex,
    setDragging: setIsDragging,
  });
  const engine = engineRef.current;

  useEffect(() => {
    slideCount.current = slides.length;
  }, [slides.length]);

  useIsomorphicLayoutEffect(() => engine.mount(), [engine]);

  useEffect(() => {
    dom.current.videos.forEach((video, index) => {
      if (!video) return;

      if (Math.abs(index - activeIndex) <= PLAYBACK_NEIGHBOURS) {
        void video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, [activeIndex]);

  return (
    <div className="carousel">
      <div
        ref={(el) => {
          dom.current.viewport = el;
        }}
        className={`carousel-viewport${isDragging ? " is-dragging" : ""}`}
        role="slider"
        aria-label={label}
        aria-roledescription="carousel"
        aria-valuemin={1}
        aria-valuemax={slides.length}
        aria-valuenow={activeIndex + 1}
        aria-valuetext={slides[activeIndex]?.tab}
        tabIndex={0}
        onPointerDown={engine.handlePointerDown}
        onPointerMove={engine.handlePointerMove}
        onPointerUp={engine.handlePointerEnd}
        onPointerCancel={engine.handlePointerEnd}
      >
        <div
          ref={(el) => {
            dom.current.track = el;
          }}
          className="carousel-track"
        >
          {slides.map((slide, index) => (
            <div
              key={index}
              ref={(el) => {
                dom.current.slides[index] = el;
              }}
              id={`${slideId}-${index}`}
              className="carousel-slide"
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${slides.length}: ${slide.tab}`}
              aria-hidden={index !== activeIndex}
            >
              <video
                ref={(el) => {
                  dom.current.videos[index] = el;
                }}
                src={slide.src}
                aria-label={slide.tab}
                autoPlay={index === 0}
                loop
                muted
                playsInline
              />
            </div>
          ))}
        </div>
      </div>

      <div className="carousel-tabs-viewport">
        <div
          ref={(el) => {
            dom.current.tabs = el;
          }}
          className="carousel-tabs"
          role="tablist"
          aria-label="Choose a slide"
        >
          {slides.map((slide, index) => (
            <button
              key={index}
              ref={(el) => {
                dom.current.tabButtons[index] = el;
              }}
              type="button"
              role="tab"
              className="capsized-md carousel-tab"
              aria-selected={index === activeIndex}
              aria-controls={`${slideId}-${index}`}
              tabIndex={index === activeIndex ? 0 : -1}
              onClick={() => engine.goToSlide(index, false, 0)}
              onPointerDown={() => engine.handleTabPointerDown(index)}
              onPointerEnter={(event) => engine.handleTabPointerEnter(index, event.buttons)}
              onPointerLeave={() => engine.handleTabPointerLeave(index)}
              onPointerUp={() => engine.handleTabPointerEnd(index)}
              onPointerCancel={() => engine.handleTabPointerEnd(index)}
            >
              {slide.tab}
            </button>
          ))}
        </div>
      </div>

      <div className="carousel-descriptions">
        {slides.map((slide, index) => (
          <p
            key={index}
            ref={(el) => {
              dom.current.descriptions[index] = el;
            }}
            className="capsized-p carousel-description"
            aria-hidden={index !== activeIndex}
          >
            {slide.description}
          </p>
        ))}
      </div>

      <p className="carousel-status" aria-live="polite" aria-atomic="true">
        {slides[activeIndex]?.tab}, slide {activeIndex + 1} of {slides.length}
      </p>
    </div>
  );
}
