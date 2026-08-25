# Kami Open Flows

How files and folders reach the editor from every entry point.

There are **two distinct open mechanisms**, deliberately kept separate:

- **`startup_open`** — a single `Option<PendingOpenPayload>` seeded in Rust
  before `get_startup_state` reads it. For new windows this happens during
  window creation; for macOS cold-start `RunEvent::Opened`, it can happen while
  the main webview exists but is still hidden and unhydrated. Read exactly once
  during startup hydration. Same lifecycle as settings: set before first render,
  consumed during the first render.
- **`pending_open`** — a per-window queue for runtime drag-and-drop / dock drops
  onto an _already-running_ window. Drained by the frontend via the
  `open:from-drop` event + `take_pending_open` IPC.

Both feed the single `get_startup_state` IPC (for startup) or the
`restoreFromBundle` path, so React's first render already has full content.

## Path Resolution (shared)

Every entry point funnels through `open_target::classify()`:

```
Input path
  ├─ is_dir?    → { workspace: canonicalize(path),   file: None }
  ├─ is_file?
  │   └─ .md/.markdown (case-insensitive)?
  │       → { workspace: canonicalize(parent), file: canonicalize(path) }
  └─ otherwise  → None (lenient) / Error (strict CLI)
```

## 1. Cold Start (`kami .`, Finder open, dock drop while not running)

The `kami` symlink invokes the same binary as the GUI app. `main.rs`
dispatches on argv\[0\]: basename `kami` → CLI launcher, `Kami` → Tauri app.

On macOS the open target is **not** delivered through argv — `open -a Kami
/path` (which the CLI launcher, Finder, and dock all use) delivers it via the
`RunEvent::Opened` system event. That event can fire before `setup()` builds the
main window or after Tauri has built the still-hidden webview but before React
calls `get_startup_state`. In either case the handler seeds `startup_open` as
long as that startup slot has not been read yet. The webview then reads it
during hydration — a single window, no duplicate.

```mermaid
sequenceDiagram
    participant OS as macOS (open -a)
    participant Run as Tauri run loop
    participant State as AppState (main)
    participant WV as Main WebviewWindow
    participant React as React (useOpenDrop)
    participant IPC as get_startup_state

    OS->>Run: RunEvent::Opened { urls: [file:///path] }
    Run->>Run: resolve_path(url)
    Run->>State: find_by_workspace(path) → None
    Note over Run: Main startup slot unread →<br/>cold start. Seed startup_open.
    Run->>State: get_or_create("main").try_set_startup_open(payload)

    Note over WV: setup() builds the window,<br/>get_or_create("main") returns the<br/>same state with startup_open set
    WV->>React: WebView loads, React mounts
    React->>React: useOpenDrop → resolveStartup()
    React->>IPC: get_startup_state()
    IPC->>State: take_startup_open() → Some(payload)
    IPC->>IPC: build_restore_bundle(payload.workspace)
    Note over IPC: Strip session + active_file,<br/>set open_file = payload.file
    IPC-->>React: { settings, recents, restore_bundle }
    React->>React: restoreFromBundle(bundle)
    Note over React: open_file set → open just that file,<br/>no previous-session tabs
    React->>React: setStartupResolved() → show window
```

On Linux/Windows the path arrives through argv instead; `setup()` reads
`std::env::args()[1]` and calls `set_startup_open` directly (gated behind
`#[cfg(not(target_os = "macos"))]`).

## 2. Runtime Drag-and-Drop onto a Window

When the app is already running and the user drops a file/folder onto a window,
the per-window `pending_open` queue + `open:from-drop` event carry it. This path
never touches `startup_open`.

```mermaid
sequenceDiagram
    participant User
    participant WV as WebviewWindow
    participant Rust as Tauri (lib.rs)
    participant State as WorkspaceState
    participant React as React (useOpenDrop)
    participant Store as Zustand Stores

    User->>WV: Drag folder/file onto window
    WV->>Rust: WindowEvent::DragDrop { paths }
    loop First valid path in drop
        Rust->>Rust: resolve_path(path)
        Note over Rust: Lenient: skip non-dir / non-.md
    end
    Rust->>State: push_pending_open(payload)  (runtime queue)
    Rust->>WV: emit_to(label, "open:from-drop", payload)

    React->>React: listen("open:from-drop") fires
    React->>React: await startupReady, then drainPendingOpens()
    React->>Rust: IPC: take_pending_open()
    Rust->>State: pop_pending_open()
    Rust-->>React: PendingOpenPayload

    alt Same workspace as current window
        React->>Store: openFile(payload.file) if present
    else Different workspace
        React->>Rust: IPC: open_workspace_in_new_window()
        Note over Rust: New window seeded via startup_open
    end
```

## 3. Dock Drop / Finder Open While Running

Dragging onto the dock icon (or double-clicking a `.md` in Finder via the
`fileAssociations` registration) fires `RunEvent::Opened`. The handler routes by
whether a window already hosts the workspace, whether the main startup slot is
still unread, and whether the main window is already visible.

