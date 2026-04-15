"use client"

import type React from "react"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { invoke } from "@tauri-apps/api/core"
import { toast } from "sonner"
import { Toaster } from "@/components/ui/sonner"
import type { Game } from "@/components/game-card"
import { TitleBar } from "@/components/title-bar"
import { NavBar, type AppPage } from "@/components/nav-bar"
import { ErrorBoundary } from "@/components/error-boundary"
import { loadSettings, saveSettings, type AppSettings } from "@/lib/settings"
import { HomePage, type RecentGame } from "@/pages/home-page"
import { SettingsPage } from "@/pages/settings-page"
import { AboutPage } from "@/pages/about-page"

interface FetchGamesResponse {
    games: Game[]
    from_cache: boolean
}

const RECENTLY_PLAYED_KEY = "disactivity_recently_played"
const MAX_RECENTLY_PLAYED = 10

function loadRecentlyPlayed(): RecentGame[] {
    try {
        const stored = localStorage.getItem(RECENTLY_PLAYED_KEY)
        return stored ? JSON.parse(stored) : []
    } catch {
        return []
    }
}

function addRecentlyPlayed(gameId: string, current: RecentGame[]): RecentGame[] {
    const filtered = current.filter((r) => r.id !== gameId)
    const updated = [{ id: gameId, playedAt: Date.now() }, ...filtered].slice(0, MAX_RECENTLY_PLAYED)
    localStorage.setItem(RECENTLY_PLAYED_KEY, JSON.stringify(updated))
    return updated
}

