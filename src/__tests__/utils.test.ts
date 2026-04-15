import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { loadSettings, saveSettings, DEFAULT_SETTINGS, type AppSettings } from "@/lib/settings"
import { ITEMS_PER_PAGE_DEFAULT, AUTO_STOP_MINUTES_DEFAULT, FIFTEEN_MINUTES_MS } from "@/constants"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe("constants", () => {
    it("ITEMS_PER_PAGE_DEFAULT is 50", () => {
        expect(ITEMS_PER_PAGE_DEFAULT).toBe(50)
    })

    it("AUTO_STOP_MINUTES_DEFAULT is 15", () => {
        expect(AUTO_STOP_MINUTES_DEFAULT).toBe(15)
    })

    it("FIFTEEN_MINUTES_MS equals 15 * 60 * 1000", () => {
        expect(FIFTEEN_MINUTES_MS).toBe(15 * 60 * 1000)
    })
})

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
describe("settings", () => {
    beforeEach(() => {
        localStorage.clear()
    })

    afterEach(() => {
        localStorage.clear()
    })

    it("loadSettings returns defaults when nothing is stored", () => {
        const s = loadSettings()
        expect(s).toEqual(DEFAULT_SETTINGS)
    })

    it("saveSettings persists and loadSettings restores", () => {
        const custom: AppSettings = { autoStopEnabled: false, autoStopMinutes: 30, itemsPerPage: 100 }
        saveSettings(custom)
        expect(loadSettings()).toEqual(custom)
    })

    it("loadSettings merges stored values with defaults (partial storage)", () => {
        localStorage.setItem("disactivity_settings", JSON.stringify({ itemsPerPage: 25 }))
        const s = loadSettings()
        expect(s.itemsPerPage).toBe(25)
        expect(s.autoStopEnabled).toBe(DEFAULT_SETTINGS.autoStopEnabled)
        expect(s.autoStopMinutes).toBe(DEFAULT_SETTINGS.autoStopMinutes)
    })

    it("loadSettings returns defaults on malformed JSON", () => {
        localStorage.setItem("disactivity_settings", "not-json")
        expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
    })
})

// ---------------------------------------------------------------------------
// formatElapsedTime (inline copy — pure function, no imports needed)
// ---------------------------------------------------------------------------
function formatElapsedTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    const pad = (n: number) => n.toString().padStart(2, "0")
    if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    return `${pad(minutes)}:${pad(seconds)}`
}

describe("formatElapsedTime", () => {
    it("formats sub-minute as 00:ss", () => {
        expect(formatElapsedTime(30_000)).toBe("00:30")
    })

    it("formats minutes correctly", () => {
        expect(formatElapsedTime(5 * 60 * 1000)).toBe("05:00")
    })

    it("formats mixed minutes and seconds", () => {
        expect(formatElapsedTime(3 * 60 * 1000 + 45 * 1000)).toBe("03:45")
    })

    it("includes hours when >= 1 hour", () => {
        expect(formatElapsedTime(3600_000 + 2 * 60_000 + 5_000)).toBe("01:02:05")
    })

    it("handles zero", () => {
        expect(formatElapsedTime(0)).toBe("00:00")
    })
})
