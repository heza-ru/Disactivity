"use client"

import { useRef } from "react"
import { ChevronLeft, ChevronRight, Play, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Game } from "@/components/game-card"
import type { EnrichedDiscoveryGame } from "@/types/discovery"
import { formatRawgRating } from "@/lib/game-metadata"

// ─── Discovery Card ────────────────────────────────────────────────────────────

interface DiscoveryCardProps {
    game: EnrichedDiscoveryGame
    discordGame?: Game
    isRunning: boolean
    onPlay: (game: Game) => void
}

function DiscoveryCard({ game, discordGame, isRunning, onPlay }: DiscoveryCardProps) {
    const rating = formatRawgRating(game.rating)
    const year = game.released ? game.released.slice(0, 4) : null
    const primaryGenre = game.genres[0] ?? null

    return (
        <div className="relative flex-shrink-0 w-40 rounded-xl overflow-hidden bg-muted group cursor-pointer border border-border/40 hover:border-border/80 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg">
            {/* Cover image */}
            {game.background_image ? (
                <img
                    src={game.background_image}
                    alt={game.name}
                    loading="lazy"
                    className="w-full h-52 object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={(e) => {
                        ;(e.target as HTMLImageElement).style.display = "none"
                    }}
                />
            ) : (
                <div className="w-full h-52 bg-gradient-to-br from-muted to-muted-foreground/20 flex items-center justify-center">
                    <span className="text-2xl font-bold text-muted-foreground/30">
                        {game.name[0]}
                    </span>
                </div>
            )}

            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

            {/* Content at bottom */}
            <div className="absolute bottom-0 left-0 right-0 p-2.5 space-y-1">
                <p className="text-white text-xs font-semibold leading-tight line-clamp-2">
                    {game.name}
                </p>

                <div className="flex items-center gap-1.5 flex-wrap">
                    {rating && (
                        <span className="flex items-center gap-0.5 text-[10px] text-yellow-400">
                            <Star className="h-2.5 w-2.5 fill-yellow-400" />
                            {rating}
                        </span>
                    )}
                    {year && (
                        <span className="text-[10px] text-white/60">{year}</span>
                    )}
                    {primaryGenre && (
                        <span className="text-[10px] px-1 py-0.5 rounded bg-white/10 text-white/70 leading-none">
                            {primaryGenre}
                        </span>
                    )}
                </div>

                {/* Play button — visible when Discord game is matched */}
                {discordGame && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            onPlay(discordGame)
                        }}
                        className={`mt-1 w-full flex items-center justify-center gap-1 text-[10px] font-semibold py-1 rounded transition-colors ${
                            isRunning
                                ? "bg-green-500/80 text-white"
                                : "bg-white/15 hover:bg-white/25 text-white"
                        }`}
                        aria-label={`Play ${game.name}`}
                    >
                        <Play className="h-2.5 w-2.5 fill-current" />
                        {isRunning ? "Running" : "Play"}
                    </button>
                )}
            </div>

            {/* "In Library" badge when matched */}
            {discordGame && !isRunning && (
                <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm text-[9px] text-white/80 px-1.5 py-0.5 rounded-full border border-white/10">
                    In Library
                </div>
            )}
        </div>
    )
}

// ─── Discovery Section ─────────────────────────────────────────────────────────

interface DiscoverySectionProps {
    title: string
    icon: React.ReactNode
    games: EnrichedDiscoveryGame[]
    gamesById: Map<string, Game>
    runningGames: Set<string>
    onStartGame: (game: Game) => void
}

export function DiscoverySection({
    title,
    icon,
    games,
    gamesById,
    runningGames,
    onStartGame,
}: DiscoverySectionProps) {
    const scrollRef = useRef<HTMLDivElement>(null)

    if (games.length === 0) return null

    const scroll = (dir: "left" | "right") => {
        if (!scrollRef.current) return
        scrollRef.current.scrollBy({ left: dir === "left" ? -340 : 340, behavior: "smooth" })
    }

    return (
        <div className="mb-6">
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
                {icon}
                <h2 className="text-sm font-semibold text-foreground">{title}</h2>
                <div className="ml-auto flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => scroll("left")}
                        aria-label="Scroll left"
                    >
                        <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => scroll("right")}
                        aria-label="Scroll right"
                    >
                        <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>

            {/* Scroll strip */}
            <div
                ref={scrollRef}
                className="flex gap-3 overflow-x-auto pb-2 scrollbar-none scroll-smooth"
            >
                {games.map((dg) => (
                    <DiscoveryCard
                        key={dg.rawg_id}
                        game={dg}
                        discordGame={dg.discordGameId ? gamesById.get(dg.discordGameId) : undefined}
                        isRunning={!!dg.discordGameId && runningGames.has(dg.discordGameId)}
                        onPlay={onStartGame}
                    />
                ))}
            </div>
        </div>
    )
}

// ─── Hero Banner ───────────────────────────────────────────────────────────────

interface HeroBannerProps {
    game: EnrichedDiscoveryGame
    discordGame?: Game
    isRunning: boolean
    onPlay: (game: Game) => void
}

export function HeroBanner({ game, discordGame, isRunning, onPlay }: HeroBannerProps) {
    const rating = formatRawgRating(game.rating)
    const year = game.released ? game.released.slice(0, 4) : null

    return (
        <div className="relative w-full h-44 rounded-xl overflow-hidden mb-6 group">
            {/* Background */}
            {game.background_image ? (
                <img
                    src={game.background_image}
                    alt={game.name}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    loading="eager"
                    onError={(e) => {
                        ;(e.target as HTMLImageElement).style.display = "none"
                    }}
                />
            ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary/30 to-muted" />
            )}

            {/* Gradient overlay: left-to-right fade */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
            {/* Bottom fade for readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

            {/* Content */}
            <div className="absolute inset-0 flex items-end p-4">
                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        {game.genres.slice(0, 2).map((g) => (
                            <span
                                key={g}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-white/15 text-white/80 border border-white/10"
                            >
                                {g}
                            </span>
                        ))}
                        {year && (
                            <span className="text-[10px] text-white/50">{year}</span>
                        )}
                    </div>
                    <h3 className="text-white font-bold text-base leading-tight line-clamp-1 mb-0.5">
                        {game.name}
                    </h3>
                    {rating && (
                        <div className="flex items-center gap-1">
                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                            <span className="text-xs text-yellow-400 font-medium">{rating}</span>
                        </div>
                    )}
                </div>

                {discordGame && (
                    <Button
                        size="sm"
                        variant={isRunning ? "destructive" : "default"}
                        className="ml-4 shrink-0 gap-1.5 shadow-lg"
                        onClick={() => onPlay(discordGame)}
                        aria-label={`Play ${game.name}`}
                    >
                        <Play className="h-3.5 w-3.5 fill-current" />
                        {isRunning ? "Running" : "Play Now"}
                    </Button>
                )}
            </div>
        </div>
    )
}
