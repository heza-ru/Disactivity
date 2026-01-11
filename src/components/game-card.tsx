"use client"

import { Button } from "@/components/ui/button"
import { Play, Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface Game {
    id: string
    name: string
    path: string
    image: string
    description?: string
    genre?: string
    lastPlayed?: string
}

interface GameCardProps {
    game: Game
    onOpen: (game: Game) => void
}

export function GameCard({ game, onOpen }: GameCardProps) {
    return (
        <div className="flex items-center gap-4 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
            <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                <img src={game.image || "/placeholder.svg"} alt={game.name} className="object-cover" />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <h3 className="font-medium text-foreground truncate">{game.name}</h3>
                    <TooltipProvider delayDuration={200}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Info className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                                <div className="space-y-1">
                                    <p className="font-semibold">{game.name}</p>
                                    <p className="text-xs text-muted-foreground">ID: {game.id}</p>
                                    {game.genre && <p className="text-xs">Genre: {game.genre}</p>}
                                    {game.description && <p className="text-xs text-muted-foreground">{game.description}</p>}
                                    {game.lastPlayed && <p className="text-xs text-muted-foreground">Last played: {game.lastPlayed}</p>}
                                    <p className="text-xs text-muted-foreground truncate">Path: {game.path}</p>
                                </div>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
                <span className="text-xs text-muted-foreground font-mono">{game.id}</span>
            </div>

            <Button size="sm" onClick={() => onOpen(game)} className="shrink-0" variant="default">
                <Play className="h-4 w-4 mr-1.5" />
                Open
            </Button>
        </div>
    )
}
