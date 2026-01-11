"use client"

import type React from "react"

import { useState, useEffect, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Toaster } from "@/components/ui/sonner"
import { Search, RefreshCw, Gamepad2, Moon, Sun } from "lucide-react"
import { GameCard } from "@/components/game-card"
import { TitleBar } from "@/components/title-bar"
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
    PaginationEllipsis,
} from "@/components/ui/pagination"

// Updated game data with additional fields for tooltip
const gamesData = [
    {
        id: "game-001",
        name: "Cyber Odyssey 2077",
        path: "/games/cyber-odyssey/launch.exe",
        image: "/cyberpunk-game-cover.png",
        genre: "RPG",
        description: "Open-world cyberpunk adventure in a dystopian future.",
        lastPlayed: "2 days ago",
    },
    {
        id: "game-002",
        name: "Medieval Kingdoms",
        path: "/games/medieval-kingdoms/launch.exe",
        image: "/medieval-castle-game-cover.jpg",
        genre: "Strategy",
        description: "Build and manage your medieval empire.",
        lastPlayed: "1 week ago",
    },
    {
        id: "game-003",
        name: "Space Explorer",
        path: "/games/space-explorer/launch.exe",
        image: "/space-exploration-game-cover.png",
        genre: "Simulation",
        description: "Explore the vast universe and discover new planets.",
        lastPlayed: "Yesterday",
    },
    {
        id: "game-004",
        name: "Racing Thunder",
        path: "/games/racing-thunder/launch.exe",
        image: "/racing-car-game-cover.jpg",
        genre: "Racing",
        description: "High-speed racing with realistic physics.",
        lastPlayed: "3 days ago",
    },
    {
        id: "game-005",
        name: "Zombie Survival",
        path: "/games/zombie-survival/launch.exe",
        image: "/zombie-horror-game-cover.jpg",
        genre: "Horror",
        description: "Survive the apocalypse in this intense horror game.",
        lastPlayed: "Never",
    },
]

export default function GameLauncher() {
    const [searchQuery, setSearchQuery] = useState("")
    const [games, setGames] = useState(gamesData)
    const [filteredGames, setFilteredGames] = useState(gamesData)
    const [isDark, setIsDark] = useState(false)
    const [currentPage, setCurrentPage] = useState(1)
    const ITEMS_PER_PAGE = 50

    useEffect(() => {
        const darkModePreference = window.matchMedia("(prefers-color-scheme: dark)").matches
        setIsDark(darkModePreference)
        if (darkModePreference) {
            document.documentElement.classList.add("dark")
        }
    }, [])

    const toggleTheme = () => {
        setIsDark(!isDark)
        document.documentElement.classList.toggle("dark")
    }

    const handleSearch = () => {
        const query = searchQuery.toLowerCase().trim()
        setCurrentPage(1)
        if (!query) {
            setFilteredGames(games)
            return
        }
        const results = games.filter(
            (game) => game.name.toLowerCase().includes(query) || game.id.toLowerCase().includes(query),
        )
        setFilteredGames(results)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleSearch()
        }
    }

    const handleRefresh = () => {
        setSearchQuery("")
        setFilteredGames(games)
        setCurrentPage(1)
        toast.info("Refreshed", {
            description: "Game list has been refreshed.",
        })
    }

    const handleOpenGame = (game: (typeof gamesData)[0]) => {
        toast.info("Opening Game", {
            description: `Launching ${game.name}...`,
        })
    }

    const totalPages = Math.ceil(filteredGames.length / ITEMS_PER_PAGE)
    const paginatedGames = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
        return filteredGames.slice(startIndex, startIndex + ITEMS_PER_PAGE)
    }, [filteredGames, currentPage])

    const getPageNumbers = () => {
        const pages: (number | "ellipsis")[] = []
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pages.push(i)
        } else {
            pages.push(1)
            if (currentPage > 3) pages.push("ellipsis")
            for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
                pages.push(i)
            }
            if (currentPage < totalPages - 2) pages.push("ellipsis")
            pages.push(totalPages)
        }
        return pages
    }

    return (
        <div className="min-h-screen flex flex-col bg-background">
            <TitleBar />

            <main className="flex-1 overflow-auto mx-5">
                <div className="container mx-auto px-4 py-6 max-w-4xl">
                    <div className="flex items-center justify-end mb-6">
                        <Button variant="ghost" size="icon" onClick={toggleTheme}>
                            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                        </Button>
                    </div>

                    {/* Search Bar */}
                    <div className="flex gap-2 mb-6">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="text"
                                placeholder="Search games by name or ID..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="pl-10"
                            />
                        </div>
                        <Button onClick={handleSearch}>
                            <Search className="h-4 w-4 mr-2" />
                            Search
                        </Button>
                        <Button variant="outline" onClick={handleRefresh}>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Refresh
                        </Button>
                    </div>

                    {/* Game list */}
                    <div className="space-y-1">
                        {paginatedGames.length > 0 ? (
                            paginatedGames.map((game) => <GameCard key={game.id} game={game} onOpen={handleOpenGame} />)
                        ) : (
                            <div className="text-center py-12 text-muted-foreground">
                                <Gamepad2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                <p>No games found matching your search.</p>
                            </div>
                        )}
                    </div>

                    {totalPages > 1 && (
                        <Pagination className="mt-6">
                            <PaginationContent>
                                <PaginationItem>
                                    <PaginationPrevious
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault()
                                            setCurrentPage((prev) => Math.max(1, prev - 1))
                                        }}
                                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                    />
                                </PaginationItem>
                                {getPageNumbers().map((page, index) =>
                                    page === "ellipsis" ? (
                                        <PaginationItem key={`ellipsis-${index}`}>
                                            <PaginationEllipsis />
                                        </PaginationItem>
                                    ) : (
                                        <PaginationItem key={page}>
                                            <PaginationLink
                                                href="#"
                                                onClick={(e) => {
                                                    e.preventDefault()
                                                    setCurrentPage(page)
                                                }}
                                                isActive={currentPage === page}
                                                className="cursor-pointer"
                                            >
                                                {page}
                                            </PaginationLink>
                                        </PaginationItem>
                                    ),
                                )}
                                <PaginationItem>
                                    <PaginationNext
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault()
                                            setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                                        }}
                                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                    />
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    )}

                    {/* Footer */}
                    <div className="mt-4 text-center text-sm text-muted-foreground">
                        Showing {paginatedGames.length} of {filteredGames.length} game{filteredGames.length !== 1 ? "s" : ""}
                        {totalPages > 1 && ` (Page ${currentPage} of ${totalPages})`}
                    </div>
                </div>
            </main>
            <Toaster />
        </div>
    )
}
