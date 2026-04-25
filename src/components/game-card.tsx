import { useState, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Play, Square, Loader2, Star, ChevronDown, ExternalLink, Copy, Check, Trash2 } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { GameDetailsDialog } from "@/components/game-details-dialog"
import { getGameIconUrl, DEFAULT_GAME_ICON } from "@/lib/game-assets"
import { formatElapsedTime } from "@/lib/format-time"

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
    /** Wall clock tick from the app shell; updates ~1s while any game is running. */
    uiNow: number
    autoStopEnabled?: boolean
    autoStopMinutes?: number
    isCustom?: boolean
    onStart: (game: Game, selectedExecutable?: string) => void
    onStop: (gameId: string) => void
    onToggleFavorite: (gameId: string) => void
    onDelete?: (gameId: string) => void
}

export function GameCard({
    game,
    isRunning,
    isLoading,
    isFavorite,
    startTime,
    uiNow,
    autoStopEnabled = true,
    autoStopMinutes = 15,
    isCustom = false,
    onStart,
    onStop,
    onToggleFavorite,
    onDelete,
}: GameCardProps) {
    const { t } = useTranslation()
    const [detailsOpen, setDetailsOpen] = useState(false)
    const [imgLoaded, setImgLoaded] = useState(false)
    const [copied, setCopied] = useState(false)
    const autoStopFired = useRef(false)
    const autoStopMs = autoStopMinutes * 60 * 1000

    const elapsed =
        isRunning && startTime != null
            ? Math.max(0, uiNow - startTime)
            : 0

    useEffect(() => {
        autoStopFired.current = false
    }, [isRunning, startTime])

    useEffect(() => {
        if (!isRunning || !startTime || !autoStopEnabled) return
        if (autoStopFired.current) return
        if (elapsed < autoStopMs) return
        autoStopFired.current = true
        onStop(game.id)
    }, [isRunning, startTime, autoStopEnabled, autoStopMs, elapsed, game.id, onStop])

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
                className={`flex items-center gap-4 p-3 rounded-lg border transition-colors overflow-hidden animate-in fade-in-0 slide-in-from-bottom-1 duration-150 max-sm:gap-2 max-sm:p-2 ${
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
                    className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring group max-sm:h-11 max-sm:w-11"
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
                        decoding="async"
                        className={`object-cover w-full h-full transition-opacity duration-200 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
                        onLoad={() => setImgLoaded(true)}
                        onError={(e) => {
                            ;(e.target as HTMLImageElement).src = DEFAULT_GAME_ICON
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
                            className="font-medium text-foreground truncate min-w-0 text-left hover:underline focus:outline-none focus-visible:underline max-sm:text-sm"
                            aria-label={t("gameDetails.open", { name: game.name })}
                        >
                            {game.name}
                        </button>
                        {isCustom && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground font-medium whitespace-nowrap shrink-0">
                                {t("gameCard.custom")}
                            </span>
                        )}
                        {isRunning && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-500 font-medium whitespace-nowrap shrink-0 max-sm:text-[10px] max-sm:px-1">
                                {formatElapsedTime(elapsed)}
                            </span>
                        )}
                    </div>

                    {/* ID row with copy button */}
                    <div className="flex items-center gap-1 group/id">
                        <span className="text-xs text-muted-foreground font-mono">
                            {t("gameCard.id")}: {game.id}
                        </span>
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

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="shrink-0 h-8 w-8"
                            onClick={() => isCustom ? onDelete?.(game.id) : onToggleFavorite(game.id)}
                            aria-label={
                                isCustom
                                    ? t("gameCard.deleteCustom")
                                    : isFavorite ? t("favorites.remove") : t("favorites.add")
                            }
                            aria-pressed={isCustom ? undefined : isFavorite}
                        >
                            {isCustom ? (
                                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive transition-colors" />
                            ) : (
                                <Star
                                    className={`h-4 w-4 transition-colors ${
                                        isFavorite
                                            ? "fill-yellow-500 text-yellow-500"
                                            : "text-muted-foreground hover:text-yellow-500"
                                    }`}
                                />
                            )}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                        {isCustom
                            ? t("gameCard.deleteCustom")
                            : isFavorite ? t("favorites.remove") : t("favorites.add")
                        }
                    </TooltipContent>
                </Tooltip>

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
