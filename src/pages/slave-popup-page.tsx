import { useEffect, useMemo, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import type { Game } from "@/components/game-card"
import { Button } from "@/components/ui/button"
import { getGameIconUrl, DEFAULT_GAME_ICON } from "@/lib/game-assets"

interface FetchGamesResponse {
    games: Game[]
}

export function SlavePopupPage() {
    const [runningIds, setRunningIds] = useState<string[]>([])
    const [gamesById, setGamesById] = useState<Map<string, Game>>(new Map())
    const [startAt, setStartAt] = useState<number>(Date.now())
    const [uiNow, setUiNow] = useState<number>(Date.now())

    useEffect(() => {
        const loadGames = async () => {
            try {
                const [fetched, custom] = await Promise.all([
                    invoke<FetchGamesResponse>("fetch_games", { forceRefresh: false }),
                    invoke<Game[]>("get_custom_games"),
                ])
                const merged = [...custom, ...fetched.games]
                setGamesById(new Map(merged.map((g) => [g.id, g])))
            } catch {
                // ignore transient read errors
            }
        }
        loadGames().catch(console.error)
    }, [])

    useEffect(() => {
        const poll = async () => {
            try {
                const ids = await invoke<string[]>("get_running_games")
                setRunningIds((prev) => {
                    const changed = prev.length !== ids.length || prev.some((id, i) => id !== ids[i])
                    if (changed && ids[0] !== prev[0]) {
                        setStartAt(Date.now())
                    }
                    return changed ? ids : prev
                })
            } catch {
                // ignore
            }
        }
        poll().catch(console.error)
        const id = setInterval(poll, 1000)
        return () => clearInterval(id)
    }, [])

    useEffect(() => {
        const id = setInterval(() => setUiNow(Date.now()), 1000)
        return () => clearInterval(id)
    }, [])

    const activeId = runningIds[0] ?? null
    const activeGame = activeId ? gamesById.get(activeId) ?? null : null

    const elapsed = useMemo(() => {
        const sec = Math.floor(Math.max(0, uiNow - startAt) / 1000)
        const h = Math.floor(sec / 3600)
        const m = Math.floor((sec % 3600) / 60)
        const s = sec % 60
        return h > 0
            ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
            : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    }, [uiNow, startAt])

    const onMinimize = async () => {
        await getCurrentWindow().minimize()
    }

    const onStop = async () => {
        if (!activeId) return
        await invoke("stop_game", { gameId: activeId })
    }

    return (
        <div className="h-screen w-screen bg-background/95 border border-border/60 rounded-2xl p-3 text-foreground select-none">
            <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Activity Session</p>
                <span className="inline-flex items-center gap-1 rounded-4xl border border-green-500/30 bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold text-green-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                    ACTIVE
                </span>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/70 p-2.5 mb-3">
                <img
                    src={activeGame ? getGameIconUrl(activeGame, 64) : DEFAULT_GAME_ICON}
                    alt={activeGame?.name ?? "Game"}
                    className="h-10 w-10 rounded-xl object-cover bg-muted"
                    onError={(e) => {
                        (e.target as HTMLImageElement).src = DEFAULT_GAME_ICON
                    }}
                />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{activeGame?.name ?? "No active game"}</p>
                    <p className="text-xs text-primary font-medium">
                        {elapsed} <span className="text-muted-foreground">Session elapsed</span>
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <Button size="sm" className="rounded-4xl" onClick={onMinimize}>
                    Minimize
                </Button>
                <Button size="sm" variant="destructive" className="rounded-4xl" onClick={onStop} disabled={!activeId}>
                    Stop
                </Button>
            </div>
        </div>
    )
}

