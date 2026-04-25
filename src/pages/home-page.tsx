import React, { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import {
    Search,
    RefreshCw,
    Gamepad2,
    Loader2,
    Star,
    Download,
    Upload,
    Clock,
    Plus,
    Flame,
    Sparkles,
    Settings2,
} from "lucide-react"
import { GameCard, type Game } from "@/components/game-card"
import { VirtualGameList } from "@/components/virtual-game-list"
import { DiscoverySection, HeroBanner } from "@/components/discovery-section"
import { GameDetailsDialog } from "@/components/game-details-dialog"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
    PaginationEllipsis,
} from "@/components/ui/pagination"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { AppSettings } from "@/lib/settings"
import type { DiscoveryData, EnrichedDiscoveryGame } from "@/types/discovery"
import { enrichDiscoveryGames } from "@/lib/game-metadata"
import { getGameIconUrl, DEFAULT_GAME_ICON } from "@/lib/game-assets"
import { useDebouncedValueWithFlush } from "@/lib/use-debounced-value"

export interface RecentGame {
    id: string
    playedAt: number
}

interface HomePageProps {
    games: Game[]
    customGameIds: string[]
    isLoading: boolean
    isRefreshing: boolean
    runningGames: Set<string>
    loadingGames: Set<string>
    favorites: Set<string>
    gameStartTimes: Map<string, number>
    settings: AppSettings
    recentlyPlayed: RecentGame[]
    gamesById: Map<string, Game>
    discoveryData: DiscoveryData | null
    hasRawgKey: boolean
    uiNow: number
    onRefresh: () => void
    onStartGame: (game: Game, selectedExecutable?: string) => Promise<void>
    onStopGame: (gameId: string) => Promise<void>
    onToggleFavorite: (gameId: string) => Promise<void>
    onImportFavorites: (e: React.ChangeEvent<HTMLInputElement>) => void
    onExportFavorites: () => void
    onAddCustomGame: (name: string, executable: string) => Promise<void>
    onDeleteCustomGame: (gameId: string) => Promise<void>
    onNavigateToSettings: () => void
}

