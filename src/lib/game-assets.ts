/** Default Discord embed avatar when a game has no custom icon. */
export const DEFAULT_GAME_ICON = "https://cdn.discordapp.com/embed/avatars/0.png"

type IconGame = { id: string; icon_hash?: string | null }

export function getGameIconUrl(game: IconGame, size = 64): string {
    if (game.icon_hash) {
        return `https://cdn.discordapp.com/app-icons/${game.id}/${game.icon_hash}.png?size=${size}&keep_aspect_ratio=false`
    }
    return DEFAULT_GAME_ICON
}
