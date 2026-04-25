import * as React from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from "lucide-react"

function Pagination({ className, "aria-label": ariaLabel, ...props }: React.ComponentProps<"nav">) {
  const { t } = useTranslation()
  return (
    <nav
      role="navigation"
      aria-label={ariaLabel ?? t("pagination.label")}
      data-slot="pagination"
      className={cn(
        "mx-auto flex w-full justify-center",
        className
      )}
      {...props}
    />
  )
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("gap-1 flex items-center flex-wrap justify-center", className)}
      {...props}
    />
  )
}

function PaginationItem({ ...props }: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />
}

type PaginationLinkProps = {
  isActive?: boolean
} & Pick<React.ComponentProps<typeof Button>, "size"> &
  React.ComponentProps<"a">

function PaginationLink({
  className,
  isActive,
  size = "icon",
  ...props
}: PaginationLinkProps) {
  return (
    <Button
      asChild
      variant={isActive ? "outline" : "ghost"}
      size={size}
      className={cn(className)}
    >
      <a
        aria-current={isActive ? "page" : undefined}
        data-slot="pagination-link"
        data-active={isActive}
        {...props}
      />
    </Button>
  )
}

function PaginationPrevious({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  const { t } = useTranslation()
  return (
    <PaginationLink
      aria-label={t("pagination.ariaPrevious")}
      size="default"
      className={cn("pl-2! max-sm:h-8", className)}
      {...props}
    >
      <ChevronLeftIcon data-icon="inline-start" />
      <span className="hidden sm:block">
        {t("pagination.previous")}
      </span>
    </PaginationLink>
  )
}

function PaginationNext({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  const { t } = useTranslation()
  return (
    <PaginationLink
      aria-label={t("pagination.ariaNext")}
      size="default"
      className={cn("pr-2! max-sm:h-8", className)}
      {...props}
    >
      <span className="hidden sm:block">{t("pagination.next")}</span>
      <ChevronRightIcon data-icon="inline-end" />
    </PaginationLink>
  )
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  const { t } = useTranslation()
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn(
        "size-9 items-center justify-center [&_svg:not([class*='size-'])]:size-4 flex",
        className
      )}
      {...props}
    >
      <MoreHorizontalIcon
      />
      <span className="sr-only">{t("pagination.morePages")}</span>
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
}
