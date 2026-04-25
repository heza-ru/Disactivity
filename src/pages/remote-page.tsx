import { useState, useEffect, useRef, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { invoke } from "@tauri-apps/api/core"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { toast } from "sonner"
import {
    Wifi, WifiOff, Square, User, Music2, Code2,
    RefreshCw, Copy, CheckCircle2, Loader2, Smartphone
} from "lucide-react"
import type { PresenceProfile } from "@/types/schedules"
import type { NowPlaying, IdeActivity } from "@/types/schedules"

interface RemoteServerInfo {
    port: number
    addresses: string[]
    pin_required: boolean
    running: boolean
}

interface RemoteStatus {
    running_game_ids: string[]
    custom_presence_active: boolean
    schedule_active: boolean
    now_playing: NowPlaying | null
    ide_activity: IdeActivity | null
}

export function RemotePage() {
    const { t } = useTranslation()
    const [serverInfo, setServerInfo] = useState<RemoteServerInfo | null>(null)
    const [enabled, setEnabled] = useState(false)
    const [pin, setPin] = useState("")
    const [port, setPort] = useState(7523)
    const [loading, setLoading] = useState(false)
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        invoke<RemoteServerInfo>("get_remote_server_info")
            .then((info) => {
                setServerInfo(info)
                setEnabled(info.running)
                setPort(info.port)
            })
            .catch(console.error)
    }, [])

    const handleToggle = async () => {
        setLoading(true)
        try {
            const info = await invoke<RemoteServerInfo>("set_remote_server", {
                enabled: !enabled,
                port,
                pin: pin.trim() || null,
            })
            setServerInfo(info)
            setEnabled(info.running)
            toast.success(info.running ? t("remote.started") : t("remote.stopped"))
        } catch (err) {
            toast.error(`${err}`)
        } finally {
            setLoading(false)
        }
    }

    const copyAddress = async (addr: string) => {
        // `?pin=` works in the phone browser; custom `x-pin` headers cannot be set from a link tap
        const hasPin = pin.trim().length > 0
        const finalUrl = hasPin
            ? `http://${addr}/?${new URLSearchParams({ pin: pin.trim() })}`
            : `http://${addr}/`
        await navigator.clipboard.writeText(finalUrl).catch(() => {})
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <ScrollArea className="flex-1 mt-20">
            <main className="mx-auto max-w-xl px-6 py-8 pb-12 space-y-8">
                <div>
                    <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                        <Smartphone className="h-5 w-5" />
                        {t("remote.title")}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">{t("remote.description")}</p>
                </div>

                {/* Server toggle */}
                <section className="rounded-lg border border-border bg-card p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {enabled
                                ? <Wifi className="h-4 w-4 text-green-500" />
                                : <WifiOff className="h-4 w-4 text-muted-foreground" />}
                            <span className="text-sm font-medium">
                                {enabled ? t("remote.running") : t("remote.stopped")}
                            </span>
                        </div>
                        <Button size="sm" onClick={handleToggle} disabled={loading} className="gap-1.5">
                            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            {enabled ? t("remote.disable") : t("remote.enable")}
                        </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-muted-foreground">{t("remote.port")}</label>
                            <Input
                                type="number"
                                value={port}
                                onChange={(e) => setPort(+e.target.value)}
                                disabled={enabled}
                                className="h-8 text-xs mt-1"
                                min={1024}
                                max={65535}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground">{t("remote.pin")}</label>
                            <Input
                                type="password"
                                placeholder={t("remote.pinPlaceholder")}
                                value={pin}
                                onChange={(e) => setPin(e.target.value)}
                                disabled={enabled}
                                className="h-8 text-xs mt-1"
                                maxLength={8}
                            />
                        </div>
                    </div>
                </section>

                {/* Connection addresses */}
                {enabled && serverInfo && serverInfo.addresses.length > 0 && (
                    <section className="rounded-lg border border-border bg-card p-4 space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            {t("remote.connectFrom")}
                        </p>
                        {serverInfo.addresses.map((addr) => (
                            <div key={addr} className="flex items-center gap-2 rounded-md bg-muted/40 border border-border/50 px-3 py-2">
                                <code className="flex-1 text-sm font-mono">http://{addr}</code>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0"
                                    onClick={() => copyAddress(addr)}
                                >
                                    {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                                </Button>
                            </div>
                        ))}
                        <p className="text-xs text-muted-foreground">{t("remote.connectHint")}</p>
                    </section>
                )}

                {/* Live preview (desktop only — on mobile this would be the full controller) */}
                {enabled && <RemoteControlPanel serverInfo={serverInfo} pin={pin} />}
            </main>
        </ScrollArea>
    )
}

// ─── Embedded controller (also served as a standalone web page by the server) ──

