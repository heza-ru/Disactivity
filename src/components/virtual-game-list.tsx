import { useRef, type ReactNode } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { Game } from "@/components/game-card"

interface VirtualGameListProps {
    games: readonly Game[]
    /** Scroll container max height: inner list scrolls when content exceeds this. */
    className?: string
    estimateItemSize?: number
    /** Row content; the wrapper provides virtualization ref + layout. */
    renderItem: (game: Game) => ReactNode
}

export function VirtualGameList({
    games,
    className = "max-h-[min(55vh,30rem)] min-h-0 overflow-y-auto pr-1 -mr-1",
    estimateItemSize = 100,
    renderItem,
}: VirtualGameListProps) {
    const parentRef = useRef<HTMLDivElement>(null)
    const virtualizer = useVirtualizer({
        count: games.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => estimateItemSize,
        measureElement: typeof document !== "undefined" ? (el) => el.getBoundingClientRect().height : undefined,
        overscan: 6,
    })

    if (games.length === 0) {
        return null
    }

    return (
        <div ref={parentRef} className={className}>
            <div
                className="relative w-full"
                style={{ height: virtualizer.getTotalSize() }}
            >
                {virtualizer.getVirtualItems().map((v) => {
                    const game = games[v.index]
                    if (!game) {
                        return null
                    }
                    return (
                        <div
                            key={game.id}
                            data-index={v.index}
                            ref={virtualizer.measureElement}
                            className="absolute top-0 left-0 w-full"
                            style={{ transform: `translateY(${v.start}px)` }}
                        >
                            <div className="mb-1">{renderItem(game)}</div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
