# E2E tests

End-to-end tests for the Kami desktop app, driven via WebdriverIO and the
[Choochmeque/tauri-webdriver](https://github.com/Choochmeque/tauri-webdriver)
plugin (the only viable WebDriver path for Tauri v2 on macOS as of April 2026 —
official `tauri-driver` does not support macOS, see
[tauri-apps/tauri#7068](https://github.com/tauri-apps/tauri/issues/7068)).

This setup is **experimental**. The plugin is early-stage; expect rough edges.

## One-time setup

Install the WebDriver intermediary CLI globally:

```sh
cargo install tauri-webdriver --locked
```

Install JS deps from the repo root:

```sh
vp install
```

## Running

From `apps/desktop/e2e/`:

```sh
pnpm run test:e2e
```

This builds the app with `--features e2e` (which embeds the WebDriver server)
and then runs the smoke spec. The first build is slow; incremental rebuilds
are fast.

> The e2e build uses an isolated bundle identifier (`com.kami.e2e`)
> so it does NOT collide with `tauri-plugin-single-instance` from a Kami
> dev or release instance running in another worktree. You can leave your
> normal Kami running.

## What gets tested

`specs/smoke.spec.js` contains two specs:

1. **`mounts the React app`** — waits for the React top-level wrapper
   (`<div class="animate-fade-in">`, present in both the welcome and editor
   branches) to mount. Validates that the WKWebView loads and React renders.

2. **`creates a file and writes hello world via the Tauri IPC bridge`** —
   creates a fresh temp directory on the host, then drives the real Rust IPC
   commands (`create_file`, `write_file`) from inside the WKWebView via
   `window.__TAURI_INTERNALS__.invoke`, and asserts the bytes hit disk.
   Validates JS → IPC bridge → Rust command handler → filesystem end-to-end.
   The temp dir is removed on teardown so no host state leaks between runs.

The point is infrastructure validation, not feature coverage. Both specs are
independent of any restored workspace because the e2e build uses an isolated
bundle identifier (see below).

## How it works

1. `pnpm run build:app` produces `Kami.app` with the `e2e` Cargo feature,
   which includes `tauri-plugin-webdriver` (an embedded HTTP WebDriver server).
2. `wdio.conf.js` (`onPrepare`) spawns the `tauri-webdriver` intermediary CLI
   on port 4444.
3. WebdriverIO connects to 4444; the intermediary launches `Kami.app` and
   proxies WebDriver commands to the embedded server.
4. The spec runs; afterwards `onComplete` kills the intermediary and the app
   quits.

## Build flavors

- `vp run desktop#dev` and `vp build` are unchanged — no WebDriver server.
- The e2e build invokes
  `cargo tauri build --features e2e --bundles app --config '{"identifier":"com.kami.e2e","bundle":{"createUpdaterArtifacts":false}}'`.
  The overrides:
  - `--bundles app` skips DMG creation.
  - `createUpdaterArtifacts: false` skips updater artifact signing (which
    would otherwise demand `TAURI_SIGNING_PRIVATE_KEY`).
  - `identifier: "com.kami.e2e"` gives the e2e build its own
    `tauri-plugin-single-instance` namespace and its own app data dir
    (`~/Library/Application Support/com.kami.e2e/`). Without this,
    a Kami dev/release instance running in another worktree would intercept
    the launch and the WebDriver plugin would never start.
- **Never enable `--features e2e` for releases shipped to users** — it opens
  an HTTP server on localhost:4445.

## Troubleshooting

- **`ENOENT: tauri-webdriver`** — run `cargo install tauri-webdriver --locked`.
- **Port 4444/4445 in use** — a previous run did not clean up.
  `pkill -f tauri-webdriver` and retry.
- **App binary not found** — run `pnpm run build:app` first (or use
  `pnpm run test:e2e` which chains them).
- **Test hangs at `waitForDisplayed`** — the WKWebView likely did not load.
  Sanity-check that `vp run desktop#dev` still launches the app normally.

## Shared setup helpers

`helpers/workspace.js` owns the "get the app into a usable state" steps that most specs
need. Prefer it over a per-spec copy:

- `invoke(cmd, args)` — call a Tauri command and throw on failure.
- `waitForMount()` — wait for the sidebar toggle. Matches **both** `Hide sidebar` and
  `Show sidebar`: the sidebar's collapsed state is persisted, so a spec that keys off one
  label breaks as soon as another spec leaves it the other way.
- `ensureWorkspace()` — the toggle also renders in the empty state, so its presence does
  **not** mean a workspace is open. This opens one (`open_workspace` is idempotent) and
  waits for the file tree.
- `ensureOneOpenFile()` — `Cmd-T` is inert while no tab is open, so panes cannot be
  bootstrapped by keyboard from an empty session. Opens one file first.
- `closeAllTabs()` — reset the tab list through the palette's **Close All Tabs** command.

## Match tree paths exactly

`[data-tree-path$="/README.md"]` also matches `apps/desktop/e2e/README.md`, so a suffix
match opens whichever row the tree happens to render first. Build the selector from
`E2E_WORKSPACE` and compare the full path.

## Specs must restore persisted state

The app profile (`com.kami.e2e`) survives between runs, so anything a spec persists leaks
into whichever spec runs first next time — including into the _next_ run of the suite.
`empty-state` and `window-inactive` both seed an empty `sessions.json`, and
`window-inactive` also collapses the sidebar; both save and restore what they found in an
`after` hook. Do the same for any new spec that writes persisted state.
