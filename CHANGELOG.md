# Changelog

All notable changes to this fork are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and our version is aligned with `package.json` / `src-tauri/tauri.conf.json`.

## [0.1.0-1] - 2026-04-25

### In this fork (high level)

- Independent maintenance line with fork-specific [Releases](https://github.com/heza-ru/Disactivity/releases) and tooling (signing, build script, i18n, performance refactors) — see repository README and compare against [holasoyender/disactivity](https://github.com/holasoyender/disactivity) for the original app.
- Tauri 2 app with React, virtualized game lists, batched startup settings IPC, and extended settings surface as shipped in this tree.
- In-app **updater** checks **`latest.json` on this repo’s Releases** (not the parent) when you ship builds signed with the key that matches `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`.

[0.1.0-1]: https://github.com/heza-ru/Disactivity/releases/tag/v0.1.0-1
