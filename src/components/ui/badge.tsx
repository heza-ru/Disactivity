import * as React from "react"
import { cn } from "@/lib/utils"

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    variant?: "default" | "secondary" | "outline"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                variant === "default" && "bg-primary/15 text-primary",
                variant === "secondary" && "bg-muted text-muted-foreground",
                variant === "outline" && "border border-border text-foreground",
                className
            )}
            {...props}
        />
    )
}

export { Badge }
