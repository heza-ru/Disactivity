fn main() {
    #[cfg(windows)]
    {
        let mut res = winresource::WindowsResource::new();

        // Metadata shown in file properties — no embedded icon so the
        // taskbar/window icon comes purely from the runtime-loaded game .ico.
        res.set("FileDescription", "Game Activity Helper");
        res.set("ProductName", "Disactivity Game Runner");
        res.set("OriginalFilename", "slave.exe");
        res.set("FileVersion", "0.0.1");
        res.set("ProductVersion", "0.0.1");
        res.set("InternalName", "slave");
        res.set("Comments", "Game activity simulator");

        res.compile().expect("Failed to compile Windows resources");
    }
}
