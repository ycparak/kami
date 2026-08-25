/// <reference types="vite/client" />

import type { ReactNode } from "react";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";

import styles from "../styles.css?url";
import reset from "../reset.css?url";

const TITLE = "Kami — A fast and lightweight markdown editor";
const DESCRIPTION =
  "A free, fast and lightweight editor application for people who value privacy and speed.";
const OG_DESCRIPTION =
  "A free, fast and lightweight markdown editor for people who value privacy and speed.";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Kami" },
      { property: "og:description", content: OG_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://kami.yusufparak.com" },
      { property: "og:image", content: "https://kami.yusufparak.com/og.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://kami.yusufparak.com/og.jpg" },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "stylesheet", href: reset },
      { rel: "stylesheet", href: styles },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
