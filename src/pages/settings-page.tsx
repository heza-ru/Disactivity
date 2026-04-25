import React, { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { invoke } from "@tauri-apps/api/core"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { RefreshCw, Loader2, Database, Monitor, Shield, Eye, EyeOff, Activity, ChevronDown, ChevronRight, Clock, Music2, Code2, Plus, Trash2, Pencil } from "lucide-react"
import type { AppSettings } from "@/lib/settings"
import type { ApiKeys } from "@/types/discovery"
import type { PresenceProfile, ScheduleEntry } from "@/types/schedules"

interface SettingsPageProps {
    settings: AppSettings
    onSaveSettings: (settings: AppSettings) => void
    onRefreshCache: () => void
    isRefreshing: boolean
    onDiscoveryRefresh: () => void
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

export function SettingsPage({
    settings,
    onSaveSettings,
    onRefreshCache,
    isRefreshing,
    onDiscoveryRefresh,
}: SettingsPageProps) {
    const { t } = useTranslation()
    const [cacheTimestamp, setCacheTimestamp] = useState<string | null>(null)

    // Custom presence state
    const [cpClientId, setCpClientId] = useState("")
    const [cpDetails, setCpDetails] = useState("")
    const [cpStateText, setCpStateText] = useState("")
    const [cpActive, setCpActive] = useState(false)
    const [cpLoading, setCpLoading] = useState(false)

    // Advanced section collapse state
    const [advancedOpen, setAdvancedOpen] = useState(false)

    // API key state
    const [igdbClientId, setIgdbClientId] = useState("")
    const [igdbClientSecret, setIgdbClientSecret] = useState("")
    const [rawgApiKey, setRawgApiKey] = useState("")
    const [mediaClientId, setMediaClientId] = useState("")
    const [ideClientId, setIdeClientId] = useState("")
    const [showIgdbSecret, setShowIgdbSecret] = useState(false)
    const [showRawgKey, setShowRawgKey] = useState(false)
    const [savingKeys, setSavingKeys] = useState(false)

    // Schedules state
    const [profiles, setProfiles] = useState<PresenceProfile[]>([])
    const [schedules, setSchedules] = useState<ScheduleEntry[]>([])
    const [editingProfile, setEditingProfile] = useState<Partial<PresenceProfile> | null>(null)
    const [editingSchedule, setEditingSchedule] = useState<Partial<ScheduleEntry> | null>(null)

    useEffect(() => {
        invoke<string | null>("get_cache_info")
            .then(setCacheTimestamp)
            .catch(() => setCacheTimestamp(null))
    }, [isRefreshing])

    useEffect(() => {
        invoke<boolean>("get_custom_presence_active")
            .then(setCpActive)
            .catch(() => setCpActive(false))
    }, [])

    useEffect(() => {
        invoke<ApiKeys>("get_api_keys")
            .then((keys) => {
                setIgdbClientId(keys.igdb_client_id ?? "")
                setIgdbClientSecret(keys.igdb_client_secret ?? "")
                setRawgApiKey(keys.rawg_api_key ?? "")
                setMediaClientId(keys.media_client_id ?? "")
                setIdeClientId(keys.ide_client_id ?? "")
            })
            .catch(console.error)
        invoke<PresenceProfile[]>("get_profiles").then(setProfiles).catch(console.error)
        invoke<ScheduleEntry[]>("get_schedules").then(setSchedules).catch(console.error)
    }, [])

    const update = (partial: Partial<AppSettings>) => {
        const next = { ...settings, ...partial }
        onSaveSettings(next)

        if ("minimizeToTray" in partial) {
            invoke("set_minimize_to_tray", { enabled: partial.minimizeToTray }).catch(console.error)
        }
    }

    const handleSaveApiKeys = async () => {
        setSavingKeys(true)
        try {
            await invoke("set_api_keys", {
                igdbClientId: igdbClientId.trim() || null,
                igdbClientSecret: igdbClientSecret.trim() || null,
                rawgApiKey: rawgApiKey.trim() || null,
                mediaClientId: mediaClientId.trim() || null,
                ideClientId: ideClientId.trim() || null,
            })
            toast.success(t("apiKeys.saved"))
            onDiscoveryRefresh()
        } catch (err) {
            toast.error(`${err}`)
        } finally {
            setSavingKeys(false)
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
                        <div className="px-4">
                            <SettingRow
                                label={t("settings.idleStop")}
                                description={t("settings.idleStopDesc")}
                                htmlFor="idle-stop"
                            >
                                <ToggleSwitch
                                    id="idle-stop"
                                    checked={settings.idleStopEnabled}
                                    onChange={(val) => update({ idleStopEnabled: val })}
                                />
                            </SettingRow>
                        </div>
                        {settings.idleStopEnabled && (
                            <div className="px-4">
                                <SettingRow
                                    label={t("settings.idleStopMinutes")}
                                    description={t("settings.idleStopMinutesDesc")}
                                    htmlFor="idle-stop-minutes"
                                >
                                    <div className="flex items-center gap-2">
                                        <Input
                                            id="idle-stop-minutes"
                                            type="number"
                                            min={5}
                                            max={480}
                                            value={settings.idleStopMinutes}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value)
                                                if (!isNaN(val) && val >= 5 && val <= 480) {
                                                    update({ idleStopMinutes: val })
                                                }
                                            }}
                                            className="w-20 h-8 text-center"
                                        />
                                        <span className="text-sm text-muted-foreground">{t("settings.minutes")}</span>
                                    </div>
                                </SettingRow>
                            </div>
                        )}
                        <div className="px-4">
                            <SettingRow label={t("settings.scheduleWatcher")} description={t("settings.scheduleWatcherDesc")} htmlFor="schedule-watcher">
                                <ToggleSwitch id="schedule-watcher" checked={settings.scheduleEnabled} onChange={(val) => update({ scheduleEnabled: val })} />
                            </SettingRow>
                        </div>
                        <div className="px-4">
                            <SettingRow label={t("settings.mediaWatcher")} description={t("settings.mediaWatcherDesc")} htmlFor="media-watcher">
                                <ToggleSwitch id="media-watcher" checked={settings.mediaEnabled} onChange={(val) => update({ mediaEnabled: val })} />
                            </SettingRow>
                        </div>
                        <div className="px-4">
                            <SettingRow label={t("settings.ideWatcher")} description={t("settings.ideWatcherDesc")} htmlFor="ide-watcher">
                                <ToggleSwitch id="ide-watcher" checked={settings.ideEnabled} onChange={(val) => update({ ideEnabled: val })} />
                            </SettingRow>
                        </div>
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

                {/* Advanced / API & Discovery */}
                <section>
                    <button
                        type="button"
                        onClick={() => setAdvancedOpen((v) => !v)}
                        className="flex items-center gap-2 mb-1 w-full text-left group"
                    >
                        {advancedOpen
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">
                            {t("settings.advanced")}
                        </h2>
                    </button>
                    {advancedOpen && <>
                    <div className="rounded-lg border border-border bg-card divide-y divide-border/60">
                        {/* RAWG */}
                        <div className="px-4 py-3 space-y-2">
                            <div>
                                <p className="text-sm font-medium text-foreground">
                                    {t("apiKeys.rawgKey")}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {t("apiKeys.rawgKeyDesc")}
                                </p>
                            </div>
                            <div className="relative">
                                <Input
                                    type={showRawgKey ? "text" : "password"}
                                    placeholder="••••••••••••••••"
                                    value={rawgApiKey}
                                    onChange={(e) => setRawgApiKey(e.target.value)}
                                    className="pr-9 font-mono text-xs"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowRawgKey((v) => !v)}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    aria-label={showRawgKey ? "Hide" : "Show"}
                                >
                                    {showRawgKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                </button>
                            </div>
                        </div>

                        {/* IGDB */}
                        <div className="px-4 py-3 space-y-2">
                            <div>
                                <p className="text-sm font-medium text-foreground">
                                    {t("apiKeys.igdbTitle")}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {t("apiKeys.igdbDesc")}
                                </p>
                            </div>
                            <Input
                                type="text"
                                placeholder={t("apiKeys.igdbClientId")}
                                value={igdbClientId}
                                onChange={(e) => setIgdbClientId(e.target.value)}
                                className="font-mono text-xs"
                            />
                            <div className="relative">
                                <Input
                                    type={showIgdbSecret ? "text" : "password"}
                                    placeholder={t("apiKeys.igdbClientSecret")}
                                    value={igdbClientSecret}
                                    onChange={(e) => setIgdbClientSecret(e.target.value)}
                                    className="pr-9 font-mono text-xs"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowIgdbSecret((v) => !v)}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    aria-label={showIgdbSecret ? "Hide" : "Show"}
                                >
                                    {showIgdbSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                </button>
                            </div>
                        </div>

                        {/* Music Discord App ID */}
                        <div className="px-4 py-3 space-y-2">
                            <div>
                                <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                                    <Music2 className="h-3.5 w-3.5" />{t("settings.mediaClientId")}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">{t("settings.mediaClientIdDesc")}</p>
                            </div>
                            <Input type="text" placeholder="e.g. 1234567890123456789" value={mediaClientId} onChange={(e) => setMediaClientId(e.target.value)} className="font-mono text-xs" />
                        </div>

                        {/* IDE Discord App ID */}
                        <div className="px-4 py-3 space-y-2">
                            <div>
                                <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                                    <Code2 className="h-3.5 w-3.5" />{t("settings.ideClientId")}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">{t("settings.ideClientIdDesc")}</p>
                            </div>
                            <Input type="text" placeholder="e.g. 1234567890123456789" value={ideClientId} onChange={(e) => setIdeClientId(e.target.value)} className="font-mono text-xs" />
                        </div>

                        {/* Save */}
                        <div className="px-4 py-3 flex justify-end">
                            <Button
                                size="sm"
                                onClick={handleSaveApiKeys}
                                disabled={savingKeys}
                                className="gap-1.5"
                            >
                                {savingKeys && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                {t("apiKeys.save")}
                            </Button>
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 px-1">
                        {t("apiKeys.storageNote")}
                    </p>
                    </>}
                </section>

                {/* Custom Rich Presence */}
                <section>
                    <SectionHeader icon={Activity} title={t("customPresence.title")} />
                    <div className="rounded-lg border border-border bg-card divide-y divide-border/60">
                        <div className="px-4 py-3 space-y-3">
                            <p className="text-xs text-muted-foreground">{t("customPresence.description")}</p>
                            <div className="space-y-2">
                                <Input
                                    placeholder={t("customPresence.clientIdPlaceholder")}
                                    value={cpClientId}
                                    onChange={(e) => setCpClientId(e.target.value)}
                                    className="font-mono text-xs"
                                    aria-label={t("customPresence.clientId")}
                                />
                                <p className="text-xs text-muted-foreground">{t("customPresence.clientIdHint")}</p>
                                <Input
                                    placeholder={t("customPresence.detailsPlaceholder")}
                                    value={cpDetails}
                                    onChange={(e) => setCpDetails(e.target.value)}
                                    className="text-xs"
                                    aria-label={t("customPresence.details")}
                                />
                                <Input
                                    placeholder={t("customPresence.stateTextPlaceholder")}
                                    value={cpStateText}
                                    onChange={(e) => setCpStateText(e.target.value)}
                                    className="text-xs"
                                    aria-label={t("customPresence.stateText")}
                                />
                            </div>
                        </div>
                        <div className="px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className={`h-2 w-2 rounded-full ${cpActive ? "bg-green-500" : "bg-muted-foreground/40"}`} />
                                <span className="text-xs text-muted-foreground">
                                    {cpActive ? t("customPresence.active") : t("customPresence.inactive")}
                                </span>
                            </div>
                            <div className="flex gap-2">
                                {cpActive && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={async () => {
                                            await invoke("clear_custom_presence").catch(console.error)
                                            setCpActive(false)
                                        }}
                                    >
                                        {t("customPresence.deactivate")}
                                    </Button>
                                )}
                                <Button
                                    size="sm"
                                    disabled={cpLoading || !cpClientId.trim()}
                                    onClick={async () => {
                                        setCpLoading(true)
                                        try {
                                            await invoke("set_custom_presence", {
                                                clientId: cpClientId.trim(),
                                                details: cpDetails.trim() || null,
                                                stateText: cpStateText.trim() || null,
                                            })
                                            setCpActive(true)
                                            toast.success(t("customPresence.activate"))
                                        } catch (err) {
                                            toast.error(`${err}`)
                                        } finally {
                                            setCpLoading(false)
                                        }
                                    }}
                                >
                                    {cpLoading && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                                    {t("customPresence.activate")}
                                </Button>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Scheduled Profiles */}
                <section>
                    <SectionHeader icon={Clock} title={t("schedules.title")} />
                    <div className="rounded-lg border border-border bg-card divide-y divide-border/60">
                        {/* Profile list */}
                        <div className="px-4 py-3">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("schedules.addProfile")}</p>
                            </div>
                            {profiles.length === 0 && (
                                <p className="text-xs text-muted-foreground">{t("schedules.noProfiles")}</p>
                            )}
                            <div className="space-y-1.5">
                                {profiles.map((p) => (
                                    <div key={p.id} className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 px-3 py-2">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium truncate">{p.name}</p>
                                            <p className="text-xs text-muted-foreground truncate font-mono">{p.client_id}</p>
                                        </div>
                                        <div className="flex gap-1 ml-2 shrink-0">
                                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingProfile(p)}>
                                                <Pencil className="h-3 w-3" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={async () => {
                                                await invoke("remove_profile", { id: p.id }).catch(console.error)
                                                setProfiles((prev) => prev.filter((x) => x.id !== p.id))
                                            }}>
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <Button variant="outline" size="sm" className="mt-2 gap-1.5 w-full" onClick={() => setEditingProfile({ name: "", client_id: "", details: null, state_text: null })}>
                                <Plus className="h-3.5 w-3.5" />{t("schedules.addProfile")}
                            </Button>
                        </div>

                        {/* Profile editor */}
                        {editingProfile !== null && (
                            <div className="px-4 py-3 space-y-2 bg-muted/20">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                    {editingProfile.id ? t("schedules.editProfileTitle") : t("schedules.addProfileTitle")}
                                </p>
                                <Input placeholder={t("schedules.profileNamePlaceholder")} value={editingProfile.name ?? ""} onChange={(e) => setEditingProfile((p) => ({ ...p!, name: e.target.value }))} className="text-xs" />
                                <Input placeholder={t("schedules.clientIdPlaceholder")} value={editingProfile.client_id ?? ""} onChange={(e) => setEditingProfile((p) => ({ ...p!, client_id: e.target.value }))} className="font-mono text-xs" />
                                <Input placeholder={t("schedules.detailsPlaceholder")} value={editingProfile.details ?? ""} onChange={(e) => setEditingProfile((p) => ({ ...p!, details: e.target.value || null }))} className="text-xs" />
                                <Input placeholder={t("schedules.stateTextPlaceholder")} value={editingProfile.state_text ?? ""} onChange={(e) => setEditingProfile((p) => ({ ...p!, state_text: e.target.value || null }))} className="text-xs" />
                                <div className="flex gap-2 justify-end">
                                    <Button variant="outline" size="sm" onClick={() => setEditingProfile(null)}>{t("settings.cancel")}</Button>
                                    <Button size="sm" disabled={!editingProfile.name?.trim() || !editingProfile.client_id?.trim()} onClick={async () => {
                                        try {
                                            if (editingProfile.id) {
                                                await invoke("update_profile", { id: editingProfile.id, name: editingProfile.name, clientId: editingProfile.client_id, details: editingProfile.details ?? null, stateText: editingProfile.state_text ?? null })
                                                setProfiles((prev) => prev.map((p) => p.id === editingProfile.id ? { ...p, ...editingProfile } as PresenceProfile : p))
                                            } else {
                                                const p = await invoke<PresenceProfile>("add_profile", { name: editingProfile.name, clientId: editingProfile.client_id, details: editingProfile.details ?? null, stateText: editingProfile.state_text ?? null })
                                                setProfiles((prev) => [...prev, p])
                                            }
                                            setEditingProfile(null)
                                        } catch (err) { toast.error(`${err}`) }
                                    }}>{t("schedules.save")}</Button>
                                </div>
                            </div>
                        )}

                        {/* Schedule list */}
                        <div className="px-4 py-3">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{t("schedules.addSchedule")}</p>
                            {schedules.length === 0 && <p className="text-xs text-muted-foreground">{t("schedules.noSchedules")}</p>}
                            <div className="space-y-1.5">
                                {schedules.map((s) => {
                                    const prof = profiles.find((p) => p.id === s.profile_id)
                                    const pad = (n: number) => String(n).padStart(2, "0")
                                    return (
                                        <div key={s.id} className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 px-3 py-2 gap-2">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`h-1.5 w-1.5 rounded-full ${s.enabled ? "bg-green-500" : "bg-muted-foreground/40"}`} />
                                                    <p className="text-xs font-medium truncate">{s.label}</p>
                                                </div>
                                                <p className="text-xs text-muted-foreground">{pad(s.start_hour)}:{pad(s.start_minute)} – {pad(s.end_hour)}:{pad(s.end_minute)} · {prof?.name ?? "?"}</p>
                                            </div>
                                            <div className="flex gap-1 shrink-0">
                                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingSchedule(s)}><Pencil className="h-3 w-3" /></Button>
                                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={async () => {
                                                    await invoke("remove_schedule", { id: s.id }).catch(console.error)
                                                    setSchedules((prev) => prev.filter((x) => x.id !== s.id))
                                                }}><Trash2 className="h-3 w-3" /></Button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            {profiles.length > 0 && (
                                <Button variant="outline" size="sm" className="mt-2 gap-1.5 w-full" onClick={() => setEditingSchedule({ profile_id: profiles[0]?.id ?? "", label: "", start_hour: 9, start_minute: 0, end_hour: 17, end_minute: 0, days: [], enabled: true })}>
                                    <Plus className="h-3.5 w-3.5" />{t("schedules.addSchedule")}
                                </Button>
                            )}
                        </div>

                        {/* Schedule editor */}
                        {editingSchedule !== null && (
                            <div className="px-4 py-3 space-y-2 bg-muted/20">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("schedules.scheduleLabel")}</p>
                                <Input placeholder={t("schedules.scheduleLabelPlaceholder")} value={editingSchedule.label ?? ""} onChange={(e) => setEditingSchedule((s) => ({ ...s!, label: e.target.value }))} className="text-xs" />
                                <div className="flex gap-2 items-center">
                                    <span className="text-xs text-muted-foreground w-10">{t("schedules.from")}</span>
                                    <Input type="number" min={0} max={23} value={editingSchedule.start_hour ?? 9} onChange={(e) => setEditingSchedule((s) => ({ ...s!, start_hour: +e.target.value }))} className="w-16 h-7 text-xs text-center" />
                                    <span className="text-xs">:</span>
                                    <Input type="number" min={0} max={59} value={editingSchedule.start_minute ?? 0} onChange={(e) => setEditingSchedule((s) => ({ ...s!, start_minute: +e.target.value }))} className="w-16 h-7 text-xs text-center" />
                                </div>
                                <div className="flex gap-2 items-center">
                                    <span className="text-xs text-muted-foreground w-10">{t("schedules.to")}</span>
                                    <Input type="number" min={0} max={23} value={editingSchedule.end_hour ?? 17} onChange={(e) => setEditingSchedule((s) => ({ ...s!, end_hour: +e.target.value }))} className="w-16 h-7 text-xs text-center" />
                                    <span className="text-xs">:</span>
                                    <Input type="number" min={0} max={59} value={editingSchedule.end_minute ?? 0} onChange={(e) => setEditingSchedule((s) => ({ ...s!, end_minute: +e.target.value }))} className="w-16 h-7 text-xs text-center" />
                                </div>
                                <div className="flex gap-1 flex-wrap">
                                    {(["sun","mon","tue","wed","thu","fri","sat"] as const).map((d, i) => {
                                        const active = (editingSchedule.days ?? []).includes(i)
                                        return (
                                            <button key={d} type="button" onClick={() => setEditingSchedule((s) => {
                                                const days = s?.days ?? []
                                                return { ...s!, days: active ? days.filter((x) => x !== i) : [...days, i] }
                                            })} className={`text-xs px-2 py-1 rounded border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-foreground"}`}>
                                                {t(`schedules.${d}`)}
                                            </button>
                                        )
                                    })}
                                    {(editingSchedule.days ?? []).length === 0 && <span className="text-xs text-muted-foreground self-center ml-1">{t("schedules.allDays")}</span>}
                                </div>
                                <select value={editingSchedule.profile_id ?? ""} onChange={(e) => setEditingSchedule((s) => ({ ...s!, profile_id: e.target.value }))} className="w-full text-xs rounded-md border border-input bg-background px-3 py-1.5 h-8">
                                    <option value="">{t("schedules.selectProfile")}</option>
                                    {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                                <div className="flex gap-2 justify-end">
                                    <Button variant="outline" size="sm" onClick={() => setEditingSchedule(null)}>{t("settings.cancel")}</Button>
                                    <Button size="sm" disabled={!editingSchedule.label?.trim() || !editingSchedule.profile_id} onClick={async () => {
                                        try {
                                            const s = editingSchedule as ScheduleEntry
                                            if (s.id) {
                                                await invoke("update_schedule", { id: s.id, enabled: s.enabled, label: s.label, startHour: s.start_hour, startMinute: s.start_minute, endHour: s.end_hour, endMinute: s.end_minute, days: s.days })
                                                setSchedules((prev) => prev.map((x) => x.id === s.id ? s : x))
                                            } else {
                                                const ns = await invoke<ScheduleEntry>("add_schedule", { profileId: s.profile_id, label: s.label, startHour: s.start_hour, startMinute: s.start_minute, endHour: s.end_hour, endMinute: s.end_minute, days: s.days })
                                                setSchedules((prev) => [...prev, ns])
                                            }
                                            setEditingSchedule(null)
                                        } catch (err) { toast.error(`${err}`) }
                                    }}>{t("schedules.save")}</Button>
                                </div>
                            </div>
                        )}
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
