"use client"

import { useTranslation } from "react-i18next"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import type { Game } from "@/components/game-card"

interface GameDetailsDialogProps {
    game: Game | null
    open: boolean
    onOpenChange: (open: boolean) => void
}

function getGameIconUrl(game: Game, size: number = 256): string {
    if (game.icon_hash) {
        return `https://cdn.discordapp.com/app-icons/${game.id}/${game.icon_hash}.png?size=${size}&keep_aspect_ratio=false`
    }
    return "https://cdn.discordapp.com/embed/avatars/0.png"
}

export function GameDetailsDialog({ game, open, onOpenChange }: GameDetailsDialogProps) {
    const { t } = useTranslation()

    if (!game) return null

    const win32Exes = (game.executables ?? []).filter((e) => e.os === "win32" && !e.name.startsWith(">"))
    const otherExes = (game.executables ?? []).filter((e) => e.os !== "win32" || e.name.startsWith(">"))

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <div className="flex items-center gap-4">
                        <img
                            src={getGameIconUrl(game, 256)}
                            alt={game.name}
                            className="h-16 w-16 rounded-xl object-cover bg-muted shrink-0"
                            onError={(e) => {
                                (e.target as HTMLImageElement).src = "https://cdn.discordapp.com/embed/avatars/0.png"
                            }}
                        />
                        <div className="min-w-0">
                            <DialogTitle className="text-left leading-tight">{game.name}</DialogTitle>
                            <p className="text-xs text-muted-foreground font-mono mt-0.5">
                                {t("gameCard.id")}: {game.id}
                            </p>
                        </div>
                    </div>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Aliases */}
                    {game.aliases && game.aliases.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                {t("gameDetails.aliases")}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {game.aliases.map((alias, i) => (
                                    <Badge key={i} variant="secondary">{alias}</Badge>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Win32 Executables */}
                    {win32Exes.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                {t("gameDetails.win32Executables")}
                            </p>
                            <ul className="space-y-1">
                                {win32Exes.map((exe, i) => (
                                    <li key={i} className="text-xs font-mono bg-muted/40 rounded px-2 py-1 truncate">
                                        {exe.name}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Other executables */}
                    {otherExes.length > 0 && (
                        <>
                            <Separator />
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                    {t("gameDetails.otherExecutables")}
                                </p>
                                <ul className="space-y-1 max-h-32 overflow-y-auto">
                                    {otherExes.map((exe, i) => (
                                        <li key={i} className="flex items-center gap-2 text-xs font-mono bg-muted/40 rounded px-2 py-1">
                                            <span className="truncate flex-1">{exe.name}</span>
                                            {exe.os && (
                                                <Badge variant="outline" className="shrink-0">{exe.os}</Badge>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </>
                    )}

                    {/* No executables fallback */}
                    {!game.executables?.length && (
                        <p className="text-sm text-muted-foreground">{t("gameDetails.noExecutables")}</p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
