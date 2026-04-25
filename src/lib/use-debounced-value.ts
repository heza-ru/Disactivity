import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Returns `value` after `delay` ms of stability. `flush` applies an immediate
 * value (e.g. on Enter) without waiting.
 */
export function useDebouncedValueWithFlush<T>(value: T, delay: number) {
    const [debounced, setDebounced] = useState(value)
    const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)

    const flush = useCallback(
        (next: T) => {
            if (timeout.current) clearTimeout(timeout.current)
            timeout.current = null
            setDebounced(next)
        },
        []
    )

    useEffect(() => {
        if (timeout.current) clearTimeout(timeout.current)
        timeout.current = setTimeout(() => setDebounced(value), delay)
        return () => {
            if (timeout.current) clearTimeout(timeout.current)
        }
    }, [value, delay])

    return { debounced, flush } as const
}
