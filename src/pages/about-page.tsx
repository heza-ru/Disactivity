"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { getVersion } from "@tauri-apps/api/app"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ExternalLink, Loader2, Star, Zap } from "lucide-react"

interface GitHubContributor {
    login: string
    avatar_url: string
    html_url: string
    contributions: number
}

function ContributorCard({
    login,
    avatar_url,
    html_url,
    contributions,
    role,
}: GitHubContributor & { role?: string }) {
    const { t } = useTranslation()

    return (
        <div className="flex flex-col items-center gap-3 p-5 rounded-xl bg-card border border-border/50 hover:border-border transition-colors">
            <img
                src={avatar_url}
                alt={login}
                className="h-20 w-20 rounded-full object-cover ring-2 ring-border"
                loading="lazy"
            />
            <div className="text-center">
                <p className="font-semibold text-foreground">{login}</p>
                {role && (
                    <p className="text-xs text-primary font-medium mt-0.5">{role}</p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">
                    {contributions} {t("about.contributions", { count: contributions })}
                </p>
            </div>
            <a
                href={html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-auto"
            >
                <ExternalLink className="h-3 w-3" />
                {t("about.viewOnGithub")}
            </a>
        </div>
    )
}

export function AboutPage() {
    const { t } = useTranslation()
    const [version, setVersion] = useState<string>("—")
    const [contributors, setContributors] = useState<GitHubContributor[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        getVersion().then(setVersion).catch(() => {})

        fetch("https://api.github.com/repos/holasoyender/disactivity/contributors")
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`)
                return r.json() as Promise<GitHubContributor[]>
            })
            .then((data) => {
                // heza-ru shown separately; exclude from the general list
                setContributors(data.filter((c) => c.login.toLowerCase() !== "heza-ru"))
            })
            .catch((e) => setError(String(e)))
            .finally(() => setIsLoading(false))
    }, [])

    const originalCreator = contributors.find((c) => c.login.toLowerCase() === "holasoyender")
    const otherContributors = contributors.filter((c) => c.login.toLowerCase() !== "holasoyender")

    return (
        <ScrollArea className="flex-1 mt-20">
            <main className="mx-auto max-w-2xl px-6 py-8 pb-12">
                {/* App Header */}
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

                {/* Original Creator */}
                <section className="mb-8">
                    <div className="flex items-center gap-2 mb-4">
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                            {t("about.originalCreator")}
                        </h2>
                    </div>
                    {isLoading ? (
                        <div className="flex justify-center py-6">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : originalCreator ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <ContributorCard {...originalCreator} role={t("about.originalCreatorRole")} />
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <ContributorCard
                                login="holasoyender"
                                avatar_url="https://github.com/holasoyender.png"
                                html_url="https://github.com/holasoyender"
                                contributions={0}
                                role={t("about.originalCreatorRole")}
                            />
                        </div>
                    )}
                </section>

                {/* Feature Enhancer */}
                <section className="mb-8">
                    <div className="flex items-center gap-2 mb-4">
                        <Zap className="h-4 w-4 text-primary" />
                        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                            {t("about.featureEnhancer")}
                        </h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <ContributorCard
                            login="heza-ru"
                            avatar_url="https://github.com/heza-ru.png"
                            html_url="https://github.com/heza-ru"
                            contributions={0}
                            role={t("about.featureEnhancerRole")}
                        />
                    </div>
                </section>

                {/* Other Contributors */}
                {(isLoading || otherContributors.length > 0 || error) && (
                    <section className="mb-8">
                        <div className="flex items-center gap-2 mb-4">
                            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                                {t("about.contributors")}
                            </h2>
                        </div>
                        {isLoading ? (
                            <div className="flex justify-center py-6">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : error ? (
                            <p className="text-sm text-muted-foreground text-center py-4">
                                {t("about.errorContributors")}
                            </p>
                        ) : otherContributors.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">
                                {t("about.noOtherContributors")}
                            </p>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                {otherContributors.map((c) => (
                                    <ContributorCard key={c.login} {...c} />
                                ))}
                            </div>
                        )}
                    </section>
                )}

                {/* Footer */}
                <div className="text-center text-xs text-muted-foreground mt-8">
                    <p>MIT License · Copyright © 2026 holasoyender</p>
                    <a
                        href="https://github.com/holasoyender/disactivity"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-foreground transition-colors inline-flex items-center gap-1 mt-1"
                    >
                        <ExternalLink className="h-3 w-3" />
                        github.com/holasoyender/disactivity
                    </a>
                </div>
            </main>
        </ScrollArea>
    )
}