export default function App() {
    const { t } = useTranslation()
    const [activePage, setActivePage] = useState<AppPage>("home")
    const [games, setGames] = useState<Game[]>([])
    const [customGames, setCustomGames] = useState<Game[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [runningGames, setRunningGames] = useState<Set<string>>(new Set())
    const [loadingGames, setLoadingGames] = useState<Set<string>>(new Set())
    const [favorites, setFavorites] = useState<Set<string>>(new Set())
    const [gameStartTimes, setGameStartTimes] = useState<Map<string, number>>(new Map())
    const [settings, setSettings] = useState<AppSettings>(loadSettings)
    const [recentlyPlayed, setRecentlyPlayed] = useState<RecentGame[]>(loadRecentlyPlayed)

    // Merge API games with custom games (custom first so they appear at the top of the list)
    const allGames = useMemo(() => [...customGames, ...games], [customGames, games])

    // O(1) game lookup
    const gamesById = useMemo(() => new Map(allGames.map((g) => [g.id, g])), [allGames])

    // Sync minimizeToTray to Rust on startup
    useEffect(() => {
        invoke("set_minimize_to_tray", { enabled: settings.minimizeToTray }).catch(console.error)
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    const handleSaveSettings = useCallback(
        (next: AppSettings) => {
            setSettings(next)
            saveSettings(next)
            toast.success(t("settings.saved"))
        },
        [t]
    )

    const fetchGames = useCallback(
        async (forceRefresh = false) => {
            try {
                if (forceRefresh) {
                    setIsRefreshing(true)
                } else {
                    setIsLoading(true)
                }

                const response = await invoke<FetchGamesResponse>("fetch_games", { forceRefresh })
                setGames(response.games)

                if (forceRefresh) {
                    toast.success(t("toast.refreshed.title"), {
                        description: t("toast.refreshed.description", { count: response.games.length }),
                    })
                } else if (response.from_cache) {
                    toast.info(t("toast.loadedFromCache.title"), {
                        description: t("toast.loadedFromCache.description", {
                            count: response.games.length,
                        }),
                    })
                }
            } catch (error) {
                toast.error(t("toast.error.title"), {
                    description: t("toast.error.fetchFailed", { error }),
                })
            } finally {
                setIsLoading(false)
                setIsRefreshing(false)
            }
        },
        [t]
    )

    const fetchFavorites = useCallback(async () => {
        try {
            const favs = await invoke<string[]>("get_favorites")
            setFavorites(new Set(favs))
        } catch (error) {
            console.error("Failed to load favorites:", error)
        }
    }, [])

    const fetchCustomGames = useCallback(async () => {
        try {
            const cgs = await invoke<Game[]>("get_custom_games")
            setCustomGames(cgs)
        } catch (error) {
            console.error("Failed to load custom games:", error)
        }
    }, [])

    const handleAddCustomGame = useCallback(async (name: string, executable: string) => {
        const game = await invoke<Game>("add_custom_game", { name, executable })
        setCustomGames((prev) => [...prev, game])
        toast.success(t("gameCard.customAdded"), { description: game.name })
    }, [t])

    const handleDeleteCustomGame = useCallback(async (gameId: string) => {
        await invoke("remove_custom_game", { gameId })
        setCustomGames((prev) => prev.filter((g) => g.id !== gameId))
        toast.success(t("gameCard.customDeleted"))
    }, [t])

    useEffect(() => {
        fetchGames().catch(console.error)
        fetchFavorites().catch(console.error)
        fetchCustomGames().catch(console.error)
    }, [fetchGames, fetchFavorites, fetchCustomGames])

    const handleStartGame = useCallback(
        async (game: Game, selectedExecutable?: string) => {
            if (!game.executables || game.executables.length === 0) {
                toast.error(t("toast.cannotStartGame.title"), {
                    description: t("toast.cannotStartGame.noExecutables"),
                })
                return
            }

            setLoadingGames((prev) => new Set(prev).add(game.id))

            try {
                await invoke<string>("start_game", {
                    gameId: game.id,
                    executables: game.executables,
                    selectedExecutable: selectedExecutable || null,
                    iconHash: game.icon_hash || null,
                })

                setRunningGames((prev) => new Set(prev).add(game.id))
                setGameStartTimes((prev) => new Map(prev).set(game.id, Date.now()))
                setRecentlyPlayed((prev) => addRecentlyPlayed(game.id, prev))

                toast.success(t("toast.gameStarted.title"), {
                    description: t("toast.gameStarted.description", { name: game.name }),
                })
            } catch (error) {
                toast.error(t("toast.failedToStartGame.title"), {
                    description: `${error}`,
                })
            } finally {
                setLoadingGames((prev) => {
                    const next = new Set(prev)
                    next.delete(game.id)
                    return next
                })
            }
        },
        [t]
    )

    const handleStopGame = useCallback(
        async (gameId: string) => {
            const game = gamesById.get(gameId)
            setLoadingGames((prev) => new Set(prev).add(gameId))

            try {
                await invoke("stop_game", { gameId })

                setRunningGames((prev) => {
                    const next = new Set(prev)
                    next.delete(gameId)
                    return next
                })
                setGameStartTimes((prev) => {
                    const next = new Map(prev)
                    next.delete(gameId)
                    return next
                })
                toast.success(t("toast.gameStopped.title"), {
                    description: t("toast.gameStopped.description", { name: game?.name || "Game" }),
                })
            } catch (error) {
                toast.error(t("toast.failedToStopGame.title"), {
                    description: `${error}`,
                })
            } finally {
                setLoadingGames((prev) => {
                    const next = new Set(prev)
                    next.delete(gameId)
                    return next
                })
            }
        },
        [gamesById, t]
    )

    const handleToggleFavorite = useCallback(
        async (gameId: string) => {
            try {
                const isFavorite = await invoke<boolean>("toggle_favorite", { gameId })
                setFavorites((prev) => {
                    const next = new Set(prev)
                    if (isFavorite) {
                        next.add(gameId)
                    } else {
                        next.delete(gameId)
                    }
                    return next
                })
                const game = gamesById.get(gameId)
                toast.success(
                    isFavorite
                        ? t("toast.addedToFavorites.title")
                        : t("toast.removedFromFavorites.title"),
                    { description: game?.name || gameId }
                )
            } catch (error) {
                toast.error(t("toast.failedToUpdateFavorites.title"), {
                    description: `${error}`,
                })
            }
        },
        [gamesById, t]
    )

    const handleExportFavorites = useCallback(() => {
        const favArray = Array.from(favorites)
        const favGames = favArray
            .map((id) => gamesById.get(id))
            .filter(Boolean)
            .map((g) => ({ id: g!.id, name: g!.name }))
        const payload = { version: 1, favorites: favGames, ids: favArray }
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = "disactivity-favorites.json"
        a.click()
        URL.revokeObjectURL(url)
        toast.success(t("favorites.exported"), {
            description: t("favorites.exportedDesc", { count: favArray.length }),
        })
    }, [favorites, gamesById, t])

    const handleImportFavorites = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = async (ev) => {
            try {
                const data = JSON.parse(ev.target?.result as string)
                const ids: string[] =
                    data.ids ?? data.favorites?.map((f: { id: string }) => f.id) ?? []
                if (!Array.isArray(ids)) throw new Error("Invalid format")

                let added = 0
                for (const id of ids) {
                    if (!favorites.has(id)) {
                        await invoke("add_favorite", { gameId: id }).catch(() => {})
                        added++
                    }
                }
                await fetchFavorites()
                toast.success(t("favorites.imported"), {
                    description: t("favorites.importedDesc", { count: added }),
                })
            } catch {
                toast.error(t("favorites.importError"))
            }
        }
        reader.readAsText(file)
        e.target.value = ""
    }

    const runningGamesInfo = useMemo(() => {
        const map = new Map<string, { game: Game; isLoading: boolean; startTime: number }>()
        runningGames.forEach((gameId) => {
            const game = gamesById.get(gameId)
            if (game) {
                map.set(gameId, {
                    game,
                    isLoading: loadingGames.has(gameId),
                    startTime: gameStartTimes.get(gameId) || Date.now(),
                })
            }
        })
        return map
    }, [runningGames, loadingGames, gamesById, gameStartTimes])

    const handleRefresh = useCallback(() => {
        fetchGames(true).catch(console.error)
    }, [fetchGames])

    return (
        <ErrorBoundary>
            <div className="h-screen flex flex-col bg-background/90 dark:bg-background/80 backdrop-blur-xl font-sans antialiased overflow-hidden">
                <TitleBar
                    runningGames={runningGamesInfo}
                    onStopGame={handleStopGame}
                    autoStopMinutes={settings.autoStopMinutes}
                    settings={settings}
                />
                <NavBar currentPage={activePage} onNavigate={setActivePage} />

                {activePage === "home" && (
                    <HomePage
                        games={allGames}
                        customGameIds={customGames.map((g) => g.id)}
                        isLoading={isLoading}
                        isRefreshing={isRefreshing}
                        runningGames={runningGames}
                        loadingGames={loadingGames}
                        favorites={favorites}
                        gameStartTimes={gameStartTimes}
                        settings={settings}
                        recentlyPlayed={recentlyPlayed}
                        gamesById={gamesById}
                        onRefresh={handleRefresh}
                        onStartGame={handleStartGame}
                        onStopGame={handleStopGame}
                        onToggleFavorite={handleToggleFavorite}
                        onImportFavorites={handleImportFavorites}
                        onExportFavorites={handleExportFavorites}
                        onAddCustomGame={handleAddCustomGame}
                        onDeleteCustomGame={handleDeleteCustomGame}
                        fetchFavorites={fetchFavorites}
                    />
                )}

                {activePage === "settings" && (
                    <SettingsPage
                        settings={settings}
                        onSaveSettings={handleSaveSettings}
                        onRefreshCache={handleRefresh}
                        isRefreshing={isRefreshing}
                    />
                )}

                {activePage === "about" && <AboutPage />}

                <Toaster />
            </div>
        </ErrorBoundary>
    )
}
