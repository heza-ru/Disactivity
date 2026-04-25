# Tauri updater signing (fix: “public key found, but no private key”)

`src-tauri/tauri.conf.json` has `plugins.updater.pubkey` (the **public** key). When `createUpdaterArtifacts` is true, the build also needs the **matching private key** to sign update artifacts. If only the public key is present, you get:

> A public key has been found, but no private key. Make sure to set `TAURI_SIGNING_PRIVATE_KEY`…

### Still failing after you “added the key”?

- **Use `bun run tauri:build`**, not `bunx tauri build` alone, so `scripts/tauri-build.mjs` can wire the key into the build.
- **`TAURI_SIGNING_PRIVATE_KEY` must be the minisign *file text*** (the same content as `myapp.key` — it starts with `untrusted comment:` on the first line), **or** set **`TAURI_SIGNING_PRIVATE_KEY_PATH`** to the full path of `myapp.key`. A **single long base64 line in `.env` is usually wrong** (Tauri does not treat that as the private key unless it decodes to the minisign file text).
- **Best fix:** keep the key only in **`./~/.tauri/myapp.key`**, and **remove** `TAURI_SIGNING_PRIVATE_KEY=` from `.env` / `signing.env.local` if you had pasted a bad value. The build script now prefers the key **file** over a non-minisign inline value.
- **Public key in `tauri.conf.json`** must be the one printed with *that* `myapp.key` pair (from `myapp.key.pub` / `tauri signer generate` output).

## Option 1 — Use the path this repo already supports (recommended)

1. Open a terminal at the **repository root** (where `package.json` is).

2. **Generate a new key pair** (safe to run multiple times; each run creates a new key):

   ```bash
   bunx tauri signer generate -w "./~/.tauri/myapp.key"
   ```

   The `-w` path is relative to the repo: it creates a folder named `~` in the project (not your user home) with `~/.tauri/myapp.key` inside. That matches `AGENTS.md` and `scripts/tauri-build.mjs`.

3. The command prints a **public key** string. Put it in **`src-tauri/tauri.conf.json`** under `plugins.updater.pubkey` so it **exactly matches** the key you just generated. Replace the old `pubkey` value (e.g. upstream) if you want your own update channel.

4. Run the production build as usual:

   ```bash
   bun run tauri:build
   ```

   The script will read `~/.tauri/myapp.key` and set `TAURI_SIGNING_PRIVATE_KEY` for the build. The `~` tree is in `.gitignore` — do not commit the private key.

## Option 2 — Environment variable (any path to the private key)

1. Generate a key, e.g.:

   ```bash
   bunx tauri signer generate -w "C:\secrets\disactivity\myapp.key"
   ```

2. In **PowerShell** (one session), point at the file:

   ```powershell
   $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "C:\secrets\disactivity\myapp.key" -Raw
   bun run tauri:build
   ```

   Or set only the path, if your tooling supports it:

   ```powershell
   $env:TAURI_SIGNING_PRIVATE_KEY_PATH = "C:\secrets\disactivity\myapp.key"
   bun run tauri:build
   ```

3. Update `tauri.conf.json` `pubkey` with the **public** key printed at generation time.

## Option 3 — `signing.env` pattern

See `signing.env.example` in the repo root. Copy to something like `signing.env.local`, add your variable (never commit it), and load it before the build in your own workflow. Do not paste a real private key into chat or into git.

## If you do **not** need signed update artifacts (local / CI without updater signing)

- Set `bundle.createUpdaterArtifacts` to `false` in `tauri.conf.json`, and/or  
- Remove or clear `plugins.updater` until you have a key.

That avoids the signing step; your published updater flow will need a matching setup later if you re-enable it.

## References

- Tauri: [Upgrading / signing & updates](https://v2.tauri.app/distribute)
- This repo: `scripts/tauri-build.mjs` for automatic loading of `./~/.tauri/myapp.key`
