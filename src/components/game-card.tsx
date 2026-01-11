"use client"

import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Info, Play, Square, Loader2, Star } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export interface Executable {
    name: string
    os?: string
}

export interface Game {
    id: string
    name: string
    icon_hash: string
    executables?: Executable[] | null
}

interface GameCardProps {
    game: Game
    isRunning: boolean
    isLoading: boolean
    isFavorite: boolean
    onStart: (game: Game) => void
    onStop: (gameId: string) => void
    onToggleFavorite: (gameId: string) => void
}

function getGameIconUrl(game: Game, size: number = 64): string {
    if (game.icon_hash) {
        return `https://cdn.discordapp.com/app-icons/${game.id}/${game.icon_hash}.png?size=${size}&keep_aspect_ratio=false`
    }
    return "https://cdn.discordapp.com/embed/avatars/0.png"
}

export function GameCard({ game, isRunning, isLoading, isFavorite, onStart, onStop, onToggleFavorite }: GameCardProps) {
    const { t } = useTranslation()

    const handleClick = () => {
        if (isRunning) {
            onStop(game.id)
        } else {
            onStart(game)
        }
    }

    return (
        <div className={`flex items-center gap-4 p-3 rounded-lg border transition-colors ${
            isRunning 
                ? "border-green-500/50 bg-green-500/10 hover:bg-green-500/15" 
                : isFavorite
                    ? "border-yellow-500/50 bg-yellow-500/17 hover:bg-yellow-500/25"
                    : "border-border/50 bg-card/50 backdrop-blur-sm hover:bg-accent/30"
        }`}>
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted/50">
                <img
                    src={getGameIconUrl(game, 128)}
                    alt={game.name}
                    className="object-cover w-full h-full"
                    onError={(e) => {
                        (e.target as HTMLImageElement).src = "/placeholder.svg"
                    }}
                />
                {isRunning && (
                    <div className="absolute inset-0 flex items-center justify-center bg-green-500/20">
                        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                    </div>
                )}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <h3 className="font-medium text-foreground truncate">{game.name}</h3>
                    {isRunning && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-500 font-medium">
                            {t("gameCard.running")}
                        </span>
                    )}
                    <TooltipProvider delayDuration={200}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Info className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                                <div className="space-y-1">
                                    <p className="font-semibold">{game.name}</p>
                                    <p className="text-xs text-muted-foreground">{t("gameCard.id")}: {game.id}</p>
                                    {game.executables && game.executables.length > 0 && (
                                        <div className="text-xs">
                                            <p className="font-medium">{t("gameCard.executables")}:</p>
                                            <ul className="list-disc list-inside max-h-32 overflow-y-auto">
                                                {game.executables.map((exe, idx) => (
                                                    <li key={idx} className="text-muted-foreground truncate">
                                                        {exe.name} {exe.os && <span className="opacity-70">({exe.os})</span>}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
                <span className="text-xs text-muted-foreground font-mono">{t("gameCard.id")}: {game.id}</span>
            </div>

            <TooltipProvider delayDuration={200}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="shrink-0 h-8 w-8"
                            onClick={() => onToggleFavorite(game.id)}
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

            <Button
                size="sm"
                onClick={handleClick}
                className="shrink-0"
                variant={isRunning ? "destructive" : "default"}
                disabled={isLoading}
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
        </div>
    )
}
