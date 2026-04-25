// Minimal jsdom setup for Tauri-free unit tests
// Tauri invoke calls are not available in the test env; mock them per test if needed.

// jsdom’s storage can be incomplete in some Node setups; provide a full Storage mock.
const storageStore: Record<string, string> = {}
const testLocalStorage: Storage = {
    get length() {
        return Object.keys(storageStore).length
    },
    clear() {
        for (const k of Object.keys(storageStore)) {
            delete storageStore[k]
        }
    },
    getItem(key: string) {
        return Object.prototype.hasOwnProperty.call(storageStore, key) ? storageStore[key]! : null
    },
    key(index: number) {
        return Object.keys(storageStore)[index] ?? null
    },
    removeItem(key: string) {
        delete storageStore[key]
    },
    setItem(key: string, value: string) {
        storageStore[key] = value
    },
}
Object.defineProperty(globalThis, "localStorage", {
    value: testLocalStorage,
    configurable: true,
    writable: true,
})
