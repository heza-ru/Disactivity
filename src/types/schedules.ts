export interface PresenceProfile {
    id: string
    name: string
    client_id: string
    details: string | null
    state_text: string | null
}

export interface ScheduleEntry {
    id: string
    profile_id: string
    label: string
    start_hour: number
    start_minute: number
    end_hour: number
    end_minute: number
    days: number[]   // 0=Sun..6=Sat, empty = every day
    enabled: boolean
}

export interface NowPlaying {
    artist: string
    title: string
    source: string
}

export interface IdeActivity {
    editor: string
    project: string | null
    file: string | null
}
