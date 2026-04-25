<div align="center">

<img src="public/icon.png" alt="Disactivity" width="128" height="128" />

# Disactivity

**Simulate game activity** from the desktop — lightweight, open source, built with **Tauri 2** and **React**.

[![Release (this fork)](https://img.shields.io/github/v/release/heza-ru/disactivity?style=flat-square&logo=github&label=release)](https://github.com/heza-ru/disactivity/releases)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2-24C8D8?logo=tauri&style=flat-square)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black&style=flat-square)](https://react.dev/)

`v0.1.0-1` · *Version in this repository ([`package.json`](package.json) / [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json)). **MSI/NSIS** bundles require a **numeric-only** prerelease (e.g. `0.1.0-1`, not `0.1.0-alpha`). **GitHub Releases** for this fork are the source of truth for installable builds here.*

</div>

> **Independent fork**  
> This repository is **actively maintained on its own** — it is **not** a mirror of upstream release tags, issues, or roadmap. Installers, version numbers, and **Releases** published **here** apply to **this** project. For the original application and its author, see [Credits](#credits).

---

## Table of contents

- [Why this fork](#why-this-fork)
- [How it differs from the parent repo](#how-it-differs-from-the-parent-repo)
- [Features](#features)
- [Screenshots](#screenshots)
- [Download](#download)
- [How it works](#how-it-works)
- [Developers](#developers)
- [Project structure](#project-structure)
- [Privacy & safety](#privacy--safety)
- [License](#license)
- [Contributing](#contributing)
- [Credits](#credits)

---

## Why this fork

[holasoyender/disactivity](https://github.com/holasoyender/disactivity) is the **parent** project. **This** repo is a **separate line of development**: own commits, own releases, and behavior that may **diverge** as features and refactors land here first (or only here). Use **this** project’s [Releases](https://github.com/heza-ru/disactivity/releases) for builds that match the code in this tree — not the parent’s release page.

---

## How it differs from the parent repo

| Area | This fork (high level) |
|------|------------------------|
| **Releases** | Versioned and published from **[heza-ru/disactivity](https://github.com/heza-ru/disactivity/releases)**; not aligned 1:1 with parent tags. |
| **Frontend** | [React Compiler](https://react.dev/learn/react-compiler) enabled in Vite for typical builds; virtualized long lists ([TanStack Virtual](https://tanstack.com/virtual)), split i18n loading, idle-deferred work for snappier startup. |
| **Desktop integration** | Batched Tauri `apply_startup_ui_settings` (tray, idle, schedule, media, IDE) to reduce startup IPC. |
| **Settings & product** | Extended options (e.g. API keys, discovery, remote, presence/scheduling) — *exact surface may change; treat this README and in-app copy as the source of truth for **this** build.* |
| **Build tooling** | `bun run build:analyze` (Rollup treemap to `dist/stats.html`), optional one-off build without the compiler, Vitest for tests. |

*If you need parity with the original app, compare against the [parent repository](https://github.com/holasoyender/disactivity) directly.*

---

## Features

**Library & search**

- Game catalogue from a public detectable-games source; list cached and refreshable
- **Live search** (name, ID, aliases) with **debounced** filtering
- **Favorites** at the top; **virtualized** lists for large libraries; pagination + page jump
- **Recently played** quick strip; **import/export** favorites (JSON)
- **Game details** (aliases, executables, rich metadata when configured)

**Simulation**

- Multiple games at once, per-game timers and **title-bar** “running games” control
- Optional **executable** choice when a title exposes more than one Win32 binary
- **Auto-stop** after a configurable duration; **idle**-based auto-stop (when enabled)

**App shell**

- **System tray** behavior, in-app **updater**, **dark / light** theme, **i18n** (e.g. en-US, es-ES)
- **Remote** page (phone/tablet on the same network) and other product pages as shipped in this fork

**Developer experience (this tree)**

- TypeScript, Vite, Tauri 2, Rust, Bun; tests via Vitest

---

## Screenshots

<p align="center">
  <img src="public/banner.png" alt="Disactivity" width="720" />
</p>

---

## Download

**Get builds from this fork only:**

[![GitHub All Releases](https://img.shields.io/github/downloads/heza-ru/disactivity/total?style=flat-square&logo=github&label=downloads%20%28all%20releases%29)](https://github.com/heza-ru/disactivity/releases)

→ **[Latest release (this repo)](https://github.com/heza-ru/disactivity/releases/latest)**

*The parent project’s [releases](https://github.com/holasoyender/disactivity/releases) are a **different** channel — use them only when you want upstream’s artifacts.*

---

## How it works

1. The app **loads a catalogue** of games and caches it locally.
2. You **Run** a game: a small placeholder process (`slave.exe` on Windows) is spawned so monitoring software can **detect the right executable name** — no full game install required.
3. You **Stop** manually, via auto-stop, or from global controls; temp artifacts are cleaned up.
4. Optional: **tray** minimize, **updater** checks, **remote** and **metadata** when you configure API keys (see in-app **Settings**).

*Technical details (cache TTL, process lifecycle, etc.) are implementation details — read the code and in-app help for the exact build you run.*

---

## Developers

### Prerequisites

- [Bun](https://bun.sh/)
- [Rust](https://www.rust-lang.org/tools/install) (stable) + Windows `msvc` toolchain for Windows builds
- Tauri 2 [requirements](https://v2.tauri.app/start/prerequisites/) for your OS

### Quick start

```bash
# clone this fork (not the parent) if you want this codebase
git clone https://github.com/heza-ru/disactivity.git
cd disactivity

bun install

# Build the embedded Windows slave binary before full Tauri build
cd src-tauri/slave
cargo build --release
cd ../..

# Dev
bun run tauri dev

# Production bundle (output under src-tauri/target/.../bundle/)
bun run tauri:build
```

| Script | Use |
|--------|-----|
| `bun run dev` / `bun run tauri dev` | Vite + Tauri dev |
| `bun run build` | Web build only |
| `bun run tauri:build` | App installer / bundle |
| `bun run build:analyze` | `dist/stats.html` chunk treemap |
| `bun run test` | Vitest |

### Tech stack (current)

- **UI:** React 19, Vite, Tailwind CSS, Radix primitives
- **Desktop:** Tauri 2, Rust
- **Package manager:** Bun

---

## Project structure (abbrev.)

```
.
├── public/                 # Static assets, icons
├── src/                    # React + TypeScript frontend
│   ├── components/         # UI, game list, title bar, …
│   ├── pages/              # Home, settings, about, remote, …
│   ├── i18n/locales/      # en-US, es-ES, …
│   └── lib/                # settings, schedulers, utilities
├── src-tauri/              # Rust, Tauri commands, bundling
│   ├── src/                # e.g. lib.rs, feature modules
│   └── slave/              # Windows placeholder process
└── scripts/                # build helpers
```

---

## Privacy & safety

- **No built-in telemetry** in this project’s source as shipped here — review releases yourself.
- **Network** use is for catalogue/metadata/updater and **optional** services you enable (e.g. API keys).
- Placeholder binaries use **temp** storage where applicable; see code for your platform.

---

## License

**MIT** — see [`LICENSE`](LICENSE).  
Upstream and this fork are both open source; **compliance and attribution** remain your responsibility for how you use and redistribute builds.

---

## Contributing

- **Issues & PRs** for this line of work should target **[this repository](https://github.com/heza-ru/disactivity)**, not the parent, unless you intend to contribute **upstream** there.
- For **large** changes, open an issue first.
- Starring the repo helps visibility — on **this** fork if you use this code.

---

## Credits

| | |
|---|---|
| **Original project** | **Disactivity** by **[holasoyender](https://github.com/holasoyender)** — [github.com/holasoyender/disactivity](https://github.com/holasoyender/disactivity) |
| **This fork** | Maintained separately: **[heza-ru/disactivity](https://github.com/heza-ru/disactivity)** (releases & issues here). |

Original app concept, branding lineage, and prior art belong to the **parent** project and its **original creator** above. This README’s **version** and **release** references apply to **this** fork only.

---

<p align="center">
  <a href="https://star-history.com/#holasoyender/disactivity&Date">
    <img src="https://api.star-history.com/svg?repos=holasoyender/disactivity&type=Date" alt="Star history — original Disactivity repository" width="600" />
  </a>
  <br />
  <sub>Star history: <strong>original</strong> <code>holasoyender/disactivity</code> (reference). Star <a href="https://github.com/heza-ru/disactivity">this fork</a> to support <strong>this</strong> line of development.</sub>
</p>
