"use client"

import React, { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { invoke } from "@tauri-apps/api/core"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { RefreshCw, Loader2, Database, Monitor, Shield } from "lucide-react"
import type { AppSettings } from "@/lib/settings"

interface SettingsPageProps {
    settings: AppSettings
    onSaveSettings: (settings: AppSettings) => void
    onRefreshCache: () => void
    isRefreshing: boolean
}

function ToggleSwitch({
    checked,
    onChange,
    id,
}: {
    checked: boolean
    onChange: (val: boolean) => void
    id: string
}) {
    return (
        <button
            id={id}
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                checked ? "bg-primary" : "bg-input"
            }`}
        >
            <span
                className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                    checked ? "translate-x-4" : "translate-x-0"
                }`}
            />
        </button>
    )
}

function SettingRow({
    label,
    description,
    htmlFor,
    children,
}: {
    label: string
    description?: string
    htmlFor?: string
    children: React.ReactNode
}) {
    return (
        <div className="flex items-start justify-between gap-6 py-3">
            <div className="flex-1 min-w-0">
                <label htmlFor={htmlFor} className="text-sm font-medium text-foreground cursor-pointer">
                    {label}
                </label>
                {description && (
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
                )}
            </div>
            <div className="shrink-0 flex items-center">{children}</div>
        </div>
    )
}

function SectionHeader({
    icon: Icon,
    title,
}: {
    icon: React.FC<{ className?: string }>
    title: string
}) {
    return (
        <div className="flex items-center gap-2 mb-1">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h2>
        </div>
    )
}

export function SettingsPage({ settings, onSaveSettings, onRefreshCache, isRefreshing }: SettingsPageProps) {
    const { t } = useTranslation()
    const [cacheTimestamp, setCacheTimestamp] = useState<string | null>(null)

    useEffect(() => {
        invoke<string | null>("get_cache_info")
            .then(setCacheTimestamp)
            .catch(() => setCacheTimestamp(null))
    }, [isRefreshing])

    const update = (partial: Partial<AppSettings>) => {
        const next = { ...settings, ...partial }
        onSaveSettings(next)

        if ("minimizeToTray" in partial) {
            invoke("set_minimize_to_tray", { enabled: partial.minimizeToTray }).catch(console.error)
        }
    }

    const formatCacheAge = (ts: string): string => {
        try {
            const date = new Date(ts)
            const diff = Date.now() - date.getTime()
            const hours = Math.floor(diff / 3_600_000)
            const minutes = Math.floor((diff % 3_600_000) / 60_000)
            if (hours > 0) return `${hours}h ${minutes}m ago`
            if (minutes > 0) return `${minutes}m ago`
            return "just now"
        } catch {
            return ts
        }
    }

    return (
        <ScrollArea className="flex-1 mt-20">
            <main className="mx-auto max-w-xl px-6 py-8 pb-12 space-y-8">
                <div>
                    <h1 className="text-xl font-bold text-foreground">{t("nav.settings")}</h1>
                    <p className="text-sm text-muted-foreground mt-1">{t("settings.pageDescription")}</p>
                </div>

                {/* Behavior */}
                <section>
                    <SectionHeader icon={Shield} title={t("settings.behavior")} />
                    <div className="rounded-lg border border-border bg-card divide-y divide-border/60">
                        <div className="px-4">
                            <SettingRow
                                label={t("settings.minimizeToTray")}
                                description={t("settings.minimizeToTrayDesc")}
                                htmlFor="minimize-to-tray"
                            >
                                <ToggleSwitch
                                    id="minimize-to-tray"
                                    checked={settings.minimizeToTray}
                                    onChange={(val) => update({ minimizeToTray: val })}
                                />
                            </SettingRow>
                        </div>
                        <div className="px-4">
                            <SettingRow
                                label={t("settings.autoStop")}
                                description={t("settings.autoStopDesc")}
                                htmlFor="auto-stop"
                            >
                                <ToggleSwitch
                                    id="auto-stop"
                                    checked={settings.autoStopEnabled}
                                    onChange={(val) => update({ autoStopEnabled: val })}
                                />
                            </SettingRow>
                        </div>
                        {settings.autoStopEnabled && (
                            <div className="px-4">
                                <SettingRow
                                    label={t("settings.autoStopMinutes")}
                                    description={t("settings.autoStopMinutesDesc")}
                                    htmlFor="auto-stop-minutes"
                                >
                                    <div className="flex items-center gap-2">
                                        <Input
                                            id="auto-stop-minutes"
                                            type="number"
                                            min={1}
                                            max={480}
                                            value={settings.autoStopMinutes}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value)
                                                if (!isNaN(val) && val >= 1 && val <= 480) {
                                                    update({ autoStopMinutes: val })
                                                }
                                            }}
                                            className="w-20 h-8 text-center"
                                        />
                                        <span className="text-sm text-muted-foreground">{t("settings.minutes")}</span>
                                    </div>
                                </SettingRow>
                            </div>
                        )}
                    </div>
                </section>

                {/* Display */}
                <section>
                    <SectionHeader icon={Monitor} title={t("settings.display")} />
                    <div className="rounded-lg border border-border bg-card divide-y divide-border/60">
                        <div className="px-4">
                            <SettingRow
                                label={t("settings.itemsPerPage")}
                                description={t("settings.itemsPerPageDesc")}
                                htmlFor="items-per-page"
                            >
                                <Input
                                    id="items-per-page"
                                    type="number"
                                    min={10}
                                    max={200}
                                    value={settings.itemsPerPage}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value)
                                        if (!isNaN(val) && val >= 10 && val <= 200) {
                                            update({ itemsPerPage: val })
                                        }
                                    }}
                                    className="w-20 h-8 text-center"
                                />
                            </SettingRow>
                        </div>
                    </div>
                </section>

                {/* Data & Cache */}
                <section>
                    <SectionHeader icon={Database} title={t("settings.data")} />
                    <div className="rounded-lg border border-border bg-card divide-y divide-border/60">
                        <div className="px-4">
                            <SettingRow
                                label={t("settings.cacheAge")}
                                description={
                                    cacheTimestamp
                                        ? formatCacheAge(cacheTimestamp)
                                        : t("settings.noCacheData")
                                }
                            >
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        onRefreshCache()
                                        toast.info(t("settings.cacheRefreshing"))
                                    }}
                                    disabled={isRefreshing}
                                    className="h-8 gap-1.5"
                                >
                                    {isRefreshing ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <RefreshCw className="h-3.5 w-3.5" />
                                    )}
                                    {t("settings.cacheRefresh")}
                                </Button>
                            </SettingRow>
                        </div>
                    </div>
                </section>

                <Separator />
                <p className="text-xs text-muted-foreground text-center">
                    {t("settings.changesApplied")}
                </p>
            </main>
        </ScrollArea>
    )
}
