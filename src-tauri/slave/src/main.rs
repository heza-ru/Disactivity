#![windows_subsystem = "windows"]

use std::ptr::null_mut;
use std::env;
use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;
use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, LoadIconW, LoadImageW,
    RegisterClassW, ShowWindow, TranslateMessage, CS_HREDRAW, CS_VREDRAW, MSG,
    SW_SHOWMINNOACTIVE, WNDCLASSW, WS_EX_APPWINDOW, WS_EX_NOACTIVATE,
    WS_OVERLAPPEDWINDOW, WS_POPUP, WM_CLOSE, WM_DESTROY, WM_QUERYENDSESSION,
    WM_ENDSESSION, IMAGE_ICON, LR_LOADFROMFILE,
};

/// Convert a Rust string to a null-terminated wide string for Windows API
fn to_wide_string(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

unsafe extern "system" fn wndproc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    match msg {
        WM_CLOSE => 0,
        WM_DESTROY => 0,
        WM_QUERYENDSESSION => 1,
        WM_ENDSESSION => 0,
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

fn main() {
    let exe_path = env::current_exe().unwrap_or_default();
    let exe_name = Path::new(&exe_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("DisactivitySlave");

    // Optional first argument: path to a .ico file to use as the window/taskbar icon
    let icon_file: Option<Vec<u16>> = env::args().nth(1).map(|p| to_wide_string(&p));

    let class_name = to_wide_string("DisactivitySlaveClass");
    let window_title = to_wide_string(exe_name);

    unsafe {
        let hinstance = GetModuleHandleW(null_mut());

        // Try loading the game icon from the provided path; fall back to the embedded resource
        let hicon = if let Some(ref wide_path) = icon_file {
            let h = LoadImageW(
                0,                   // NULL hinstance — loading from file
                wide_path.as_ptr(),
                IMAGE_ICON,
                0,                   // desired width  (0 = system default)
                0,                   // desired height (0 = system default)
                LR_LOADFROMFILE,
            );
            if h != 0 { h } else { LoadIconW(hinstance, 1usize as *const u16) }
        } else {
            LoadIconW(hinstance, 1usize as *const u16)
        };

        let wc = WNDCLASSW {
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(wndproc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: hinstance,
            hIcon: hicon,
            hCursor: null_mut(),
            hbrBackground: null_mut(),
            lpszMenuName: null_mut(),
            lpszClassName: class_name.as_ptr(),
        };

        RegisterClassW(&wc);

        // Using WS_EX_APPWINDOW so it appears in taskbar (some detection methods need this)
        // Using WS_EX_NOACTIVATE so it doesn't steal focus
        let hwnd = CreateWindowExW(
            WS_EX_APPWINDOW | WS_EX_NOACTIVATE,
            class_name.as_ptr(),
            window_title.as_ptr(), // Window title matches exe name
            WS_POPUP | WS_OVERLAPPEDWINDOW,
            -32000, // Off-screen X
            -32000, // Off-screen Y
            1,
            1,
            null_mut(),
            null_mut(),
            hinstance,
            null_mut(),
        );

        ShowWindow(hwnd, SW_SHOWMINNOACTIVE);

        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, null_mut(), 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
}
