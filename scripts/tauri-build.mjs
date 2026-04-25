/**
 * Production Tauri build with signing keys from the repo's literal `~` folder
 * (`~/ .tauri / myapp.key`), matching `tauri signer generate -w ./~/.tauri/myapp.key`.
 *
 * Loads `signing.env.local` and `.env` (simple KEY=value) so `node` gets the same
 * intent as `bun run` for these variables.
 *
 * Resolves the private key in a fixed order (see `resolveMinisignPrivateKey`):
 * a file on disk always wins over a bad/mis-encoded `TAURI_SIGNING_PRIVATE_KEY` in
 * `.env` (a single base64 blob is NOT valid — Tauri needs the minisign *file text*
 * or a path to the file).
 */
import { existsSync, readFileSync } from "node:fs"
import { Buffer } from "node:buffer"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, "..")
const defaultKeyPath = path.join(repoRoot, "~", ".tauri", "myapp.key")

/**
 * @param {string} filePath
 * @param {NodeJS.ProcessEnv} target
 */
function loadEnvFile(filePath, target) {
    if (!existsSync(filePath)) return
    const text = readFileSync(filePath, "utf8")
    for (const line of text.split("\n")) {
        const t = line.trim()
        if (!t || t.startsWith("#")) continue
        const eq = t.indexOf("=")
        if (eq <= 0) continue
        const key = t.slice(0, eq).trim()
        let val = t.slice(eq + 1).trim()
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1)
        }
        target[key] = val
    }
}

/**
 * @param {string} s
 */
function looksLikeMinisignPem(s) {
    if (!s || s.length < 20) return false
    if (s.includes("untrusted comment:")) return true
    if (s.includes("BEGIN PRIVATE KEY") || s.includes("BEGIN RSA PRIVATE")) return true
    return false
}

/**
 * Single long base64 line sometimes pasted into .env — minisign file is UTF-8, then
 * some tools base64 the whole file; decode once to recover text.
 * @param {string} s
 * @returns {string | null}
 */
function tryDecodeBase64ToMinisign(s) {
    const t = s.trim()
    if (t.length < 40 || t.includes(" ") || t.includes("\n")) return null
    if (!/^[A-Za-z0-9+/]+=*$/.test(t)) return null
    try {
        const decoded = Buffer.from(t, "base64").toString("utf8")
        if (decoded.includes("untrusted comment:")) {
            return decoded.trim()
        }
    } catch {
        /* ignore */
    }
    return null
}

/**
 * @param {import('node:process').Env} env
 * @returns {string | null} PEM/minisign text, or null
 */
function resolveMinisignPrivateKey(env) {
    const fromPath = (p) => {
        const abs = path.isAbsolute(p) ? p : path.join(repoRoot, p)
        if (existsSync(abs)) {
            return readFileSync(abs, "utf8").trim()
        }
        return null
    }

    if (env.TAURI_SIGNING_PRIVATE_KEY_PATH?.trim()) {
        const raw = fromPath(env.TAURI_SIGNING_PRIVATE_KEY_PATH.trim())
        if (raw) {
            return raw
        }
        console.warn(
            "[tauri-build] TAURI_SIGNING_PRIVATE_KEY_PATH is set but file is missing; falling back to other options.",
        )
    }

    if (existsSync(defaultKeyPath)) {
        console.info(`[tauri-build] Using signing key file: ${defaultKeyPath}`)
        return readFileSync(defaultKeyPath, "utf8").trim()
    }

    const inline = env.TAURI_SIGNING_PRIVATE_KEY?.trim()
    if (inline) {
        if (looksLikeMinisignPem(inline)) {
            return inline
        }
        const decoded = tryDecodeBase64ToMinisign(inline)
        if (decoded) {
            console.info(
                "[tauri-build] Decoded minisign key from base64 one-liner in TAURI_SIGNING_PRIVATE_KEY (prefer putting the myapp.key *path* or raw file text).",
            )
            return decoded
        }
        console.warn(
            "[tauri-build] TAURI_SIGNING_PRIVATE_KEY is set but is not valid minisign/PEM text. Remove it from .env and use the file at ~/.tauri/myapp.key or set TAURI_SIGNING_PRIVATE_KEY_PATH to that file.",
        )
    }

    return null
}

const env = { ...process.env }
loadEnvFile(path.join(repoRoot, ".env"), env)
loadEnvFile(path.join(repoRoot, "signing.env.local"), env) // wins over .env

const privateKey = resolveMinisignPrivateKey(env)
if (privateKey) {
    env.TAURI_SIGNING_PRIVATE_KEY = privateKey
} else {
    delete env.TAURI_SIGNING_PRIVATE_KEY
    console.warn(
        "[tauri-build] No valid signing key found. Build may fail with updater signing errors. See docs/TAURI_SIGNING.md",
    )
}

const extra = process.argv.slice(2)
const r = spawnSync("bun", ["run", "tauri", "build", ...extra], {
    cwd: repoRoot,
    env,
    stdio: "inherit",
    shell: true,
})

process.exit(r.status ?? 1)
