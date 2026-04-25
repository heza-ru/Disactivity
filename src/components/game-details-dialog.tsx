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
import { Loader2, Star, Calendar, Monitor, Tag, Building2, Wrench } from "lucide-react"
import type { Game } from "@/components/game-card"
import type { EnrichedDiscoveryGame, GameMetadata } from "@/types/discovery"
import { releaseYear, formatIgdbRating, formatReleaseDate } from "@/lib/game-metadata"
import { getGameIconUrl, DEFAULT_GAME_ICON } from "@/lib/game-assets"

interface GameDetailsDialogProps {
    game: Game | null
    discoveryGame?: EnrichedDiscoveryGame | null
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function GameDetailsDialog({ game, discoveryGame = null, open, onOpenChange }: GameDetailsDialogProps) {
    const { t } = useTranslation()
    const [metadata, setMetadata] = useState<GameMetadata | null>(null)
    const [loadingMeta, setLoadingMeta] = useState(false)
    const displayName = game?.name ?? discoveryGame?.name ?? ""

    useEffect(() => {
        if (!open || !displayName) {
            setMetadata(null)
            return
        }
        setLoadingMeta(true)
        invoke<GameMetadata | null>("fetch_igdb_metadata", { gameName: displayName })
            .then((m) => setMetadata(m))
            .catch(() => setMetadata(null))
            .finally(() => setLoadingMeta(false))
    }, [open, displayName])

    if (!game && !discoveryGame) return null

    const win32Exes = (game?.executables ?? []).filter((e) => e.os === "win32" && !e.name.startsWith(">"))
    const otherExes = (game?.executables ?? []).filter((e) => e.os !== "win32" || e.name.startsWith(">"))

    const year = releaseYear(metadata?.release_date ?? null)
    const releaseDate = formatReleaseDate(metadata?.release_date ?? null)
    const ratingStr = formatIgdbRating(metadata?.rating ?? null)
    const imageSrc = game
        ? getGameIconUrl(game, 256)
        : discoveryGame?.background_image ?? DEFAULT_GAME_ICON

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <div className="flex items-center gap-4">
                        <div className="relative h-16 w-16 shrink-0">
                            <img
                                src={imageSrc}
                                alt={displayName}
                                loading="lazy"
                                decoding="async"
                                className="h-16 w-16 rounded-xl object-cover bg-muted"
                                onError={(e) => {
                                    ;(e.target as HTMLImageElement).src =
                                        DEFAULT_GAME_ICON
                                }}
                            />
                            {metadata?.cover_url && (
                                <img
                                    src={metadata.cover_url}
                                    alt={`${displayName} cover`}
                                    loading="lazy"
                                    decoding="async"
                                    className="absolute inset-0 h-16 w-16 rounded-xl object-cover"
                                    onError={(e) => {
                                        ;(e.target as HTMLImageElement).style.display = "none"
                                    }}
                                />
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <DialogTitle className="text-left leading-tight">{displayName}</DialogTitle>
                            {game && (
                                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                                    {t("gameCard.id")}: {game.id}
                                </p>
                            )}
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
                                    {discoveryGame?.metacritic != null && (
                                        <span className="text-xs text-green-500">
                                            MC {discoveryGame.metacritic}
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

                    {/* Additional metadata */}
                    {(releaseDate || metadata?.publishers.length || metadata?.developers.length) && (
                        <div className="space-y-2">
                            {releaseDate && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Calendar className="h-3.5 w-3.5" />
                                    <span>{t("gameDetails.releaseDate")}: {releaseDate}</span>
                                </div>
                            )}
                            {metadata?.publishers && metadata.publishers.length > 0 && (
                                <div>
                                    <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                                        <Building2 className="h-3 w-3" />
                                        {t("gameDetails.publishers")}
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {metadata.publishers.map((publisher) => (
                                            <Badge key={publisher} variant="outline">{publisher}</Badge>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {metadata?.developers && metadata.developers.length > 0 && (
                                <div>
                                    <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                                        <Wrench className="h-3 w-3" />
                                        {t("gameDetails.developers")}
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {metadata.developers.map((developer) => (
                                            <Badge key={developer} variant="secondary">{developer}</Badge>
                                        ))}
                                    </div>
                                </div>
                            )}
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
                    {metadata && game && (game.aliases?.length || win32Exes.length || otherExes.length) ? (
                        <Separator />
                    ) : null}

                    {/* Aliases */}
                    {game?.aliases && game.aliases.length > 0 && (
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
                    {game && win32Exes.length > 0 && (
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
                    {game && otherExes.length > 0 && (
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
                    {game && !game.executables?.length && (
                        <p className="text-sm text-muted-foreground">{t("gameDetails.noExecutables")}</p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
