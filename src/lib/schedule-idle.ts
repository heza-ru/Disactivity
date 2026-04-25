/**
 * Run work after the main thread is idle (or after `timeout` ms at latest).
 * Use for non-critical startup work (e.g. discovery) so first paint stays snappy.
 */
export function scheduleWhenIdle(fn: () => void, timeout = 2_500): void {
    if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(fn, { timeout })
    } else {
        setTimeout(fn, 0)
    }
}
