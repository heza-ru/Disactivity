#![windows_subsystem = "windows"]

use std::env;
use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;
use std::ptr::null_mut;
use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, LoadImageW, RegisterClassW,
    ShowWindow, CS_HREDRAW, CS_VREDRAW, HICON, IMAGE_ICON, LR_LOADFROMFILE, MSG,
    SW_SHOWMINNOACTIVE, WNDCLASSW, WM_CLOSE, WM_DESTROY, WM_ENDSESSION, WM_QUERYENDSESSION,
    WS_EX_APPWINDOW, WS_EX_NOACTIVATE, WS_OVERLAPPEDWINDOW, WS_POPUP,
};

fn to_wide(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

unsafe extern "system" fn wndproc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    match msg {
        WM_CLOSE | WM_DESTROY => 0,
        WM_QUERYENDSESSION => 1,
        WM_ENDSESSION => 0,
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

fn main() {
    let exe_path = env::current_exe().unwrap_or_default();
    let exe_stem = Path::new(&exe_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Game")
        .to_string();

    let args: Vec<String> = env::args().collect();
    // argv[1] = path to downloaded .ico file (empty string if unavailable)
    let icon_path: Option<String> = args.get(1).filter(|s| !s.is_empty()).cloned();
    // argv[2] = friendly display name passed by the main app
    let display_name = args.get(2).cloned().unwrap_or(exe_stem);

    let class_name = to_wide("DisactivitySlaveClass");
    let window_title = to_wide(&display_name);

    unsafe {
        let hinstance = GetModuleHandleW(null_mut());

        // Load game icon so the taskbar button shows the correct game art.
        let hicon: HICON = icon_path
            .as_deref()
            .map(|path| {
                let wide = to_wide(path);
                LoadImageW(null_mut(), wide.as_ptr(), IMAGE_ICON, 0, 0, LR_LOADFROMFILE) as HICON
            })
            .filter(|h| !h.is_null())
            .unwrap_or(null_mut());

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

        // WS_EX_APPWINDOW forces a taskbar button — some Discord detection paths
        // require a window handle with this flag to register the process as a game.
        // WS_EX_NOACTIVATE prevents focus stealing.
        // Position off-screen (-32000, -32000) at 1×1 px: present but invisible.
        let hwnd = CreateWindowExW(
            WS_EX_APPWINDOW | WS_EX_NOACTIVATE,
            class_name.as_ptr(),
            window_title.as_ptr(),
            WS_POPUP | WS_OVERLAPPEDWINDOW,
            -32000,
            -32000,
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
            DispatchMessageW(&msg);
        }
    }
}
