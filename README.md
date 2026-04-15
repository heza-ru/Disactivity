<p align="center">
  <img src="public/icon.png" alt="Disactivity Logo" width="128" height="128">
</p>

<h1 align="center">Disactivity</h1>

<p align="center">
  <strong>Discord Activity Simulator</strong><br>
  Simulate game activity on Discord by running invisible placeholder processes that Discord can detect.
</p>

<p align="center">
  <a href="https://github.com/holasoyender/disactivity/releases/latest">
    <img src="https://img.shields.io/github/v/release/holasoyender/disactivity?style=flat-square" alt="Latest Release">
  </a>
  <a href="https://github.com/holasoyender/disactivity/blob/master/LICENSE">
    <img src="https://img.shields.io/github/license/holasoyender/disactivity?style=flat-square" alt="License">
  </a>
  <a href="https://github.com/holasoyender/disactivity/stargazers">
    <img src="https://img.shields.io/github/stars/holasoyender/disactivity?style=flat-square" alt="Stars">
  </a>
</p>

---

## Description

**Disactivity** is a lightweight desktop application that lets you simulate playing any game on Discord. Select a game from the list, click **Run**, and Discord will show that game as your current activity — without it being installed on your system.

The app fetches its game catalogue directly from Discord's API, giving you access to thousands of titles. Multiple games can be simulated simultaneously, each with its own independent timer.

<p align="center">
  <img src="public/banner.png" alt="Disactivity screenshot">
</p>

---

## Features

**Game browsing**
- Browse thousands of games sourced from Discord's detectable-games API
- Live search — results update as you type, filtering by name, ID, or alias
- Paginated list with configurable page size and a page-jump control
- Game details dialog showing aliases and all available executables per platform
- Copy a game's Discord application ID to the clipboard in one click

**Activity simulation**
- Run multiple games simultaneously — each appears as a separate Discord activity
- Executable selection — choose a specific process name when a game has more than one
- Auto-stop timer — automatically ends simulation after a configurable number of minutes
- Running-games task manager in the title bar showing elapsed time and a progress bar per game
- Stop individual games or all games at once

**Favourites**
- Star any game to pin it to the top of the list
- Export favourites to a JSON file and import them on another machine

**Recently played**
- The home page shows up to 10 recently played games as a quick-launch strip

**Settings page**
- Minimize to system tray on window close (or exit directly)
- Auto-stop toggle and configurable timer duration (1 – 480 minutes)
- Games shown per page (10 – 200)
- Cache management — view when the game list was last fetched and force a refresh

**System tray**
- Hide to tray on close so the app keeps running in the background
- Left-click the tray icon to toggle window visibility
- Tray menu: Show window / Quit (cleans up all running processes before exit)

**Updater**
- Built-in auto-updater checks for new releases on launch
- Download and install updates in-app with a progress indicator
- One-click restart to apply the update

**Interface**
- Three-page navigation: Home, Settings, About
- About page listing the original creator, feature contributors (pulled from the GitHub API), and the feature enhancer
- Dark and light theme toggle
- Windows-style window controls (minimize, maximize, close)
- Keyboard shortcuts: `/` or `Ctrl+F` focuses search, `Escape` clears it
- Available in English and Spanish

---

## Download

Download the latest installer from the [GitHub Releases](https://github.com/holasoyender/disactivity/releases/latest) page.

---

## How It Works

1. **Launch Disactivity** and wait for the game list to load (cached after first fetch).
2. **Find a game** using the search bar or by browsing the paginated list.
3. **Click Run** on a game card. Disactivity writes a small placeholder executable to a temporary directory, using the exact filename that Discord looks for.
4. **Discord detects** the running process by name and shows the game as your current activity.
5. **Click Stop** (or let the auto-stop timer fire) to end the simulation. Temporary files are deleted automatically.

### Technical notes

- The placeholder process (`slave.exe`) is a minimal Win32 application embedded in the main binary. It creates an off-screen, non-activating window so Discord's process scanner can detect it without it appearing on screen.
- Executable path selection: when a game has multiple Win32 executables, Disactivity picks the one with the fewest path segments (i.e. the root-level binary) to minimise the chance of a path mismatch. You can override this with the executable-selection dropdown.
- The game list is cached locally for 48 hours. Use **Settings > Refresh Now** to force a fresh fetch.
- On quit (via the tray menu or when minimize-to-tray is disabled), all child processes are terminated and their temporary directories are removed before the app exits.

---

## Building from Source

### Prerequisites

- [Bun](https://bun.sh/)
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- Windows target toolchain (`x86_64-pc-windows-msvc`) if cross-compiling

### Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/holasoyender/disactivity.git
   cd disactivity
   ```

2. **Install frontend dependencies**
   ```bash
   bun install
   ```

3. **Build the slave executable** (must be done before the main build)
   ```bash
   cd src-tauri/slave
   cargo build --release
   cd ../..
   ```

4. **Run in development mode**
   ```bash
   bun run tauri dev
   ```

5. **Build for production**
   ```bash
   bun run tauri build
   ```

The installer and portable binary are placed in `src-tauri/target/release/bundle/`.

---

## Project Structure

```
disactivity/
├── src/                        # Frontend — React + TypeScript
│   ├── components/             # Shared UI components
│   │   ├── ui/                 # Primitive components (Button, Input, Dialog, ...)
│   │   ├── game-card.tsx       # Individual game row with run/stop controls
│   │   ├── game-details-dialog.tsx
│   │   ├── nav-bar.tsx         # Page tab navigation
│   │   └── title-bar.tsx       # Custom title bar with task manager
│   ├── pages/                  # Top-level page components
│   │   ├── home-page.tsx       # Game browser and recently played
│   │   ├── settings-page.tsx   # All configurable options
│   │   └── about-page.tsx      # Credits and contributors
│   ├── i18n/
│   │   └── locales/            # en-US.json, es-ES.json
│   └── lib/
│       └── settings.ts         # Settings schema, load/save helpers
├── src-tauri/                  # Backend — Rust + Tauri 2
│   ├── src/
│   │   └── lib.rs              # Commands: fetch_games, start_game, stop_game, ...
│   ├── slave/                  # Placeholder process source
│   │   └── src/main.rs
│   └── icons/                  # Application icons
└── public/                     # Static assets
```

---

## Privacy and Safety

- **No telemetry** — Disactivity does not collect or transmit any personal data.
- **Open source** — All code is publicly available for review.
- **Minimal network access** — The only outbound requests are to Discord's public API to fetch the game list and to GitHub's API (About page, contributor list).
- **Temporary files only** — Placeholder executables are written to the system temp directory and deleted when the simulation stops or the app exits.

---

## Disclaimer

This application is intended for entertainment and personal use only. Use it responsibly and in accordance with [Discord's Terms of Service](https://discord.com/terms).

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Contributing

Contributions are welcome. Open an issue to discuss a change before submitting a pull request.

---

<p align="center">
  Created by <a href="https://github.com/holasoyender">holasoyender</a>
  &nbsp;&middot;&nbsp;
  Enhanced by <a href="https://github.com/heza-ru">heza-ru</a>
</p>
