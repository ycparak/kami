import { createFileRoute } from "@tanstack/react-router";
import { Carousel, type CarouselSlide } from "../components/Carousel";
import { AppleGlyph } from "../components/Icons";

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
    src: "/videos/06.webp",
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
