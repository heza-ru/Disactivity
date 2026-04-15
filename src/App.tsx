"use client"

import type React from "react"

import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { invoke } from "@tauri-apps/api/core"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Toaster } from "@/components/ui/sonner"
import { Search, RefreshCw, Gamepad2, Loader2, Star, Download, Upload } from "lucide-react"
import { GameCard, type Game } from "@/components/game-card"
import { TitleBar } from "@/components/title-bar"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ErrorBoundary } from "@/components/error-boundary"
import { loadSettings, saveSettings, type AppSettings } from "@/lib/settings"
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
    PaginationEllipsis,
} from "@/components/ui/pagination"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface FetchGamesResponse {
    games: Game[]
    from_cache: boolean
}

export default function GameLauncher() {
    const { t } = useTranslation()
    const [searchQuery, setSearchQuery] = useState("")
    const [games, setGames] = useState<Game[]>([])
    const [filteredGames, setFilteredGames] = useState<Game[]>([])
    const [currentPage, setCurrentPage] = useState(1)
    const [isLoading, setIsLoading] = useState(true)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [runningGames, setRunningGames] = useState<Set<string>>(new Set())
    const [loadingGames, setLoadingGames] = useState<Set<string>>(new Set())
    const [favorites, setFavorites] = useState<Set<string>>(new Set())
    const [gameStartTimes, setGameStartTimes] = useState<Map<string, number>>(new Map())
    const [settings, setSettings] = useState<AppSettings>(loadSettings)
    const searchRef = useRef<HTMLInputElement>(null)
    const importFileRef = useRef<HTMLInputElement>(null)

    const ITEMS_PER_PAGE = settings.itemsPerPage

    // O(1) game lookup — avoids repeated games.find() across handlers
    const gamesById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games])

    const scrollToTop = useCallback(() => {
        document
            .querySelector<HTMLDivElement>('[data-slot="scroll-area-viewport"]')
            ?.scrollTo({ top: 0, behavior: "smooth" })
    }, [])

    const handleSaveSettings = useCallback((next: AppSettings) => {
        setSettings(next)
        saveSettings(next)
        toast.success(t("settings.saved"))
    }, [t])

    const fetchGames = async (forceRefresh: boolean = false) => {
        try {
            if (forceRefresh) {
                setIsRefreshing(true)
            } else {
                setIsLoading(true)
            }

            const response = await invoke<FetchGamesResponse>("fetch_games", { forceRefresh })
            setGames(response.games)
            setFilteredGames(response.games)
            setCurrentPage(1)

            if (forceRefresh) {
                toast.success(t("toast.refreshed.title"), {
                    description: t("toast.refreshed.description", { count: response.games.length }),
                })
            } else if (response.from_cache) {
                toast.info(t("toast.loadedFromCache.title"), {
                    description: t("toast.loadedFromCache.description", { count: response.games.length }),
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
    }

    const fetchFavorites = async () => {
        try {
            const favs = await invoke<string[]>("get_favorites")
            setFavorites(new Set(favs))
        } catch (error) {
            console.error("Failed to load favorites:", error)
        }
    }

    useEffect(() => {
        fetchGames().catch(console.error)
        fetchFavorites().catch(console.error)
    }, [])

    // Live search — debounced 250 ms. Runs immediately when games list loads.
    const filterGames = useCallback((query: string) => {
        const q = query.toLowerCase().trim()
        setCurrentPage(1)
        if (!q) {
            setFilteredGames(games)
        } else {
            setFilteredGames(
                games.filter(
                    (game) =>
                        game.name.toLowerCase().includes(q) ||
                        game.id.toLowerCase().includes(q) ||
                        game.aliases?.some((alias) => alias.toLowerCase().includes(q))
                )
            )
        }
        scrollToTop()
    }, [games, scrollToTop])

    useEffect(() => {
        const timer = setTimeout(() => filterGames(searchQuery), 250)
        return () => clearTimeout(timer)
    }, [searchQuery, filterGames])

    // Global keyboard shortcuts
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const active = document.activeElement
            const isInInput = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement

            if ((e.key === "/" && !isInInput) || (e.ctrlKey && e.key === "f")) {
                e.preventDefault()
                searchRef.current?.focus()
                searchRef.current?.select()
                return
            }

            if (e.key === "Escape" && isInInput) {
                e.preventDefault()
                setSearchQuery("")
                ;(active as HTMLInputElement).blur()
            }
        }
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [])

    const handleRefresh = () => {
        setSearchQuery("")
        fetchGames(true).catch(console.error)
    }

    const handleStartGame = useCallback(async (game: Game, selectedExecutable?: string) => {
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
            })

            setRunningGames((prev) => new Set(prev).add(game.id))
            setGameStartTimes((prev) => new Map(prev).set(game.id, Date.now()))
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
    }, [t])

    const handleStopGame = useCallback(async (gameId: string) => {
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
    }, [gamesById, t])

    const handleToggleFavorite = useCallback(async (gameId: string) => {
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
            toast.success(isFavorite ? t("toast.addedToFavorites.title") : t("toast.removedFromFavorites.title"), {
                description: game?.name || gameId,
            })
        } catch (error) {
            toast.error(t("toast.failedToUpdateFavorites.title"), {
                description: `${error}`,
            })
        }
    }, [gamesById, t])

    // Export favorites as JSON download
    const handleExportFavorites = useCallback(() => {
        const favArray = Array.from(favorites)
        const favGames = Array.from(favorites)
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

    // Import favorites from JSON file
    const handleImportFavorites = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = async (ev) => {
            try {
                const data = JSON.parse(ev.target?.result as string)
                const ids: string[] = data.ids ?? data.favorites?.map((f: { id: string }) => f.id) ?? []
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

    const { favoriteGames, nonFavoriteGames } = useMemo(() => {
        const favs = filteredGames.filter((game) => favorites.has(game.id))
        const nonFavs = filteredGames.filter((game) => !favorites.has(game.id))
        return { favoriteGames: favs, nonFavoriteGames: nonFavs }
    }, [filteredGames, favorites])

    const totalPages = Math.ceil(nonFavoriteGames.length / ITEMS_PER_PAGE)

    const paginatedGames = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
        return nonFavoriteGames.slice(startIndex, startIndex + ITEMS_PER_PAGE)
    }, [nonFavoriteGames, currentPage, ITEMS_PER_PAGE])

    const pageNumbers = useMemo(() => {
        const pages: (number | "ellipsis")[] = []
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pages.push(i)
        } else {
            pages.push(1)
            if (currentPage > 3) pages.push("ellipsis")
            for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
                pages.push(i)
            }
            if (currentPage < totalPages - 2) pages.push("ellipsis")
            pages.push(totalPages)
        }
        return pages
    }, [currentPage, totalPages])

    const goToPage = useCallback((page: number) => {
        const validPage = Math.max(1, Math.min(totalPages, page))
        setCurrentPage(validPage)
        scrollToTop()
    }, [totalPages, scrollToTop])

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

    return (
        <ErrorBoundary>
            <div className="h-screen flex flex-col bg-background/90 dark:bg-background/80 backdrop-blur-xl font-sans antialiased overflow-hidden">
                <TitleBar
                    runningGames={runningGamesInfo}
                    onStopGame={handleStopGame}
                    settings={settings}
                    onSaveSettings={handleSaveSettings}
                    autoStopMinutes={settings.autoStopMinutes}
                />

                <ScrollArea className="flex-1 mt-10">
                    <main className="mx-5 pb-5 overflow-hidden">
                        <div className="container mx-auto px-4 py-6 max-w-4xl overflow-hidden">

                            {/* Search Bar */}
                            <div className="flex gap-2 mb-6">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        ref={searchRef}
                                        type="text"
                                        placeholder={t("search.placeholder")}
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") filterGames(searchQuery) }}
                                        className="pl-10 bg-background"
                                        disabled={isLoading}
                                        aria-label={t("search.placeholder")}
                                    />
                                </div>
                                <Button
                                    variant="outline"
                                    onClick={handleRefresh}
                                    disabled={isLoading || isRefreshing}
                                    className="bg-background"
                                    aria-label={t("actions.refresh")}
                                >
                                    {isRefreshing ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <RefreshCw className="h-4 w-4 mr-2" />
                                    )}
                                    {t("actions.refresh")}
                                </Button>
                            </div>

                            {/* Loading State */}
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center py-20">
                                    <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                                    <p className="text-muted-foreground">{t("loading.games")}</p>
                                </div>
                            ) : (
                                <>
                                    {/* Favorites Section */}
                                    {favoriteGames.length > 0 && (
                                        <div className="mb-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                                <h2 className="text-sm font-semibold text-foreground">{t("favorites.title")}</h2>
                                                <span className="text-xs text-muted-foreground">({favoriteGames.length})</span>
                                                <div className="ml-auto flex items-center gap-1">
                                                    <TooltipProvider delayDuration={200}>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-6 w-6"
                                                                    onClick={handleExportFavorites}
                                                                    disabled={favorites.size === 0}
                                                                    aria-label={t("favorites.export")}
                                                                >
                                                                    <Download className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent side="top">{t("favorites.export")}</TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                    <TooltipProvider delayDuration={200}>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-6 w-6"
                                                                    onClick={() => importFileRef.current?.click()}
                                                                    aria-label={t("favorites.import")}
                                                                >
                                                                    <Upload className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent side="top">{t("favorites.import")}</TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                {favoriteGames.map((game) => (
                                                    <GameCard
                                                        key={game.id}
                                                        game={game}
                                                        isRunning={runningGames.has(game.id)}
                                                        isLoading={loadingGames.has(game.id)}
                                                        isFavorite={true}
                                                        startTime={gameStartTimes.get(game.id)}
                                                        autoStopEnabled={settings.autoStopEnabled}
                                                        autoStopMinutes={settings.autoStopMinutes}
                                                        onStart={handleStartGame}
                                                        onStop={handleStopGame}
                                                        onToggleFavorite={handleToggleFavorite}
                                                    />
                                                ))}
                                            </div>
                                            <Separator className="my-4" />
                                        </div>
                                    )}

                                    {/* Import button when no favorites yet */}
                                    {favoriteGames.length === 0 && (
                                        <div className="flex justify-end mb-2">
                                            <TooltipProvider delayDuration={200}>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 text-xs text-muted-foreground"
                                                            onClick={() => importFileRef.current?.click()}
                                                            aria-label={t("favorites.importDesc")}
                                                        >
                                                            <Upload className="h-3.5 w-3.5 mr-1.5" />
                                                            {t("favorites.import")}
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top">{t("favorites.importDesc")}</TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </div>
                                    )}

                                    {/* Hidden file input for import */}
                                    <input
                                        ref={importFileRef}
                                        type="file"
                                        accept=".json"
                                        className="hidden"
                                        onChange={handleImportFavorites}
                                        aria-hidden="true"
                                    />

                                    {/* Game list */}
                                    <div className="space-y-1">
                                        {paginatedGames.length > 0 ? (
                                            paginatedGames.map((game) => (
                                                <GameCard
                                                    key={game.id}
                                                    game={game}
                                                    isRunning={runningGames.has(game.id)}
                                                    isLoading={loadingGames.has(game.id)}
                                                    isFavorite={favorites.has(game.id)}
                                                    startTime={gameStartTimes.get(game.id)}
                                                    autoStopEnabled={settings.autoStopEnabled}
                                                    autoStopMinutes={settings.autoStopMinutes}
                                                    onStart={handleStartGame}
                                                    onStop={handleStopGame}
                                                    onToggleFavorite={handleToggleFavorite}
                                                />
                                            ))
                                        ) : filteredGames.length === 0 ? (
                                            <div className="text-center py-12 text-muted-foreground">
                                                <Gamepad2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                                <p>{t("emptyState.noGamesFound")}</p>
                                            </div>
                                        ) : null}
                                    </div>

                                    {totalPages > 1 && (
                                        <div className="mt-6 space-y-4">
                                            <Pagination aria-label={t("pagination.label")}>
                                                <PaginationContent>
                                                    <PaginationItem>
                                                        <PaginationPrevious
                                                            href="#"
                                                            onClick={(e) => { e.preventDefault(); goToPage(currentPage - 1) }}
                                                            className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                                            aria-disabled={currentPage === 1}
                                                        />
                                                    </PaginationItem>
                                                    {pageNumbers.map((page, index) =>
                                                        page === "ellipsis" ? (
                                                            <PaginationItem key={`ellipsis-${index}`}>
                                                                <PaginationEllipsis />
                                                            </PaginationItem>
                                                        ) : (
                                                            <PaginationItem key={page}>
                                                                <PaginationLink
                                                                    href="#"
                                                                    onClick={(e) => { e.preventDefault(); goToPage(page) }}
                                                                    isActive={currentPage === page}
                                                                    className="cursor-pointer"
                                                                    aria-current={currentPage === page ? "page" : undefined}
                                                                >
                                                                    {page}
                                                                </PaginationLink>
                                                            </PaginationItem>
                                                        ),
                                                    )}
                                                    <PaginationItem>
                                                        <PaginationNext
                                                            href="#"
                                                            onClick={(e) => { e.preventDefault(); goToPage(currentPage + 1) }}
                                                            className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                                            aria-disabled={currentPage === totalPages}
                                                        />
                                                    </PaginationItem>
                                                </PaginationContent>
                                            </Pagination>

                                            {/* Page Jump */}
                                            <div className="flex items-center justify-center gap-2 text-sm">
                                                <span className="text-muted-foreground">{t("pagination.goToPage")}</span>
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    max={totalPages}
                                                    className="w-16 h-8 text-center"
                                                    aria-label={t("pagination.goToPage")}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") {
                                                            const value = parseInt((e.target as HTMLInputElement).value)
                                                            if (!isNaN(value)) {
                                                                goToPage(value)
                                                                ;(e.target as HTMLInputElement).value = ""
                                                            }
                                                        }
                                                    }}
                                                />
                                                <span className="text-muted-foreground">{t("pagination.of")} {totalPages}</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Footer */}
                                    <div className="mt-4 text-center text-sm text-muted-foreground">
                                        {filteredGames.length > 0 ? (
                                            <>
                                                {favoriteGames.length > 0 && (
                                                    <span>{favoriteGames.length} {favoriteGames.length !== 1 ? t("footer.favorites") : t("footer.favorite")} • </span>
                                                )}
                                                {t("footer.showing")} {nonFavoriteGames.length > 0 ? ((currentPage - 1) * ITEMS_PER_PAGE) + 1 : 0}–{Math.min(currentPage * ITEMS_PER_PAGE, nonFavoriteGames.length)} {t("pagination.of")} {nonFavoriteGames.length} {nonFavoriteGames.length !== 1 ? t("footer.games") : t("footer.game")}
                                                {totalPages > 1 && ` (${t("footer.page")} ${currentPage} ${t("pagination.of")} ${totalPages})`}
                                            </>
                                        ) : (
                                            <>{t("footer.noGames")}</>
                                        )}
                                        <p>Copyright © 2026 holasoyender</p>
                                        <p className="text-xs opacity-60 mt-0.5">{t("shortcuts.hint")}</p>
                                    </div>
                                </>
                            )}
                        </div>
                    </main>
                </ScrollArea>
                <Toaster />
            </div>
        </ErrorBoundary>
    )
}
