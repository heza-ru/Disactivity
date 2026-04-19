import type { Game } from "@/components/game-card"
import type { DiscoveryGame, EnrichedDiscoveryGame } from "@/types/discovery"

/**
 * Normalize a game name for fuzzy matching across Discord / IGDB / RAWG.
 * Strips symbols, collapses whitespace, lowercases.
 */
export function normalizeForMatch(name: string): string {
    return name
        .toLowerCase()
        .replace(/[™®©℗]/g, "")
        .replace(/[^a-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
}

/**
 * Format a Unix timestamp (seconds) to a human-readable year string.
 */
export function releaseYear(timestamp: number | null): string | null {
    if (timestamp == null) return null
    return new Date(timestamp * 1000).getFullYear().toString()
}

/**
 * Format an IGDB 0–100 rating to a display string (e.g. "87").
 */
export function formatIgdbRating(rating: number | null): string | null {
    if (rating == null) return null
    return Math.round(rating).toString()
}

/**
 * Format a RAWG 0–5 rating to stars string (e.g. "4.5").
 */
export function formatRawgRating(rating: number | null): string | null {
    if (rating == null || rating <= 0) return null
    return rating.toFixed(1)
}

/**
 * Match a list of RAWG discovery games against the Discord game library.
 * Returns each discovery game enriched with a `discordGameId` when a match is found.
 *
 * Matching strategy (in order):
 *  1. Exact normalized-name match
 *  2. One name is a prefix of the other (e.g. "Cyberpunk 2077" ↔ "Cyberpunk 2077: Phantom Liberty")
 */
export function enrichDiscoveryGames(
    rawgGames: DiscoveryGame[],
    gamesById: Map<string, Game>
): EnrichedDiscoveryGame[] {
    // Build a normalized-name → id index once
    const index = new Map<string, string>()
    for (const [id, game] of gamesById) {
        index.set(normalizeForMatch(game.name), id)
    }

    return rawgGames.map((dg) => {
        const norm = normalizeForMatch(dg.name)

        // Exact match
        const exactId = index.get(norm)
        if (exactId) return { ...dg, discordGameId: exactId }

        // Prefix match (only when normalized name is ≥5 chars to avoid false positives)
        if (norm.length >= 5) {
            for (const [discordNorm, id] of index) {
                if (
                    discordNorm.startsWith(norm + " ") ||
                    norm.startsWith(discordNorm + " ")
                ) {
                    return { ...dg, discordGameId: id }
                }
            }
        }

        return { ...dg }
    })
}
