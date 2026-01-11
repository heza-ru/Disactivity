fn main() {
    // Note: Tauri automatically handles Windows resources including version info
    // via tauri.conf.json bundle settings. We only need to call tauri_build::build()
    // The metadata is configured in:
    // - tauri.conf.json: productName, version, bundle.publisher, bundle.copyright, etc.
    // - Cargo.toml: description, authors, license, repository

    tauri_build::build()
}
