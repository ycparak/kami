import { createFileRoute } from "@tanstack/react-router";
import { type AnimationPlaybackControlsWithThen, animate, stagger } from "motion";
import { useEffect, useRef, useState } from "react";
import { Carousel, type CarouselSlide } from "../components/Carousel";
import { AppleGlyph } from "../components/Icons";

const HERO_STAGGER = 0.08;
const HERO_DURATION = 0.5;
const BG_FADE_DURATION = 1.2;

const SLIDES: CarouselSlide[] = [
  {
    tab: "Fast & Private",
    description: "All your documents live on your computer",
    src: "/demo/01.mp4",
  },
  {
    tab: "Column Support",
    description: "Open notes side by side in one scrollable row",
    src: "/demo/02.mp4",
  },
  {
    tab: "Search",
    description: "Find any note in your workspace instantly",
    src: "/demo/03.mp4",
  },
  {
    tab: "Extended Markdown",
    description: "Mermaid charts, LaTeX, tables and HTML rendered beautifully",
    src: "/demo/04.mp4",
  },
  {
    tab: "Frontmatter",
    description: "YAML metadata support built-in",
    src: "/demo/05.mp4",
  },
  {
    tab: "Workspaces",
    description: "Switch between multiple workspaces",
    src: "/demo/06.webp",
    type: "image",
  },
  {
    tab: "Customisable",
    description: "Customise the look and feel of your workspace",
    src: "/demo/07.mp4",
  },
];

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const heroRef = useRef<HTMLElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const [heroRevealed, setHeroRevealed] = useState(false);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;

    const items = Array.from(hero.querySelectorAll<HTMLElement>(".reveal"));
    if (items.length === 0) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cancelled = false;
    let controls: AnimationPlaybackControlsWithThen | null = null;
    // A timer, not the animation's own promise: a backgrounded tab can stall
    // requestAnimationFrame-driven animations indefinitely, which would
    // otherwise leave the carousel waiting on the hero forever.
    let doneTimer = 0;

    function reveal() {
      if (cancelled) return;

      if (reduceMotion) {
        for (const item of items) {
          item.style.opacity = "1";
          item.style.transform = "none";
        }
        setHeroRevealed(true);
        return;
      }

      controls = animate(
        items,
        { opacity: [0, 1], transform: ["translateY(10px)", "translateY(0)"] },
        { duration: HERO_DURATION, delay: stagger(HERO_STAGGER), ease: [0.16, 1, 0.3, 1] },
      );

      const heroDuration = (items.length - 1) * HERO_STAGGER + HERO_DURATION;
      doneTimer = window.setTimeout(() => {
        if (!cancelled) setHeroRevealed(true);
      }, heroDuration * 1000);
    }

    void document.fonts.ready.then(reveal);

    return () => {
      cancelled = true;
      controls?.stop();
      window.clearTimeout(doneTimer);
    };
  }, []);

  useEffect(() => {
    const bg = bgRef.current;
    if (!bg) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      bg.style.opacity = "1";
      return;
    }

    const controls = animate(bg, { opacity: [0, 1] }, { duration: BG_FADE_DURATION });
    return () => controls.stop();
  }, []);

  return (
    <main>
      <section className="hero" ref={heroRef}>
        <div className="space-35"></div>
        <img className="logo reveal" alt="Logo" src="/images/logo.webp" />
        <h1 className="capsized-h1 reveal">Markdown, Without the Noise.</h1>
        <p className="capsized-p reveal">
          Kami is a fast, lightweight and local markdown editor built for people who value privacy
          and speed. It works offline, weighs under 15mb, is open source and completely free.
        </p>
        <div className="cta">
          <a
            className="download capsized-p reveal"
            href={__KAMI_DMG_URL__}
            data-umami-event="Download macOS app"
            data-umami-event-version={__KAMI_VERSION__}
          >
            <AppleGlyph size={22} />
            <span>Download for MacOS</span>
          </a>
          <a
            className="github capsized-p reveal"
            href={__KAMI_REPO_URL__}
            target="_blank"
            rel="noopener noreferrer"
            data-umami-event="Open GitHub"
          >
            <span>Github</span>
          </a>
        </div>
      </section>

      <section className="prototype">
        <div className="prototype-bg" ref={bgRef} />
        <Carousel slides={SLIDES} readyToReveal={heroRevealed} />
      </section>

      <footer>
        <img className="logo" alt="Logo" src="/images/logo.webp" />
      </footer>
    </main>
  );
}
