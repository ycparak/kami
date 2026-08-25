import { createFileRoute } from "@tanstack/react-router";
import { Carousel, type CarouselSlide } from "../components/Carousel";
import { AppleGlyph } from "../components/Icons";

const DEMO_TABS = [
  "Writing",
  "Panes",
  "Search",
  "Frontmatter",
  "Math & Diagrams",
  "Tables",
  "Images",
  "Workspaces",
];

const DEMO_DESCRIPTIONS = [
  "All your documents live in your computer",
  "Open notes side by side in one scrollable row",
  "Find any note in your workspace instantly",
  "YAML metadata support built-in",
  "Mermaid charts and LaTeX render as you type",
  "Write tables in markdown, read them formatted",
  "Drop an image in and it is saved alongside",
  "Snappy switch between multiple workspaces",
];

const SLIDES: CarouselSlide[] = DEMO_TABS.map((tab, index) => ({
  src: "/videos/00.mp4",
  tab,
  description: DEMO_DESCRIPTIONS[index],
}));

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <main>
      <section className="hero">
        <div className="space-35"></div>
        <img className="logo" alt="Logo" src="/images/logo.webp" />
        <h1 className="capsized-h1">Markdown, Without the Noise.</h1>
        <p className="capsized-p">
          Kami is a fast, lightweight and local markdown editor built for people who value privacy
          and speed. It works offline, weighs under 10mb, is open source and completely free.
        </p>
        <div className="cta">
          <a
            className="download capsized-p"
            href={__KAMI_DMG_URL__}
            data-umami-event="Download macOS app"
            data-umami-event-version={__KAMI_VERSION__}
          >
            <AppleGlyph size={22} />
            <span>Download for MacOS</span>
          </a>
          <a
            className="github capsized-p"
            href={__KAMI_REPO_URL__}
            target="_blank"
            rel="noopener noreferrer"
            data-umami-event="Open GitHub"
          >
            <span>Github</span>
          </a>
        </div>
      </section>

      <section
        className="prototype"
        style={{ background: "url(/images/bg.webp) center / cover no-repeat" }}
      >
        <Carousel slides={SLIDES} />
      </section>

      <footer>
        <img className="logo" alt="Logo" src="/images/logo.webp" />
      </footer>
    </main>
  );
}
