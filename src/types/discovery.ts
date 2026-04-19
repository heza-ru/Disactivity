export interface GameMetadata {
    cover_url: string | null
    release_date: number | null  // Unix timestamp (seconds)
    genres: string[]
    platforms: string[]
    rating: number | null        // 0–100
    summary: string | null
    igdb_name: string | null
}

export interface DiscoveryGame {
    rawg_id: number
    name: string
    background_image: string | null
    rating: number | null        // 0–5
    released: string | null      // "YYYY-MM-DD"
    genres: string[]
    platforms: string[]
    metacritic: number | null
}

export interface DiscoveryData {
    trending: DiscoveryGame[]
    new_releases: DiscoveryGame[]
}

export interface ApiKeys {
    igdb_client_id: string | null
    igdb_client_secret: string | null
    rawg_api_key: string | null
    media_client_id: string | null
    ide_client_id: string | null
}

/** A RAWG discovery game with an optional matched Discord game ID */
export type EnrichedDiscoveryGame = DiscoveryGame & {
    discordGameId?: string
}
