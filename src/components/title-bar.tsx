"use client"

import { useState } from "react"
import { Minus, Square, X, Gamepad2 } from "lucide-react"

// Tauri imports - uncomment when using in Tauri app
import { getCurrentWindow } from "@tauri-apps/api/window"

export function TitleBar() {
    const [isHovered, setIsHovered] = useState(false)

    const handleMinimize = async () => {
        // Tauri: Minimize the window
        const window = getCurrentWindow()
        await window.minimize()
        console.log("Minimize clicked")
    }

    const handleMaximize = async () => {
        // Tauri: Toggle maximize/restore
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
        // Tauri: Close the window
        const window = getCurrentWindow()
        await window.close()
        console.log("Close clicked")
    }

    return (
        <header
            data-tauri-drag-region
            className="sticky top-0 z-50 flex items-center justify-between h-10 px-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border"
        >
            {/* Title */}
            <div className="flex items-center gap-2" data-tauri-drag-region>
                <Gamepad2 className="h-5 w-5 text-primary" />
                <span className="font-semibold text-sm text-foreground">Game Launcher</span>
            </div>

            {/* Window Controls - Apple style */}
            <div
                className="flex items-center gap-2"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                {/* Maximize - Green */}
                <button
                    onClick={handleMaximize}
                    className="group w-5 h-3 rounded-full bg-[#28C840] hover:bg-[#28C840]/80 flex items-center justify-center transition-colors"
                >
                    {isHovered && (
                        <Square className="w-1.5 h-1.5 text-[#006500] opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                </button>

                {/* Minimize - Yellow */}
                <button
                    onClick={handleMinimize}
                    className="group w-5 h-3 rounded-full bg-[#FEBC2E] hover:bg-[#FEBC2E]/80 flex items-center justify-center transition-colors"
                >
                    {isHovered && (
                        <Minus className="w-2 h-2 text-[#995700] opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                </button>

                {/* Close - Red */}
                <button
                    onClick={handleClose}
                    className="group w-5 h-3 rounded-full bg-[#FF5F57] hover:bg-[#FF5F57]/80 flex items-center justify-center transition-colors"
                >
                    {isHovered && <X className="w-2 h-2 text-[#4A0002] opacity-0 group-hover:opacity-100 transition-opacity" />}
                </button>
            </div>
        </header>
    )
}
