## Learned User Preferences

- Wants the separate “slave” helper window to match the main app’s theming and UX.
- When suggesting performance or architecture work, prefers current best practices and quantified or concrete impact where that helps.

## Learned Workspace Facts

- This project is a fork of the upstream Disactivity at https://github.com/holasoyender/disactivity with added features, so behavior may differ from upstream.
- A literal `~/` directory at the repository root is used (for example Tauri signing keys with `tauri signer generate`); that directory is in `.gitignore`.
- The Tauri app includes a “slave” subprocess and popup; mobile “remote” links are part of the app’s feature set.
- On this Windows dev machine, security such as Smart App Control may block or flag `cargo.exe` or unsigned build outputs; build target architecture (e.g. 32- vs 64-bit) can affect that.

## Build & frontend tooling

- **Bundle analysis:** `bun run build:analyze` writes `dist/stats.html` (treemap) via `rollup-plugin-visualizer`.
- **React Compiler** is **on by default** in `vite.config.ts` (Babel plugin). Use `bun run build:no-compiler` or set `REACT_COMPILER=0` to disable the compiler for a one-off build.
- **Tauri + Rust settings sync** uses a single batched command, `apply_startup_ui_settings` (tray, idle, schedule, media, IDE) from the React app; avoid duplicating with multiple startup `invoke`s for the same fields.
- **Lists:** Favorites and the paginated “All games” list use `@tanstack/react-virtual` (`VirtualGameList`) for large libraries.
- **i18n:** `en-US` is bundled eagerly; `es-ES` is loaded asynchronously (and warmed in idle time) so the default path stays smaller.
- **Startup deferral:** `scheduleWhenIdle` (`src/lib/schedule-idle.ts`) defers non-critical work such as the discovery `fetchDiscovery` call so the shell can paint first.

## Tests

- Vitest uses `src/__tests__/setup.ts`, which provides a full `localStorage` mock (including `clear`) for `settings` unit tests. Run: `bun run test`.
