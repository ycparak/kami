import { createFileRoute } from "@tanstack/react-router";
import { Carousel, type CarouselSlide } from "../components/Carousel";
import { AppleGlyph } from "../components/Icons";

const DEMO_TABS = [
  "Fast & Private",
  "Column Support",
  "Search",
  "Extended Markdown",
  "Frontmatter",
  "Workspaces",
  "Customisable",
];

const DEMO_DESCRIPTIONS = [
  "All your documents live on your computer",
  "Open notes side by side in one scrollable row",
  "Find any note in your workspace instantly",
  "Mermaid charts, LaTeX, tables and HTML rendered beautifully",
  "YAML metadata support built-in",
  "Switch between multiple workspaces",
  "Customise the look and feel of your workspace",
];

const SLIDES: CarouselSlide[] = DEMO_TABS.map((tab, index) => ({
  src: "/videos/01.mp4",
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
