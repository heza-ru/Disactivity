export interface AppSettings {
    autoStopEnabled: boolean
    autoStopMinutes: number
    itemsPerPage: number
    minimizeToTray: boolean
    idleStopEnabled: boolean
    idleStopMinutes: number
    scheduleEnabled: boolean
    mediaEnabled: boolean
    ideEnabled: boolean
}

const SETTINGS_KEY = "disactivity_settings"

export const DEFAULT_SETTINGS: AppSettings = {
    autoStopEnabled: true,
    autoStopMinutes: 15,
    itemsPerPage: 50,
    minimizeToTray: true,
    idleStopEnabled: false,
    idleStopMinutes: 30,
    scheduleEnabled: false,
    mediaEnabled: false,
    ideEnabled: false,
}

export function loadSettings(): AppSettings {
    try {
        const stored = localStorage.getItem(SETTINGS_KEY)
        if (!stored) return { ...DEFAULT_SETTINGS }
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
    } catch {
        return { ...DEFAULT_SETTINGS }
    }
}

export function saveSettings(settings: AppSettings): void {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}
