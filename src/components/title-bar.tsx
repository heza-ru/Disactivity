"use client"

import React, { useEffect, useState, useRef } from "react"
import { useTranslation } from "react-i18next"
import {
    Minus,
    Square,
    X,
    Sun,
    Moon,
    ArrowDownToLine,
    RotateCw,
    Loader2,
    Activity,
    StopCircle, SquareActivity
} from "lucide-react"

import { getCurrentWindow } from "@tauri-apps/api/window"
import { relaunch } from "@tauri-apps/plugin-process"
import { check, Update } from "@tauri-apps/plugin-updater"
import { Button } from "@/components/ui/button.tsx"
import { toast } from "sonner"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Game } from "@/components/game-card"

type UpdateState = "idle" | "checking" | "available" | "downloading" | "ready" | "error"

interface RunningGameInfo {
    game: Game
    isLoading: boolean
}

interface TitleBarProps {
    runningGames?: Map<string, RunningGameInfo>
    onStopGame?: (gameId: string) => void
}

export function TitleBar({ runningGames = new Map(), onStopGame }: TitleBarProps) {
    const { t } = useTranslation()
    const [isHovered, setIsHovered] = useState(false)
    const [isDark, setIsDark] = useState(false)

    const [updateState, setUpdateState] = useState<UpdateState>("idle")
    const [updateVersion, setUpdateVersion] = useState<string>("")
    const [downloadProgress, setDownloadProgress] = useState(0)
    const updateRef = useRef<Update | null>(null)
    const pendingUpdateRef = useRef<boolean>(false)

    const handleMinimize = async () => {
        const window = getCurrentWindow()
        await window.minimize()
    }

    const handleMaximize = async () => {
        const window = getCurrentWindow()
        const isMaximized = await window.isMaximized()
        if (isMaximized) {
            await window.unmaximize()
        } else {
            await window.maximize()
        }
    }

    const handleClose = async () => {
        // If there's a pending update, install it silently before closing
        if (pendingUpdateRef.current && updateRef.current) {
            try {
                await updateRef.current.install()
            } catch (error) {
                console.error("Failed to install update on close:", error)
            }
        }
        const window = getCurrentWindow()
        await window.close()
    }

    useEffect(() => {
        const darkModePreference = window.matchMedia("(prefers-color-scheme: dark)").matches
        setIsDark(darkModePreference)
        if (darkModePreference) {
            document.documentElement.classList.add("dark")
        }

        // Check for updates on boot
        checkForUpdates()
    }, [])

    const toggleTheme = () => {
        setIsDark(!isDark)
        document.documentElement.classList.toggle("dark")
    }

    const checkForUpdates = async () => {
        setUpdateState("checking")

        try {
            const update = await check()

            if (update) {
                updateRef.current = update
                setUpdateVersion(update.version)
                setUpdateState("available")

                toast(t("toast.updateAvailable.title"), {
                    description: t("toast.updateAvailable.description", { version: update.version }),
                })
            } else {
                setUpdateState("idle")
            }
        } catch (error) {
            console.error("Update check failed:", error)
            setUpdateState("idle")
            // Don't show error toast on boot - just silently fail
        }
    }

    const downloadAndInstallUpdate = async () => {
        if (!updateRef.current) return

        setUpdateState("downloading")
        setDownloadProgress(0)

        try {
            let downloaded = 0
            let contentLength = 0

            await updateRef.current.downloadAndInstall((event) => {
                switch (event.event) {
                    case "Started":
                        contentLength = event.data.contentLength || 0
                        break
                    case "Progress":
                        downloaded += event.data.chunkLength
                        if (contentLength > 0) {
                            const progress = Math.round((downloaded / contentLength) * 100)
                            setDownloadProgress(progress)
                        }
                        break
                    case "Finished":
                        setDownloadProgress(100)
                        break
                }
            })

            setUpdateState("ready")
            pendingUpdateRef.current = true

            toast.success(t("toast.updateReady.title"), {
                description: t("toast.updateReady.description", { version: updateVersion }),
                action: {
                    label: t("updater.restart"),
                    onClick: () => restartApp(),
                },
                duration: 10000,
            })
        } catch (error) {
            console.error("Download failed:", error)
            setUpdateState("error")
            toast.error(t("toast.updateError.title"), {
                description: t("toast.updateError.description", { error: String(error) }),
            })
        }
    }

    const restartApp = async () => {
        try {
            await relaunch()
        } catch (error) {
            console.error("Relaunch failed:", error)
            toast.error(t("toast.updateError.title"), {
                description: t("toast.updateError.description", { error: String(error) }),
            })
        }
    }

    const handleUpdateButtonClick = () => {
        switch (updateState) {
            case "available":
                downloadAndInstallUpdate()
                break
            case "ready":
                restartApp()
                break
            case "error":
                checkForUpdates()
                break
        }
    }

    const getUpdateButtonContent = () => {
        switch (updateState) {
            case "checking":
                return <Loader2 className="h-5 w-5 animate-spin" />
            case "available":
                return <ArrowDownToLine className="h-5 w-5 text-green-400" />
            case "downloading":
                return (
                    <div className="relative h-5 w-5">
                        <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                        <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold">
                            {downloadProgress}
                        </span>
                    </div>
                )
            case "ready":
                return <RotateCw className="h-5 w-5 text-green-400" />
            case "error":
                return <ArrowDownToLine className="h-5 w-5 text-red-400" />
            default:
                return null
        }
    }

    const getUpdateTooltip = () => {
        switch (updateState) {
            case "checking":
                return t("toast.updateAvailable.title")
            case "available":
                return t("updater.tooltip")
            case "downloading":
                return `${t("updater.downloading")} ${downloadProgress}%`
            case "ready":
                return t("updater.restart")
            case "error":
                return t("toast.updateError.title")
            default:
                return ""
        }
    }

    const showUpdateButton = updateState !== "idle"
    const runningGamesArray = Array.from(runningGames.values())
    const runningCount = runningGamesArray.length

    const getGameIconUrl = (game: Game, size: number = 64): string => {
        if (game.icon_hash) {
            return `https://cdn.discordapp.com/app-icons/${game.id}/${game.icon_hash}.png?size=${size}&keep_aspect_ratio=false`
        }
        return "https://cdn.discordapp.com/embed/avatars/0.png"
    }

    return (
        <header
            data-tauri-drag-region
            className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between h-10 px-4 bg-background/80 backdrop-blur-xl border-b border-border/50 select-none"
        >
            {/* Title */}
            <div className="flex items-center gap-2 flex-1" data-tauri-drag-region>
                <img className="h-5 w-5 pointer-events-none" src="./icon.png" alt="App icon"/>
                <span className="font-semibold text-sm text-foreground pointer-events-none">Disactivity</span>
            </div>

            <div
                className="flex items-center gap-2 relative z-10"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                style={{WebkitAppRegion: 'no-drag'} as React.CSSProperties}
            >
                {/* Running Games Task Manager */}
                {runningCount > 0 && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="secondary" size="sm" className="h-8 gap-1.5 px-2">
                                <SquareActivity className="h-4 w-4 text-green-500" />
                                <span className="text-xs font-medium">{runningCount}</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-72">
                            <DropdownMenuLabel className="flex items-center gap-2">
                                <Activity className="h-4 w-4 text-green-500" />
                                {t("taskManager.title")}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {runningGamesArray.map(({ game, isLoading }) => (
                                <DropdownMenuItem
                                    key={game.id}
                                    className="flex items-center gap-3 p-2 cursor-default"
                                    onSelect={(e) => e.preventDefault()}
                                >
                                    <img
                                        src={getGameIconUrl(game, 64)}
                                        alt={game.name}
                                        className="h-8 w-8 rounded-md object-cover bg-muted"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).src = "https://cdn.discordapp.com/embed/avatars/0.png"
                                        }}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{game.name}</p>
                                        <p className="text-xs text-green-500">{t("gameCard.running")}</p>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={() => onStopGame?.(game.id)}
                                        disabled={isLoading}
                                    >
                                        {isLoading ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <StopCircle className="h-4 w-4" />
                                        )}
                                    </Button>
                                </DropdownMenuItem>
                            ))}
                            {runningCount > 1 && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        className="text-destructive focus:text-destructive cursor-pointer"
                                        onClick={() => {
                                            runningGamesArray.forEach(({ game }) => onStopGame?.(game.id))
                                        }}
                                    >
                                        <StopCircle className="h-4 w-4 mr-2" />
                                        {t("taskManager.stopAll")}
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}

                {showUpdateButton && (
                    <TooltipProvider delayDuration={200}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    onClick={handleUpdateButtonClick}
                                    className="h-8 w-8"
                                    disabled={updateState === "checking" || updateState === "downloading"}
                                >
                                    {getUpdateButtonContent()}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                                {getUpdateTooltip()}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}

                <Button variant="secondary" size="icon" onClick={toggleTheme} className="h-8 w-8">
                    {isDark ? <Sun className="h-5 w-5"/> : <Moon className="h-5 w-5"/>}
                </Button>

                {/* Minimize - Yellow */}
                <button
                    onClick={handleMinimize}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="group w-5 h-3 rounded-full bg-[#FEBC2E] hover:bg-[#FEBC2E]/80 flex items-center justify-center transition-colors"
                >
                    {isHovered && (
                        <Minus className="w-2 h-2 text-[#995700] opacity-0 group-hover:opacity-100 transition-opacity"/>
                    )}
                </button>

                {/* Maximize - Green */}
                <button
                    onClick={handleMaximize}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="group w-5 h-3 rounded-full bg-[#28C840] hover:bg-[#28C840]/80 flex items-center justify-center transition-colors"
                >
                    {isHovered && (
                        <Square
                            className="w-1.5 h-1.5 text-[#006500] opacity-0 group-hover:opacity-100 transition-opacity"/>
                    )}
                </button>

                {/* Close - Red */}
                <button
                    onClick={handleClose}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="group w-5 h-3 rounded-full bg-[#FF5F57] hover:bg-[#FF5F57]/80 flex items-center justify-center transition-colors"
                >
                    {isHovered &&
                        <X className="w-2 h-2 text-[#4A0002] opacity-0 group-hover:opacity-100 transition-opacity"/>}
                </button>
            </div>
        </header>
    )
}
