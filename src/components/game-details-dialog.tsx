"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { invoke } from "@tauri-apps/api/core"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Loader2, Star, Calendar, Monitor, Tag } from "lucide-react"
import type { Game } from "@/components/game-card"
import type { GameMetadata } from "@/types/discovery"
import { releaseYear, formatIgdbRating } from "@/lib/game-metadata"

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
    const [metadata, setMetadata] = useState<GameMetadata | null>(null)
    const [loadingMeta, setLoadingMeta] = useState(false)

    useEffect(() => {
        if (!open || !game) {
            setMetadata(null)
            return
        }
        setLoadingMeta(true)
        invoke<GameMetadata | null>("fetch_igdb_metadata", { gameName: game.name })
            .then((m) => setMetadata(m))
            .catch(() => setMetadata(null))
            .finally(() => setLoadingMeta(false))
    }, [open, game?.id])

    if (!game) return null

    const win32Exes = (game.executables ?? []).filter((e) => e.os === "win32" && !e.name.startsWith(">"))
    const otherExes = (game.executables ?? []).filter((e) => e.os !== "win32" || e.name.startsWith(">"))

    const year = releaseYear(metadata?.release_date ?? null)
    const ratingStr = formatIgdbRating(metadata?.rating ?? null)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <div className="flex items-center gap-4">
                        <div className="relative h-16 w-16 shrink-0">
                            <img
                                src={getGameIconUrl(game, 256)}
                                alt={game.name}
                                className="h-16 w-16 rounded-xl object-cover bg-muted"
                                onError={(e) => {
                                    ;(e.target as HTMLImageElement).src =
                                        "https://cdn.discordapp.com/embed/avatars/0.png"
                                }}
                            />
                            {metadata?.cover_url && (
                                <img
                                    src={metadata.cover_url}
                                    alt={`${game.name} cover`}
                                    className="absolute inset-0 h-16 w-16 rounded-xl object-cover"
                                    onError={(e) => {
                                        ;(e.target as HTMLImageElement).style.display = "none"
                                    }}
                                />
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <DialogTitle className="text-left leading-tight">{game.name}</DialogTitle>
                            <p className="text-xs text-muted-foreground font-mono mt-0.5">
                                {t("gameCard.id")}: {game.id}
                            </p>
                            {/* Quick metadata strip */}
                            {metadata && (
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    {ratingStr && (
                                        <span className="flex items-center gap-0.5 text-xs text-yellow-500">
                                            <Star className="h-3 w-3 fill-yellow-500" />
                                            {ratingStr}
                                        </span>
                                    )}
                                    {year && (
                                        <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                                            <Calendar className="h-3 w-3" />
                                            {year}
                                        </span>
                                    )}
                                </div>
                            )}
                            {loadingMeta && (
                                <span className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    {t("gameDetails.loadingMeta")}
                                </span>
                            )}
                        </div>
                    </div>
                </DialogHeader>

                <div className="space-y-4">
                    {/* IGDB Genres */}
                    {metadata?.genres && metadata.genres.length > 0 && (
                        <div>
                            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                <Tag className="h-3 w-3" />
                                {t("gameDetails.genres")}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {metadata.genres.map((genre) => (
                                    <Badge key={genre} variant="secondary">{genre}</Badge>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* IGDB Platforms */}
                    {metadata?.platforms && metadata.platforms.length > 0 && (
                        <div>
                            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                <Monitor className="h-3 w-3" />
                                {t("gameDetails.platforms")}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {metadata.platforms.map((p) => (
                                    <Badge key={p} variant="outline">{p}</Badge>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* IGDB Summary */}
                    {metadata?.summary && (
                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                                {t("gameDetails.description")}
                            </p>
                            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
                                {metadata.summary}
                            </p>
                        </div>
                    )}

                    {/* Separator before Discord info if IGDB data shown */}
                    {metadata && (game.aliases?.length || win32Exes.length || otherExes.length) ? (
                        <Separator />
                    ) : null}

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
