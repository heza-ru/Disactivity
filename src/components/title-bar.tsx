"use client"

import React, {useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import {
    Minus,
    Square,
    X,
    Sun,
    Moon,
    ArrowDownToLine
} from "lucide-react"

import { getCurrentWindow } from "@tauri-apps/api/window"
import {Button} from "@/components/ui/button.tsx";
import {toast} from "sonner";

export function TitleBar() {
    const { t } = useTranslation()
    const [isHovered, setIsHovered] = useState(false)
    const [isDark, setIsDark] = useState(false)

    const [updateAvailable, setUpdateAvailable] = useState(false)

    const handleMinimize = async () => {
        const window = getCurrentWindow()
        await window.minimize()
        console.log("Minimize clicked")
    }

    const handleMaximize = async () => {
        const window = getCurrentWindow()
        const isMaximized = await window.isMaximized()
        if (isMaximized) {
            await window.unmaximize()
        } else {
            await window.maximize()
        }
        console.log("Maximize clicked")
    }

    const handleClose = async () => {
        const window = getCurrentWindow()
        await window.close()
        console.log("Close clicked")
    }

    useEffect(() => {
        const darkModePreference = window.matchMedia("(prefers-color-scheme: dark)").matches
        setIsDark(darkModePreference)
        if (darkModePreference) {
            document.documentElement.classList.add("dark")
        }

        checkForUpdates()
    }, [])

    const toggleTheme = () => {
        setIsDark(!isDark)
        document.documentElement.classList.toggle("dark")
    }

    const checkForUpdates = () => {
        // Simulate update check todo: implement real update check
        setTimeout(() => {
            setUpdateAvailable(true) // Simulate an available update
            toast(t("toast.updateAvailable.title"), {
                description: t("toast.updateAvailable.description"),
            })
        }, 2000)
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
                {
                    updateAvailable && (
                        <Button variant="secondary" size="icon" onClick={checkForUpdates} className="h-8 w-8">
                            <ArrowDownToLine className="h-5 w-5 text-green-400"/>
                        </Button>
                    )
                }

                <Button variant="secondary" size="icon" onClick={toggleTheme} className=" h-8 w-8">
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
