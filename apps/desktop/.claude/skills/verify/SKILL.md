---
name: verify
description: Build, launch, and drive the Kami desktop app to verify a change end-to-end via the WebDriver e2e harness. Use when a change to apps/desktop needs runtime verification (GUI surface).
---

# Verifying Kami desktop changes

The surface is a macOS Tauri GUI. Drive it through the repo's WebdriverIO +
tauri-webdriver harness in `apps/desktop/e2e/` (see its README for one-time
setup: `cargo install tauri-webdriver --locked`).

## Build

```sh
cd apps/desktop/src-tauri
cargo tauri build --features e2e --bundles app --ignore-version-mismatches \
  --config '{"identifier":"com.kami.e2e","bundle":{"createUpdaterArtifacts":false}}'
```

Gotchas:

- `--ignore-version-mismatches` is required while the npm `@tauri-apps/*`
  packages lag the Rust crates; without it the CLI hard-errors before
  building.
- The bundle lands at
  `src-tauri/target/release/bundle/macos/Kami.app/Contents/MacOS/desktop`
  (binary keeps the crate name). Incremental rebuilds are fast; the first
  build is slow.
- Rebuild after every frontend change too — the app ships the built assets.

## Launch state

The e2e app uses its own data dir:
`~/Library/Application Support/com.kami.e2e`. Fresh dir → welcome
screen (workspace opens need a native dialog you cannot drive). To land in a
workspace, seed before launch:

```sh
printf '["/abs/path/to/workspace-dir"]' > \
  "$HOME/Library/Application Support/com.kami.e2e/recent_workspaces.json"
```

Startup restores `recent_workspaces[0]` when it is a directory. Wipe the data
dir between runs for deterministic settings.

## Drive

```sh
cd apps/desktop/e2e
pnpm exec wdio run ./wdio.conf.js --spec ./specs/<your>.spec.js
```

- Wait for `button[aria-label="Hide sidebar"]` to detect mount+restore. Do
  NOT wait for `.animate-fade-in` — that wrapper no longer exists (the smoke
  spec still references it and fails; known rot).
- Key chords through the driver are flaky on WKWebView; dispatch synthetic
  `KeyboardEvent`s via `browser.execute` instead (Cmd+P opens the palette;
  palette items are `[cmdk-item][data-value="<command-id>"]`).
- `setValue` on empty inputs can throw in the driver's `clear` step — use
  `addValue`.
- Real Rust IPC is reachable via
  `window.__TAURI_INTERNALS__.invoke(cmd, args)` inside
  `browser.executeAsync` (see `specs/smoke.spec.js`).
- Screenshots: `browser.saveScreenshot(absPath)`.
- `specs/font-picker.spec.js` self-skips when no workspace restored; it's a
  working example of palette → settings → popover driving.