function RemoteControlPanel({ serverInfo, pin }: { serverInfo: RemoteServerInfo | null; pin: string }) {
    const { t } = useTranslation()
    const [status, setStatus] = useState<RemoteStatus | null>(null)
    const [profiles, setProfiles] = useState<PresenceProfile[]>([])
    const wsRef = useRef<WebSocket | null>(null)

    const baseUrl = serverInfo?.addresses[0] ? `http://${serverInfo.addresses[0]}` : null
    const wsUrl = serverInfo?.addresses[0] ? `ws://${serverInfo.addresses[0]}` : null
    const headers = pin ? { "x-pin": pin } : undefined

    const fetchStatus = useCallback(async () => {
        if (!baseUrl) return
        try {
            const res = await fetch(`${baseUrl}/api/status`, { headers })
            if (res.ok) setStatus(await res.json())
        } catch { /* ignore */ }
    }, [baseUrl, headers])

    const fetchProfiles = useCallback(async () => {
        if (!baseUrl) return
        try {
            const res = await fetch(`${baseUrl}/api/profiles`, { headers })
            if (res.ok) setProfiles(await res.json())
        } catch { /* ignore */ }
    }, [baseUrl, headers])

    useEffect(() => {
        fetchStatus()
        fetchProfiles()
    }, [fetchStatus, fetchProfiles])

    useEffect(() => {
        if (!wsUrl) return
        const pinQ = pin.trim() ? `?pin=${encodeURIComponent(pin.trim())}` : ""
        const ws = new WebSocket(`${wsUrl}/api/events${pinQ}`)
        ws.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data)
                if (msg.event === "status") setStatus(msg.data)
            } catch { /* ignore */ }
        }
        wsRef.current = ws
        return () => { ws.close(); wsRef.current = null }
    }, [wsUrl, pin])

    const stopGame = async (gameId: string) => {
        if (!baseUrl) return
        await fetch(`${baseUrl}/api/games/stop`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify({ game_id: gameId }),
        })
        fetchStatus()
    }

    const activateProfile = async (profileId: string) => {
        if (!baseUrl) return
        await fetch(`${baseUrl}/api/profiles/activate`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify({ profile_id: profileId }),
        })
        fetchStatus()
    }

    const clearPresence = async () => {
        if (!baseUrl) return
        await fetch(`${baseUrl}/api/presence`, { method: "DELETE", headers })
        fetchStatus()
    }

    return (
        <section className="rounded-lg border border-border bg-card divide-y divide-border/60">
            {/* Running games */}
            <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("taskManager.title")}</p>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchStatus}>
                        <RefreshCw className="h-3 w-3" />
                    </Button>
                </div>
                {!status?.running_game_ids.length
                    ? <p className="text-xs text-muted-foreground">{t("taskManager.noGames")}</p>
                    : <div className="space-y-1.5">
                        {status.running_game_ids.map((id) => (
                            <div key={id} className="flex items-center justify-between rounded-md bg-muted/40 border border-border/50 px-3 py-2">
                                <div className="flex items-center gap-2">
                                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                                    <span className="text-xs font-mono truncate max-w-[180px]">{id}</span>
                                </div>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => stopGame(id)}>
                                    <Square className="h-3 w-3 fill-current" />
                                </Button>
                            </div>
                        ))}
                    </div>
                }
            </div>

            {/* Presence profiles */}
            <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("schedules.title")}</p>
                    {status?.custom_presence_active && (
                        <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={clearPresence}>
                            {t("customPresence.deactivate")}
                        </Button>
                    )}
                </div>
                {profiles.length === 0
                    ? <p className="text-xs text-muted-foreground">{t("schedules.noProfiles")}</p>
                    : <div className="flex flex-wrap gap-1.5">
                        {profiles.map((p) => (
                            <button
                                key={p.id}
                                onClick={() => activateProfile(p.id)}
                                className="text-xs px-2.5 py-1 rounded-full border border-border hover:border-primary hover:bg-primary/10 transition-colors"
                            >
                                <User className="h-3 w-3 inline mr-1 opacity-60" />
                                {p.name}
                            </button>
                        ))}
                    </div>
                }
            </div>

            {/* Now playing / IDE */}
            {(status?.now_playing || status?.ide_activity) && (
                <div className="px-4 py-3 space-y-1.5">
                    {status.now_playing && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Music2 className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">
                                {status.now_playing.artist ? `${status.now_playing.artist} — ` : ""}
                                {status.now_playing.title}
                            </span>
                            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-muted">{status.now_playing.source}</span>
                        </div>
                    )}
                    {status.ide_activity && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Code2 className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">
                                {status.ide_activity.file ?? status.ide_activity.editor}
                                {status.ide_activity.project ? ` · ${status.ide_activity.project}` : ""}
                            </span>
                        </div>
                    )}
                </div>
            )}
        </section>
    )
}
