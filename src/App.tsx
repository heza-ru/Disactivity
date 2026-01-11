"use client"

import type React from "react"

import { useState, useEffect, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { invoke } from "@tauri-apps/api/core"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Toaster } from "@/components/ui/sonner"
import { Search, RefreshCw, Gamepad2, Loader2, Star } from "lucide-react"
import { GameCard, type Game } from "@/components/game-card"
import { TitleBar } from "@/components/title-bar"
import { Separator } from "@/components/ui/separator"
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
    PaginationEllipsis,
} from "@/components/ui/pagination"

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
    const ITEMS_PER_PAGE = 50

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
        fetchGames()
        fetchFavorites()
    }, [])

    const handleSearch = () => {
        const query = searchQuery.toLowerCase().trim()
        setCurrentPage(1)
        if (!query) {
            setFilteredGames(games)
            return
        }
        const results = games.filter(
            (game) => game.name.toLowerCase().includes(query) || game.id.toLowerCase().includes(query),
        )
        setFilteredGames(results)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleSearch()
        }
    }

    const handleRefresh = () => {
        setSearchQuery("")
        fetchGames(true)
    }

    const handleStartGame = async (game: Game) => {
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
            })

            setRunningGames((prev) => new Set(prev).add(game.id))
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
    }

    const handleStopGame = async (gameId: string) => {
        const game = games.find((g) => g.id === gameId)
        setLoadingGames((prev) => new Set(prev).add(gameId))

        try {
            await invoke("stop_game", { gameId })

            setRunningGames((prev) => {
                const next = new Set(prev)
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
    }

    const handleToggleFavorite = async (gameId: string) => {
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
            const game = games.find((g) => g.id === gameId)
            toast.success(isFavorite ? t("toast.addedToFavorites.title") : t("toast.removedFromFavorites.title"), {
                description: game?.name || gameId,
            })
        } catch (error) {
            toast.error(t("toast.failedToUpdateFavorites.title"), {
                description: `${error}`,
            })
        }
    }

    // Separate favorites and non-favorites from filtered games
    const { favoriteGames, nonFavoriteGames } = useMemo(() => {
        const favs = filteredGames.filter((game) => favorites.has(game.id))
        const nonFavs = filteredGames.filter((game) => !favorites.has(game.id))
        return { favoriteGames: favs, nonFavoriteGames: nonFavs }
    }, [filteredGames, favorites])

    // Pagination only applies to non-favorite games
    const totalPages = Math.ceil(nonFavoriteGames.length / ITEMS_PER_PAGE)
    const paginatedGames = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
        return nonFavoriteGames.slice(startIndex, startIndex + ITEMS_PER_PAGE)
    }, [nonFavoriteGames, currentPage])

    const goToPage = (page: number) => {
        const validPage = Math.max(1, Math.min(totalPages, page))
        setCurrentPage(validPage)
        // Scroll to top of the game list
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const getPageNumbers = () => {
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
    }

    return (
        <div className="h-screen flex flex-col bg-background/90 dark:bg-background/80 backdrop-blur-xl font-sans antialiased overflow-hidden">
            <TitleBar />

            <main className="flex-1 overflow-y-auto mt-10 mx-5 pb-5">
                <div className="container mx-auto px-4 py-6 max-w-4xl">

                    {/* Search Bar */}
                    <div className="flex gap-2 mb-6">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="text"
                                placeholder={t("search.placeholder")}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="pl-10 bg-background"
                                disabled={isLoading}
                            />
                        </div>
                        <Button onClick={handleSearch} disabled={isLoading}>
                            <Search className="h-4 w-4 mr-2" />
                            {t("search.button")}
                        </Button>
                        <Button variant="outline" onClick={handleRefresh} disabled={isLoading || isRefreshing} className="bg-background">
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
                                    </div>
                                    <div className="space-y-1">
                                        {favoriteGames.map((game) => (
                                            <GameCard
                                                key={game.id}
                                                game={game}
                                                isRunning={runningGames.has(game.id)}
                                                isLoading={loadingGames.has(game.id)}
                                                isFavorite={true}
                                                onStart={handleStartGame}
                                                onStop={handleStopGame}
                                                onToggleFavorite={handleToggleFavorite}
                                            />
                                        ))}
                                    </div>
                                    <Separator className="my-4" />
                                </div>
                            )}

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
                                    <Pagination>
                                        <PaginationContent>
                                            <PaginationItem>
                                                <PaginationPrevious
                                                    href="#"
                                                    onClick={(e) => {
                                                        e.preventDefault()
                                                        goToPage(currentPage - 1)
                                                    }}
                                                    className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                                />
                                            </PaginationItem>
                                            {getPageNumbers().map((page, index) =>
                                                page === "ellipsis" ? (
                                                    <PaginationItem key={`ellipsis-${index}`}>
                                                        <PaginationEllipsis />
                                                    </PaginationItem>
                                                ) : (
                                                    <PaginationItem key={page}>
                                                        <PaginationLink
                                                            href="#"
                                                            onClick={(e) => {
                                                                e.preventDefault()
                                                                goToPage(page)
                                                            }}
                                                            isActive={currentPage === page}
                                                            className="cursor-pointer"
                                                        >
                                                            {page}
                                                        </PaginationLink>
                                                    </PaginationItem>
                                                ),
                                            )}
                                            <PaginationItem>
                                                <PaginationNext
                                                    href="#"
                                                    onClick={(e) => {
                                                        e.preventDefault()
                                                        goToPage(currentPage + 1)
                                                    }}
                                                    className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
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
                                        {t("footer.showing")} {nonFavoriteGames.length > 0 ? ((currentPage - 1) * ITEMS_PER_PAGE) + 1 : 0}-{Math.min(currentPage * ITEMS_PER_PAGE, nonFavoriteGames.length)} {t("pagination.of")} {nonFavoriteGames.length} {nonFavoriteGames.length !== 1 ? t("footer.games") : t("footer.game")}
                                        {totalPages > 1 && ` (${t("footer.page")} ${currentPage} ${t("pagination.of")} ${totalPages})`}
                                    </>
                                ) : (
                                    <>{t("footer.noGames")}</>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </main>
            <Toaster />
        </div>
    )
}
