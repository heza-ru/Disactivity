## Learned User Preferences

- Wants the separate "slave" helper window to match the main app's theming and UX.
- When suggesting performance or architecture work, prefers current best practices and quantified or concrete impact where that helps.
- Prefers public-facing README/SEO copy to avoid directly naming Discord and keep platform references implied.

## Learned Workspace Facts

- This project is a fork of the upstream Disactivity at https://github.com/holasoyender/disactivity with added features, so behavior may differ from upstream.
- A literal `~/` directory at the repository root is used (for example Tauri signing keys with `tauri signer generate`); that directory is in `.gitignore`.
- The Tauri app includes a "slave" subprocess and popup; mobile "remote" links are part of the app's feature set.
- `slave.exe` is a **headless sleep-loop** (no native UI); its popup UI is a React/Tauri `WebviewWindow` created dynamically in `App.tsx` when games start and destroyed when they stop. It is positioned bottom-right via `currentMonitor()` and has `skipTaskbar: false` so it appears in the Windows taskbar.
- MSI packaging requires a **numeric-only** prerelease suffix: use `0.0.2-1`, never `0.0.2-alpha.1` (applies to `package.json`, `tauri.conf.json`, both `Cargo.toml` files, and their lock files).
- On this Windows dev machine, security such as Smart App Control may block or flag `cargo.exe` or unsigned build outputs; build target architecture (e.g. 32- vs 64-bit) can affect that.
- Bundle analysis command: `bun run build:analyze` writes `dist/stats.html` via `rollup-plugin-visualizer`.
- React Compiler is enabled by default in `vite.config.ts`; disable one-off with `bun run build:no-compiler` or `REACT_COMPILER=0`.
- Startup settings sync uses one batched command, `apply_startup_ui_settings`; avoid duplicating startup `invoke` calls for the same fields.
- Favorites and paginated "All games" use `@tanstack/react-virtual` via `VirtualGameList`.
- i18n strategy keeps `en-US` eager and loads `es-ES` async (warmed during idle time) to keep the default path lighter.
- Non-critical startup work is deferred with `scheduleWhenIdle` in `src/lib/schedule-idle.ts`.
- Vitest setup in `src/__tests__/setup.ts` provides a full `localStorage` mock (including `clear`); run tests with `bun run test`.
