"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { getVersion } from "@tauri-apps/api/app"
import { ScrollArea } from "@/components/ui/scroll-area"

export function AboutPage() {
    const { t } = useTranslation()
    const [version, setVersion] = useState<string>("—")

    useEffect(() => {
        getVersion().then(setVersion).catch(() => {})
    }, [])

    return (
        <ScrollArea className="flex-1 mt-20">
            <main className="mx-auto max-w-2xl px-6 py-8 pb-12">
                <div className="flex flex-col items-center gap-3 mb-10">
                    <img src="./icon.png" alt="Disactivity" className="h-16 w-16 rounded-2xl shadow-lg" />
                    <div className="text-center">
                        <h1 className="text-2xl font-bold text-foreground">Disactivity</h1>
                        <p className="text-sm text-muted-foreground">v{version}</p>
                    </div>
                    <p className="text-sm text-muted-foreground text-center max-w-sm">
                        {t("about.description")}
                    </p>
                </div>

                <div className="text-center text-xs text-muted-foreground mt-8">
                    <p>MIT License</p>
                </div>
            </main>
        </ScrollArea>
    )
}
