fn main() {
    // Ensure the embedded slave helper binary is fresh.
    // The app includes ../slave/target/release/slave(.exe) via include_bytes!,
    // so we must rebuild that target before compiling this crate.
    println!("cargo:rerun-if-changed=slave/src/main.rs");
    println!("cargo:rerun-if-changed=slave/Cargo.toml");
    println!("cargo:rerun-if-changed=slave/build.rs");

    let status = std::process::Command::new("cargo")
        .args(["build", "--release", "--manifest-path", "slave/Cargo.toml"])
        .status()
        .expect("failed to invoke cargo for slave helper build");
    if !status.success() {
        panic!("failed to build slave helper (release)");
    }

    // Note: Tauri automatically handles Windows resources including version info
    // via tauri.conf.json bundle settings. We only need to call tauri_build::build()
    // The metadata is configured in:
    // - tauri.conf.json: productName, version, bundle.publisher, bundle.copyright, etc.
    // - Cargo.toml: description, authors, license, repository

    tauri_build::build()
}
