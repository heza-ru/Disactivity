"use client"

import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Play, Square, Loader2, Star, ChevronDown, ExternalLink, Copy, Check } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { GameDetailsDialog } from "@/components/game-details-dialog"

export interface Executable {
    name: string
    os?: string
}

export interface Game {
    id: string
    name: string
    icon_hash: string
    executables?: Executable[] | null
    aliases?: string[] | null
}

interface GameCardProps {
    game: Game
    isRunning: boolean
    isLoading: boolean
    isFavorite: boolean
    startTime?: number
    autoStopEnabled?: boolean
    autoStopMinutes?: number
    onStart: (game: Game, selectedExecutable?: string) => void
    onStop: (gameId: string) => void
    onToggleFavorite: (gameId: string) => void
}

function getGameIconUrl(game: Game, size: number = 64): string {
    if (game.icon_hash) {
        return `https://cdn.discordapp.com/app-icons/${game.id}/${game.icon_hash}.png?size=${size}&keep_aspect_ratio=false`
    }
    return "https://cdn.discordapp.com/embed/avatars/0.png"
}

function formatElapsedTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    const pad = (n: number) => n.toString().padStart(2, "0")
    if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    return `${pad(minutes)}:${pad(seconds)}`
}

export function GameCard({
    game,
    isRunning,
    isLoading,
    isFavorite,
    startTime,
    autoStopEnabled = true,
    autoStopMinutes = 15,
    onStart,
    onStop,
    onToggleFavorite,
}: GameCardProps) {
    const { t } = useTranslation()
    const [elapsed, setElapsed] = useState(0)
    const [detailsOpen, setDetailsOpen] = useState(false)
    const [imgLoaded, setImgLoaded] = useState(false)
    const [copied, setCopied] = useState(false)
    const autoStopMs = autoStopMinutes * 60 * 1000

    useEffect(() => {
        if (!isRunning || !startTime) {
            setElapsed(0)
            return
        }
        setElapsed(Date.now() - startTime)
        const interval = setInterval(() => {
            const newElapsed = Date.now() - startTime
            setElapsed(newElapsed)
            if (autoStopEnabled && newElapsed >= autoStopMs) {
                clearInterval(interval)
                onStop(game.id)
            }
        }, 1000)
        return () => clearInterval(interval)
    }, [isRunning, startTime, autoStopEnabled, autoStopMs, game.id, onStop])

    const progress = Math.min((elapsed / autoStopMs) * 100, 100)
    const timerLabel = `${String(autoStopMinutes).padStart(2, "0")}:00`

    const win32Executables = (game.executables || []).filter(
        (exe) => exe.os === "win32" && !exe.name.startsWith(">")
    )
    const hasMultipleExecutables = win32Executables.length > 1

    const handleCopyId = () => {
        navigator.clipboard.writeText(game.id).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        })
    }

    return (
        <>
            <div
                className={`flex items-center gap-4 p-3 rounded-lg border transition-colors overflow-hidden animate-in fade-in-0 slide-in-from-bottom-1 duration-150 ${
                    isRunning
                        ? "border-green-500/50 bg-green-500/10 hover:bg-green-500/15"
                        : isFavorite
                            ? "border-yellow-500/50 bg-yellow-500/17 hover:bg-yellow-500/25"
                            : "border-border/50 bg-card/50 backdrop-blur-sm hover:bg-accent/30"
                }`}
            >
                {/* Game icon — click opens details */}
                <button
                    onClick={() => setDetailsOpen(true)}
                    className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring group"
                    aria-label={t("gameDetails.open", { name: game.name })}
                >
                    {/* Skeleton shown until image loads */}
                    {!imgLoaded && (
                        <div className="absolute inset-0 bg-muted animate-pulse rounded-md" />
                    )}
                    <img
                        src={getGameIconUrl(game, 64)}
                        alt={game.name}
                        loading="lazy"
                        className={`object-cover w-full h-full transition-opacity duration-200 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
                        onLoad={() => setImgLoaded(true)}
                        onError={(e) => {
                            ;(e.target as HTMLImageElement).src = "https://cdn.discordapp.com/embed/avatars/0.png"
                            setImgLoaded(true)
                        }}
                    />
                    {isRunning ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-green-500/20">
                            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                        </div>
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ExternalLink className="h-4 w-4 text-white" />
                        </div>
                    )}
                </button>

                <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="flex items-center gap-2 min-w-0">
                        {/* Game name — click opens details */}
                        <button
                            onClick={() => setDetailsOpen(true)}
                            className="font-medium text-foreground truncate min-w-0 text-left hover:underline focus:outline-none focus-visible:underline"
                            aria-label={t("gameDetails.open", { name: game.name })}
                        >
                            {game.name}
                        </button>
                        {isRunning && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-500 font-medium whitespace-nowrap shrink-0">
                                {formatElapsedTime(elapsed)}
                            </span>
                        )}
                    </div>

                    {/* ID row with copy button */}
                    <div className="flex items-center gap-1 group/id">
                        <span className="text-xs text-muted-foreground font-mono">
                            {t("gameCard.id")}: {game.id}
                        </span>
                        <TooltipProvider delayDuration={300}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={handleCopyId}
                                        className="opacity-0 group-hover/id:opacity-100 transition-opacity p-0.5 rounded text-muted-foreground hover:text-foreground focus:outline-none focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring"
                                        aria-label={t("gameCard.copyId")}
                                    >
                                        {copied
                                            ? <Check className="h-3 w-3 text-green-500" />
                                            : <Copy className="h-3 w-3" />
                                        }
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                    {copied ? t("gameCard.copied") : t("gameCard.copyId")}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>

                    {isRunning && (
                        <div className="mt-1.5 flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                                        progress >= 100 ? "bg-green-500" : "bg-primary"
                                    }`}
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            {autoStopEnabled ? (
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                                    {formatElapsedTime(elapsed)} / {timerLabel}
                                </span>
                            ) : (
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                                    {formatElapsedTime(elapsed)}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <TooltipProvider delayDuration={200}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="shrink-0 h-8 w-8"
                                onClick={() => onToggleFavorite(game.id)}
                                aria-label={isFavorite ? t("favorites.remove") : t("favorites.add")}
                                aria-pressed={isFavorite}
                            >
                                <Star
                                    className={`h-4 w-4 transition-colors ${
                                        isFavorite
                                            ? "fill-yellow-500 text-yellow-500"
                                            : "text-muted-foreground hover:text-yellow-500"
                                    }`}
                                />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                            {isFavorite ? t("favorites.remove") : t("favorites.add")}
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>

                <div className="flex shrink-0">
                    <Button
                        size="sm"
                        onClick={() => isRunning ? onStop(game.id) : onStart(game)}
                        className={`shrink-0 ${!isRunning && hasMultipleExecutables ? "rounded-r-none" : ""}`}
                        variant={isRunning ? "destructive" : "default"}
                        disabled={isLoading}
                        aria-label={isRunning ? `${t("actions.stop")} ${game.name}` : `${t("actions.run")} ${game.name}`}
                    >
                        {isLoading ? (
                            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        ) : isRunning ? (
                            <Square className="h-4 w-4 mr-1.5" />
                        ) : (
                            <Play className="h-4 w-4 mr-1.5" />
                        )}
                        {isRunning ? t("actions.stop") : t("actions.run")}
                    </Button>
                    {!isRunning && hasMultipleExecutables && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    size="sm"
                                    variant="default"
                                    className="rounded-l-none border-l border-l-primary-foreground/20 px-1.5"
                                    disabled={isLoading}
                                    aria-label={t("gameCard.selectExecutable")}
                                >
                                    <ChevronDown className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="max-h-60 overflow-y-auto">
                                {win32Executables.map((exe, idx) => (
                                    <DropdownMenuItem
                                        key={idx}
                                        onClick={() => onStart(game, exe.name)}
                                        className="text-xs font-mono cursor-pointer"
                                    >
                                        {exe.name}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </div>

            <GameDetailsDialog game={game} open={detailsOpen} onOpenChange={setDetailsOpen} />
        </>
    )
}