```mermaid
sequenceDiagram
    participant OS as macOS
    participant Run as Tauri run loop
    participant State as AppState
    participant WV as Existing Window
    participant NewWV as New Window

    OS->>Run: RunEvent::Opened { urls: [file:///path] }
    Run->>Run: resolve_path(url)
    Run->>State: find_by_workspace(canonical_path)

    alt A window already hosts this workspace
        State-->>Run: Some(label)
        Run->>State: push_pending_open(payload)  (runtime queue)
        Run->>WV: emit_to(label, "open:from-drop")
        Note over WV: Drains queue, focuses,<br/>opens file if specified
    else No window hosts it and main startup slot unread
        State-->>Run: None
        Run->>State: try_set_startup_open(payload) → Ok
        Note over WV: Hidden main hydrates onto<br/>requested workspace
    else No window hosts it and main hidden
        State-->>Run: None
        Run->>State: push_pending_open(payload)
        Run->>WV: emit_to("main", "open:from-drop")
        Note over WV: Startup drainer runs after<br/>hydration completes
    else No window hosts it and main visible
        State-->>Run: None
        Note over Run: Warm start → preserve<br/>current editor state
        Run->>NewWV: open_new_workspace_window(workspace, file)
        Note over NewWV: New window seeded via<br/>startup_open, hydrates on load
    end
```

The cold-start branch of this same handler is covered in flow 1 — it seeds the
main window while `startup_open` is still readable instead of spawning a new one.

## 4. Second Launch (Single-Instance Plugin)

When Kami is already running and the user runs `kami .` again, the OS hands
the second process's argv to the existing process via
`tauri-plugin-single-instance`.

```mermaid
sequenceDiagram
    participant Shell
    participant OS as macOS (open -a)
    participant Plugin as single-instance plugin
    participant Rust as Tauri (existing process)
    participant NewWV as New Window
    participant WV as Existing Window

    Shell->>OS: kami ~/docs → open -a Kami ~/docs
    OS->>Plugin: 2nd process argv intercepted
    Plugin->>Rust: handle_single_instance(argv)
    Rust->>Rust: resolve_path(argv[1])

    alt Path resolves
        Rust->>NewWV: open_new_workspace_window(workspace, file)
        Note over NewWV: Focuses existing window if that<br/>workspace is already open
    else No path argument
        Rust->>WV: set_focus() on "main" window
    end
```

## 5. New Window (`open_new_workspace_window`)

Every secondary window — whether opened from the frontend
(`open_workspace_in_new_window`), the single-instance plugin, or a warm dock
drop — is seeded the same way: a fresh `WorkspaceState` is created, its
`startup_open` is set, and the window's webview reads it through the same
`get_startup_state` path as the main window on cold start. If a window already
hosts the requested workspace, it is focused instead of duplicated.

## 6. Unified Startup (per-window)

Every window — main or secondary — runs this once. The single `get_startup_state`
IPC eliminates the waterfall of separate settings/recents/workspace fetches.

```mermaid
sequenceDiagram
    participant WV as WebviewWindow
    participant React as useOpenDrop
    participant IPC as get_startup_state (Rust)
    participant State as WorkspaceState
    participant Store as Zustand Stores

    WV->>React: React mounts → useOpenDrop()
    React->>React: resolveStartup() (guarded, runs once)

    React->>IPC: get_startup_state()
    IPC->>State: read settings (merged layers)
    IPC->>IPC: load_recent_workspaces()
    IPC->>State: take_startup_open()

    alt startup_open set (CLI / Finder / new-window)
        IPC->>IPC: build_restore_bundle(startup_open.workspace)
        Note over IPC: Strip session + active_file,<br/>set open_file = startup_open.file
    else no startup_open, restore-workspace enabled
        IPC->>IPC: build_restore_bundle(recents[0])
        Note over IPC: Keep session → restore previous tabs
    else no startup_open, restore disabled
        Note over IPC: No bundle — welcome screen
    end

    IPC-->>React: StartupState { settings, recents, restore_bundle }

    React->>Store: settings.hydrateFromBackend()
    React->>Store: workspace.recentWorkspaces = recents

    opt restore_bundle present
        React->>Store: workspace.restoreFromBundle(bundle)
        alt bundle.session has tabs
            Store->>Store: restoreSession(tabs, active_file)
        else bundle.open_file set
            Store->>Store: openFile(open_file)
        else neither
            Store->>Store: ensureLauncherTab()
        end
    end

    React->>Store: setStartupResolved()
    Note over Store: Gate flips → AppLayout renders
    React->>WV: show_main_window()

    React->>React: listen("open:from-drop")
    Note over React: Runtime drops drain via pending_open
```

## Key Design Decisions

- **Single source of truth per concern**: `startup_open` owns the _initial_ open
  (seeded before `get_startup_state` reads it); `pending_open` owns _runtime_
  drops (queue + event). Their consumers do not overlap, which removes the
  cold-start double-open and the race where a runtime event clobbered startup.

- **Explicit open ≠ session restore**: when `startup_open` is set, the restore
  bundle's session and active file are stripped and `open_file` carries the
  request. So `kami file.md` opens just that file, not the previous session's
  tabs. With no `startup_open`, the bundle keeps the session and restores tabs.

- **One IPC, one render**: `get_startup_state` bundles settings + recents + the
  prefetched restore bundle. React hydrates everything before flipping the
  startup gate, so the first visible frame is the full editor — no welcome
  screen flash, no second IPC waterfall.

- **Canonical paths everywhere**: paths are canonicalized on the Rust side
  (`/var` → `/private/var` on macOS) so watcher events, sidebar entries, and
  window lookups (`find_by_workspace`) all key off the same string.

- **Per-window isolation**: each window has its own `WorkspaceState` (workspace
  root, file index, watcher, settings layer, `startup_open`, `pending_open`).
  Concurrent session saves serialize through a process-wide lock.

- **Lenient vs. strict resolution**: drag-drop and `RunEvent::Opened` use
  `resolve_path` (returns `None` for unsupported files). The CLI uses
  `validate_and_resolve` (typed error for stderr).
