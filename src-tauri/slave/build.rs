use winresource::WindowsResource;

fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default() == "windows" {
        let mut res = WindowsResource::new();

        // Set executable metadata
        res.set("FileDescription", "Slave app for Disactivity");
        res.set("ProductName", "Disactivity Slave");
        res.set("OriginalFilename", "slave.exe");
        res.set("LegalCopyright", "Copyright © 2026 holasoyender");
        res.set("CompanyName", "holasoyender");
        res.set("FileVersion", "0.0.1");
        res.set("ProductVersion", "0.0.1");
        res.set("InternalName", "slave");
        res.set("Comments", "Game activity simulator for Discord");

        // Compile the resource
        res.compile().expect("Failed to compile Windows resources");
    }
}