export function HomePage({
    games,
    customGameIds,
    isLoading,
    isRefreshing,
    runningGames,
    loadingGames,
    favorites,
    gameStartTimes,
    settings,
    recentlyPlayed,
    gamesById,
    discoveryData,
    hasRawgKey,
    uiNow,
    onRefresh,
    onStartGame,
    onStopGame,
    onToggleFavorite,
    onImportFavorites,
    onExportFavorites,
    onAddCustomGame,
    onDeleteCustomGame,
    onNavigateToSettings,
}: HomePageProps) {
    const { t } = useTranslation()
    const [searchQuery, setSearchQuery] = useState("")
    const { debounced: debouncedQuery, flush: flushSearchDebounce } = useDebouncedValueWithFlush(
        searchQuery,
        250
    )
    const [currentPage, setCurrentPage] = useState(1)
    const [addDialogOpen, setAddDialogOpen] = useState(false)
    const [newGameName, setNewGameName] = useState("")
    const [newGameExe, setNewGameExe] = useState("")
    const [isAdding, setIsAdding] = useState(false)
    const [discoveryDetailsOpen, setDiscoveryDetailsOpen] = useState(false)
    const [selectedDiscoveryGame, setSelectedDiscoveryGame] = useState<EnrichedDiscoveryGame | null>(null)
    const [selectedDiscoveryLinkedGame, setSelectedDiscoveryLinkedGame] = useState<Game | null>(null)
    const searchRef = useRef<HTMLInputElement>(null)
    const importFileRef = useRef<HTMLInputElement>(null)
    const scrollViewportRef = useRef<HTMLDivElement | null>(null)
    const customGameIdSet = useMemo(() => new Set(customGameIds), [customGameIds])

    const ITEMS_PER_PAGE = settings.itemsPerPage

    const scrollToTop = useCallback(() => {
        scrollViewportRef.current?.scrollTo({ top: 0, behavior: "smooth" })
    }, [])

    const searchTerms = useMemo(() => {
        return debouncedQuery
            .toLowerCase()
            .split(",")
            .map((term) => term.trim())
            .filter(Boolean)
    }, [debouncedQuery])

    const filteredGames = useMemo(() => {
        if (searchTerms.length === 0) return games
        return games.filter((game) => {
            const gameName = game.name.toLowerCase()
            const gameId = game.id.toLowerCase()
            const gameAliases = game.aliases?.map((alias) => alias.toLowerCase()) || []
            return searchTerms.some((term) => {
                if (gameName.includes(term)) return true
                if (gameId.includes(term)) return true
                return gameAliases.some((alias) => alias.includes(term))
            })
        })
    }, [games, searchTerms])

    useEffect(() => {
        setCurrentPage(1)
    }, [games, debouncedQuery])

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const active = document.activeElement
            const isInInput =
                active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement

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
        onRefresh()
    }

    const handleAddDialogSubmit = async () => {
        if (!newGameName.trim() || !newGameExe.trim()) return
        setIsAdding(true)
        try {
            await onAddCustomGame(newGameName.trim(), newGameExe.trim())
            setNewGameName("")
            setNewGameExe("")
            setAddDialogOpen(false)
        } finally {
            setIsAdding(false)
        }
    }

    const handleOpenDiscoveryDetails = useCallback((game: EnrichedDiscoveryGame, linkedGame?: Game) => {
        setSelectedDiscoveryGame(game)
        setSelectedDiscoveryLinkedGame(linkedGame ?? null)
        setDiscoveryDetailsOpen(true)
    }, [])

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
            for (
                let i = Math.max(2, currentPage - 1);
                i <= Math.min(totalPages - 1, currentPage + 1);
                i++
            ) {
                pages.push(i)
            }
            if (currentPage < totalPages - 2) pages.push("ellipsis")
            pages.push(totalPages)
        }
        return pages
    }, [currentPage, totalPages])

    const goToPage = useCallback(
        (page: number) => {
            const validPage = Math.max(1, Math.min(totalPages, page))
            setCurrentPage(validPage)
            scrollToTop()
        },
        [totalPages, scrollToTop]
    )

    // Recently played — resolved to Game objects
    const recentGames = useMemo(() => {
        return recentlyPlayed
            .map((r) => gamesById.get(r.id))
            .filter((g): g is Game => g !== undefined)
            .slice(0, 8)
    }, [recentlyPlayed, gamesById])

    // Enrich RAWG discovery games with Discord game IDs
    const enrichedTrending = useMemo(() => {
        if (!discoveryData?.trending.length) return []
        return enrichDiscoveryGames(discoveryData.trending, gamesById)
    }, [discoveryData?.trending, gamesById])

    const enrichedNewReleases = useMemo(() => {
        if (!discoveryData?.new_releases.length) return []
        return enrichDiscoveryGames(discoveryData.new_releases, gamesById)
    }, [discoveryData?.new_releases, gamesById])

    // Hero = newest released discovery game with a background image
    const heroGame = useMemo(() => {
        const byNewestRelease = (a: { released: string | null }, b: { released: string | null }) => {
            const aTs = a.released ? Date.parse(a.released) : Number.NaN
            const bTs = b.released ? Date.parse(b.released) : Number.NaN
            const safeA = Number.isNaN(aTs) ? -Infinity : aTs
            const safeB = Number.isNaN(bTs) ? -Infinity : bTs
            return safeB - safeA
        }

        const releaseCandidates = [...enrichedNewReleases]
            .filter((g) => g.background_image)
            .sort(byNewestRelease)
        if (releaseCandidates.length > 0) return releaseCandidates[0]

        const trendingCandidates = [...enrichedTrending]
            .filter((g) => g.background_image)
            .sort(byNewestRelease)
        return trendingCandidates[0] ?? null
    }, [enrichedNewReleases, enrichedTrending])

    // Trending strip = rest of trending (after hero)
    const trendingStrip = useMemo(() => {
        if (!heroGame) return enrichedTrending
        return enrichedTrending.filter((g) => g.rawg_id !== heroGame.rawg_id)
    }, [enrichedTrending, heroGame])

    const hasDiscovery = enrichedTrending.length > 0 || enrichedNewReleases.length > 0

    return (
        <ScrollArea className="flex-1 mt-20" viewportRef={scrollViewportRef}>
            <main className="mx-5 pb-5 overflow-hidden">
                <div className="container mx-auto px-4 py-6 max-w-4xl overflow-hidden">

                    {/* ── Discovery: Hero + Sections ──────────────────────── */}
                    {!isLoading && (
                        <>
                            {hasDiscovery ? (
                                <>
                                    {/* Hero banner */}
                                    {heroGame && (
                                        <HeroBanner
                                            game={heroGame}
                                            discordGame={heroGame.discordGameId ? gamesById.get(heroGame.discordGameId) : undefined}
                                            isRunning={!!heroGame.discordGameId && runningGames.has(heroGame.discordGameId)}
                                            onPlay={onStartGame}
                                            onOpenDetails={handleOpenDiscoveryDetails}
                                        />
                                    )}

                                    {/* Trending Now */}
                                    {trendingStrip.length > 0 && (
                                        <DiscoverySection
                                            title={t("discovery.trending")}
                                            icon={<Flame className="h-4 w-4 text-orange-500" />}
                                            games={trendingStrip}
                                            gamesById={gamesById}
                                            runningGames={runningGames}
                                            onStartGame={onStartGame}
                                            onOpenDetails={handleOpenDiscoveryDetails}
                                        />
                                    )}

                                    {/* New Releases */}
                                    {enrichedNewReleases.length > 0 && (
                                        <DiscoverySection
                                            title={t("discovery.newReleases")}
                                            icon={<Sparkles className="h-4 w-4 text-blue-500" />}
                                            games={enrichedNewReleases}
                                            gamesById={gamesById}
                                            runningGames={runningGames}
                                            onStartGame={onStartGame}
                                            onOpenDetails={handleOpenDiscoveryDetails}
                                        />
                                    )}

                                    <Separator className="mb-6" />
                                </>
                            ) : !hasRawgKey ? (
                                /* Setup prompt when no RAWG key */
                                <div className="mb-6 flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3">
                                    <Sparkles className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground">
                                            {t("discovery.setupTitle")}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {t("discovery.setupDesc")}
                                        </p>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="shrink-0 gap-1.5"
                                        onClick={onNavigateToSettings}
                                    >
                                        <Settings2 className="h-3.5 w-3.5" />
                                        {t("discovery.configure")}
                                    </Button>
                                </div>
                            ) : null}
                        </>
                    )}

                    {/* ── Recently Played ─────────────────────────────────── */}
                    {recentGames.length > 0 && !isLoading && (
                        <div className="mb-6">
                            <div className="flex items-center gap-2 mb-3">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                <h2 className="text-sm font-semibold text-foreground">
                                    {t("home.recentlyPlayed")}
                                </h2>
                            </div>
                            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                                {recentGames.map((game) => (
                                    <button
                                        key={game.id}
                                        onClick={() => onStartGame(game)}
                                        className="flex flex-col items-center gap-1.5 min-w-[72px] p-2 rounded-lg hover:bg-muted/60 transition-colors group"
                                        title={game.name}
                                        aria-label={`Play ${game.name}`}
                                    >
                                        <div className="relative">
                                            <img
                                                src={getGameIconUrl(game, 64)}
                                                alt={game.name}
                                                className="h-12 w-12 rounded-lg object-cover bg-muted shadow-sm group-hover:shadow-md transition-shadow"
                                                loading="lazy"
                                                decoding="async"
                                                onError={(e) => {
                                                    ;(e.target as HTMLImageElement).src = DEFAULT_GAME_ICON
                                                }}
                                            />
                                            {runningGames.has(game.id) && (
                                                <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-background" />
                                            )}
                                        </div>
                                        <span className="text-[10px] text-muted-foreground text-center leading-tight line-clamp-2 w-full">
                                            {game.name}
                                        </span>
                                    </button>
                                ))}
                            </div>
                            <Separator className="mt-4" />
                        </div>
                    )}

                    {/* ── Search + Actions ─────────────────────────────────── */}
                    <div className="flex gap-2 mb-6">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                ref={searchRef}
                                type="text"
                                placeholder={t("search.placeholder")}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") flushSearchDebounce(searchQuery)
                                }}
                                className="pl-10 bg-background"
                                disabled={isLoading}
                                aria-label={t("search.placeholder")}
                            />
                        </div>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setAddDialogOpen(true)}
                                    className="bg-background shrink-0"
                                    aria-label={t("gameCard.addCustom")}
                                >
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">{t("gameCard.addCustom")}</TooltipContent>
                        </Tooltip>
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

                    {/* Add Custom Game Dialog */}
                    <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                        <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                                <DialogTitle>{t("gameCard.addCustom")}</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-2">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-foreground" htmlFor="custom-name">
                                        {t("gameCard.customName")}
                                    </label>
                                    <Input
                                        id="custom-name"
                                        placeholder={t("gameCard.customNamePlaceholder")}
                                        value={newGameName}
                                        onChange={(e) => setNewGameName(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") handleAddDialogSubmit() }}
                                        autoFocus
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-foreground" htmlFor="custom-exe">
                                        {t("gameCard.customExe")}
                                    </label>
                                    <Input
                                        id="custom-exe"
                                        placeholder={t("gameCard.customExePlaceholder")}
                                        value={newGameExe}
                                        onChange={(e) => setNewGameExe(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") handleAddDialogSubmit() }}
                                        className="font-mono"
                                    />
                                    <p className="text-xs text-muted-foreground">{t("gameCard.customExeHint")}</p>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                                    {t("settings.cancel")}
                                </Button>
                                <Button
                                    onClick={handleAddDialogSubmit}
                                    disabled={!newGameName.trim() || !newGameExe.trim() || isAdding}
                                >
                                    {isAdding && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                    {t("gameCard.addCustomConfirm")}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    {/* Loading State */}
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                            <p className="text-muted-foreground">{t("loading.games")}</p>
                        </div>
                    ) : (
                        <>
                            {/* ── Favorites Section ──────────────────────────── */}
                            {favoriteGames.length > 0 && (
                                <div className="mb-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                        <h2 className="text-sm font-semibold text-foreground">
                                            {t("favorites.title")}
                                        </h2>
                                        <span className="text-xs text-muted-foreground">
                                            ({favoriteGames.length})
                                        </span>
                                        <div className="ml-auto flex items-center gap-1">
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6"
                                                        onClick={onExportFavorites}
                                                        disabled={favorites.size === 0}
                                                        aria-label={t("favorites.export")}
                                                    >
                                                        <Download className="h-3.5 w-3.5" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent side="top">
                                                    {t("favorites.export")}
                                                </TooltipContent>
                                            </Tooltip>
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
                                                <TooltipContent side="top">
                                                    {t("favorites.import")}
                                                </TooltipContent>
                                            </Tooltip>
                                        </div>
                                    </div>
                                    <VirtualGameList
                                        games={favoriteGames}
                                        renderItem={(game) => (
                                            <GameCard
                                                game={game}
                                                isRunning={runningGames.has(game.id)}
                                                isLoading={loadingGames.has(game.id)}
                                                isFavorite={true}
                                                startTime={gameStartTimes.get(game.id)}
                                                uiNow={uiNow}
                                                autoStopEnabled={settings.autoStopEnabled}
                                                autoStopMinutes={settings.autoStopMinutes}
                                                isCustom={customGameIdSet.has(game.id)}
                                                onStart={onStartGame}
                                                onStop={onStopGame}
                                                onToggleFavorite={onToggleFavorite}
                                                onDelete={onDeleteCustomGame}
                                            />
                                        )}
                                    />
                                    <Separator className="my-4" />
                                </div>
                            )}

                            {/* Import button when no favorites */}
                            {favoriteGames.length === 0 && (
                                <div className="flex justify-end mb-2">
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
                                        <TooltipContent side="top">
                                            {t("favorites.importDesc")}
                                        </TooltipContent>
                                    </Tooltip>
                                </div>
                            )}

                            {/* Hidden file input */}
                            <input
                                ref={importFileRef}
                                type="file"
                                accept=".json"
                                className="hidden"
                                onChange={onImportFavorites}
                                aria-hidden="true"
                            />

                            {/* ── All Games ──────────────────────────────────── */}
                            {filteredGames.length > 0 && (
                                <div className="flex items-center gap-2 mb-3">
                                    <Gamepad2 className="h-4 w-4 text-muted-foreground" />
                                    <h2 className="text-sm font-semibold text-foreground">
                                        {t("home.allGames")}
                                    </h2>
                                    <span className="text-xs text-muted-foreground">
                                        ({filteredGames.length})
                                    </span>
                                </div>
                            )}

                            {paginatedGames.length > 0 ? (
                                <VirtualGameList
                                    games={paginatedGames}
                                    className="max-h-[min(60vh,36rem)] min-h-0 overflow-y-auto pr-1 -mr-1"
                                    renderItem={(game) => (
                                        <GameCard
                                            game={game}
                                            isRunning={runningGames.has(game.id)}
                                            isLoading={loadingGames.has(game.id)}
                                            isFavorite={favorites.has(game.id)}
                                            startTime={gameStartTimes.get(game.id)}
                                            uiNow={uiNow}
                                            autoStopEnabled={settings.autoStopEnabled}
                                            autoStopMinutes={settings.autoStopMinutes}
                                            isCustom={customGameIdSet.has(game.id)}
                                            onStart={onStartGame}
                                            onStop={onStopGame}
                                            onToggleFavorite={onToggleFavorite}
                                            onDelete={onDeleteCustomGame}
                                        />
                                    )}
                                />
                            ) : filteredGames.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <Gamepad2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                    <p>{t("emptyState.noGamesFound")}</p>
                                </div>
                            ) : null}

                            {totalPages > 1 && (
                                <div className="mt-6 space-y-4">
                                    <Pagination aria-label={t("pagination.label")}>
                                        <PaginationContent>
                                            <PaginationItem>
                                                <PaginationPrevious
                                                    href="#"
                                                    onClick={(e) => {
                                                        e.preventDefault()
                                                        goToPage(currentPage - 1)
                                                    }}
                                                    className={
                                                        currentPage === 1
                                                            ? "pointer-events-none opacity-50"
                                                            : "cursor-pointer"
                                                    }
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
                                                            onClick={(e) => {
                                                                e.preventDefault()
                                                                goToPage(page)
                                                            }}
                                                            isActive={currentPage === page}
                                                            className="cursor-pointer"
                                                            aria-current={
                                                                currentPage === page ? "page" : undefined
                                                            }
                                                        >
                                                            {page}
                                                        </PaginationLink>
                                                    </PaginationItem>
                                                )
                                            )}
                                            <PaginationItem>
                                                <PaginationNext
                                                    href="#"
                                                    onClick={(e) => {
                                                        e.preventDefault()
                                                        goToPage(currentPage + 1)
                                                    }}
                                                    className={
                                                        currentPage === totalPages
                                                            ? "pointer-events-none opacity-50"
                                                            : "cursor-pointer"
                                                    }
                                                    aria-disabled={currentPage === totalPages}
                                                />
                                            </PaginationItem>
                                        </PaginationContent>
                                    </Pagination>

                                    {/* Page Jump */}
                                    <div className="flex items-center justify-center gap-2 text-sm">
                                        <span className="text-muted-foreground">
                                            {t("pagination.goToPage")}
                                        </span>
                                        <Input
                                            type="number"
                                            min={1}
                                            max={totalPages}
                                            className="w-16 h-8 text-center"
                                            aria-label={t("pagination.goToPage")}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    const value = parseInt(
                                                        (e.target as HTMLInputElement).value
                                                    )
                                                    if (!isNaN(value)) {
                                                        goToPage(value)
                                                        ;(e.target as HTMLInputElement).value = ""
                                                    }
                                                }
                                            }}
                                        />
                                        <span className="text-muted-foreground">
                                            {t("pagination.of")} {totalPages}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Footer */}
                            <div className="mt-4 text-center text-sm text-muted-foreground">
                                {filteredGames.length > 0 ? (
                                    <>
                                        {favoriteGames.length > 0 && (
                                            <span>
                                                {favoriteGames.length}{" "}
                                                {favoriteGames.length !== 1
                                                    ? t("footer.favorites")
                                                    : t("footer.favorite")}{" "}
                                                •{" "}
                                            </span>
                                        )}
                                        {t("footer.showing")}{" "}
                                        {nonFavoriteGames.length > 0
                                            ? (currentPage - 1) * ITEMS_PER_PAGE + 1
                                            : 0}
                                        –{Math.min(currentPage * ITEMS_PER_PAGE, nonFavoriteGames.length)}{" "}
                                        {t("pagination.of")} {nonFavoriteGames.length}{" "}
                                        {nonFavoriteGames.length !== 1
                                            ? t("footer.games")
                                            : t("footer.game")}
                                        {totalPages > 1 &&
                                            ` (${t("footer.page")} ${currentPage} ${t("pagination.of")} ${totalPages})`}
                                    </>
                                ) : (
                                    <>{t("footer.noGames")}</>
                                )}
                                <p className="text-xs opacity-60 mt-0.5">{t("shortcuts.hint")}</p>
                            </div>
                        </>
                    )}
                </div>
                <GameDetailsDialog
                    game={selectedDiscoveryLinkedGame}
                    discoveryGame={selectedDiscoveryGame}
                    open={discoveryDetailsOpen}
                    onOpenChange={setDiscoveryDetailsOpen}
                />
            </main>
        </ScrollArea>
    )
}
