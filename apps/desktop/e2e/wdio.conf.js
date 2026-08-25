import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const APP_BINARY = resolve(
  __dirname,
  "../src-tauri/target/release/bundle/macos/Kami.app/Contents/MacOS/desktop",
);

let proxy;

export const config = {
  runner: "local",
  specs: ["./specs/**/*.spec.js"],
  maxInstances: 1,
  capabilities: [
    {
      "tauri:options": {
        application: APP_BINARY,
      },
    },
  ],
  hostname: "127.0.0.1",
  port: 4444,
  path: "/",
  framework: "mocha",
  reporters: ["spec"],
  logLevel: "warn",
  waitforTimeout: 15_000,
  connectionRetryTimeout: 30_000,
  connectionRetryCount: 0,
  mochaOpts: {
    ui: "bdd",
    timeout: 60_000,
  },

  onPrepare: async function () {
    if (!existsSync(APP_BINARY)) {
      throw new Error(
        `App binary not found at ${APP_BINARY}\n` +
          "Run `pnpm run build:app` first (or use `pnpm run test:e2e`).",
      );
    }

    proxy = spawn("tauri-webdriver", [], { stdio: "inherit" });
    proxy.on("error", (err) => {
      if (err.code === "ENOENT") {
        console.error(
          "tauri-webdriver not found on PATH.\n" +
            "Install once with: cargo install tauri-webdriver --locked",
        );
      }
    });

    await new Promise((r) => setTimeout(r, 1500));
  },

  onComplete: async function () {
    if (proxy && !proxy.killed) {
      const exited = new Promise((r) => proxy.once("exit", r));
      proxy.kill("SIGTERM");
      await exited;
    }
  },
};
