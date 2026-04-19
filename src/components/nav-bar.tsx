"use client"

import { Home, Settings, Info, Smartphone } from "lucide-react"
import { useTranslation } from "react-i18next"

export type AppPage = "home" | "settings" | "about" | "remote"

interface NavBarProps {
    currentPage: AppPage
    onNavigate: (page: AppPage) => void
}

const TABS: { id: AppPage; icon: React.FC<{ className?: string }>; labelKey: string }[] = [
    { id: "home", icon: Home, labelKey: "nav.home" },
    { id: "settings", icon: Settings, labelKey: "nav.settings" },
    { id: "remote", icon: Smartphone, labelKey: "nav.remote" },
    { id: "about", icon: Info, labelKey: "nav.about" },
]

import React from "react"

export function NavBar({ currentPage, onNavigate }: NavBarProps) {
    const { t } = useTranslation()

    return (
        <nav
            className="fixed top-10 left-0 right-0 z-40 flex items-stretch justify-center h-10 bg-background/80 backdrop-blur-xl border-b border-border/50 select-none"
            role="tablist"
            aria-label="Application navigation"
        >
            {TABS.map(({ id, icon: Icon, labelKey }) => {
                const isActive = currentPage === id
                return (
                    <button
                        key={id}
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => onNavigate(id)}
                        className={`flex items-center gap-1.5 px-4 text-sm font-medium transition-colors relative
                            ${isActive
                                ? "text-foreground"
                                : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                            }`}
                    >
                        <Icon className="h-4 w-4 shrink-0" />
                        {t(labelKey)}
                        {isActive && (
                            <span
                                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
                                aria-hidden="true"
                            />
                        )}
                    </button>
                )
            })}
        </nav>
    )
}
