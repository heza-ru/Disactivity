"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { AppSettings } from "@/lib/settings"

interface SettingsDialogProps {
    settings: AppSettings
    onSave: (settings: AppSettings) => void
}

export function SettingsDialog({ settings, onSave }: SettingsDialogProps) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const [draft, setDraft] = useState<AppSettings>(settings)

    const handleOpen = (isOpen: boolean) => {
        if (isOpen) setDraft(settings)
        setOpen(isOpen)
    }

    const handleSave = () => {
        onSave(draft)
        setOpen(false)
    }

    return (
        <Dialog open={open} onOpenChange={handleOpen}>
            <TooltipProvider delayDuration={200}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <DialogTrigger asChild>
                            <Button variant="secondary" size="icon" className="h-8 w-8">
                                <Settings className="h-4 w-4" />
                            </Button>
                        </DialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{t("settings.tooltip")}</TooltipContent>
                </Tooltip>
            </TooltipProvider>

            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Settings className="h-4 w-4" />
                        {t("settings.title")}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-5 py-2">
                    {/* Items per page */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">{t("settings.itemsPerPage")}</label>
                        <p className="text-xs text-muted-foreground">{t("settings.itemsPerPageDesc")}</p>
                        <Input
                            type="number"
                            min={10}
                            max={200}
                            step={10}
                            value={draft.itemsPerPage}
                            onChange={(e) => {
                                const val = Math.max(10, Math.min(200, parseInt(e.target.value) || 50))
                                setDraft((d) => ({ ...d, itemsPerPage: val }))
                            }}
                            className="w-28"
                        />
                    </div>

                    {/* Auto-stop toggle */}
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-3">
                            <input
                                id="auto-stop-toggle"
                                type="checkbox"
                                checked={draft.autoStopEnabled}
                                onChange={(e) => setDraft((d) => ({ ...d, autoStopEnabled: e.target.checked }))}
                                className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                            />
                            <label htmlFor="auto-stop-toggle" className="text-sm font-medium cursor-pointer">
                                {t("settings.autoStop")}
                            </label>
                        </div>
                        <p className="text-xs text-muted-foreground pl-7">{t("settings.autoStopDesc")}</p>
                    </div>

                    {/* Auto-stop duration */}
                    {draft.autoStopEnabled && (
                        <div className="space-y-1.5 pl-7">
                            <label className="text-sm font-medium">{t("settings.autoStopMinutes")}</label>
                            <div className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    min={1}
                                    max={120}
                                    value={draft.autoStopMinutes}
                                    onChange={(e) => {
                                        const val = Math.max(1, Math.min(120, parseInt(e.target.value) || 15))
                                        setDraft((d) => ({ ...d, autoStopMinutes: val }))
                                    }}
                                    className="w-20"
                                />
                                <span className="text-sm text-muted-foreground">{t("settings.minutes")}</span>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        {t("settings.cancel")}
                    </Button>
                    <Button onClick={handleSave}>{t("settings.save")}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
