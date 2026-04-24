#![cfg_attr(windows, windows_subsystem = "windows")]

#[cfg(windows)]
use std::env;
#[cfg(windows)]
use std::ffi::OsStr;
#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;
#[cfg(windows)]
use std::path::Path;
#[cfg(windows)]
use std::ptr::null_mut;
#[cfg(windows)]
use std::sync::OnceLock;
#[cfg(windows)]
use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU64, Ordering};
#[cfg(windows)]
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(windows)]
use windows_sys::Win32::Foundation::{HGDIOBJ, HWND, LPARAM, LRESULT, RECT, WPARAM};
#[cfg(windows)]
use windows_sys::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE};
#[cfg(windows)]
use windows_sys::Win32::Graphics::Gdi::{
    BeginPaint, BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, CreateFontW, CreateSolidBrush,
    DeleteDC, DeleteObject, DrawIconEx, DrawTextW, EndPaint, FillRect, GetClientRect,
    SelectObject, SetBkMode, SetTextColor, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_CHARSET,
    DEFAULT_PITCH, DI_NORMAL, DT_CENTER, DT_END_ELLIPSIS, DT_LEFT, DT_SINGLELINE, DT_VCENTER,
    OUT_DEFAULT_PRECIS, PAINTSTRUCT, SRCCOPY,
};
#[cfg(windows)]
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
#[cfg(windows)]
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, GetSystemMetrics,
    KillTimer, LoadCursorW, LoadImageW, PostMessageW, PostQuitMessage, RegisterClassW,
    ReleaseCapture, SendMessageW, SetTimer, ShowWindow, SystemParametersInfoW, TranslateMessage,
    HTCAPTION, IDC_ARROW, IMAGE_ICON, LR_LOADFROMFILE, MSG, SM_CXSCREEN, SM_CYSCREEN,
    SPI_GETWORKAREA, SW_MINIMIZE, SW_SHOWNOACTIVATE, TME_LEAVE, TRACKMOUSEEVENT, WNDCLASSW,
    WM_CLOSE, WM_DESTROY, WM_ENDSESSION, WM_ERASEBKGND, WM_LBUTTONDOWN, WM_MOUSELEAVE,
    WM_MOUSEMOVE, WM_NCLBUTTONDOWN, WM_PAINT, WM_QUERYENDSESSION, WM_RBUTTONDOWN, WM_SIZE,
    WM_TIMER, CS_HREDRAW, CS_VREDRAW, WS_EX_APPWINDOW, WS_EX_TOPMOST, WS_POPUP, WS_VISIBLE,
};

// ─── Window geometry ──────────────────────────────────────────────────────────

#[cfg(windows)]
const W: i32 = 300;
#[cfg(windows)]
const H: i32 = 94;

// Button row
#[cfg(windows)]
const BTN_Y: i32 = 66;
#[cfg(windows)]
const BTN_H: i32 = 22;
#[cfg(windows)]
const BTN_MIN_X1: i32 = 10;
#[cfg(windows)]
const BTN_MIN_X2: i32 = 143;
#[cfg(windows)]
const BTN_STP_X1: i32 = 153;
#[cfg(windows)]
const BTN_STP_X2: i32 = 290;

#[cfg(windows)]
const TIMER_ID: usize = 1;

// ─── Global state (single message-loop thread) ────────────────────────────────

#[cfg(windows)]
static START_MS: AtomicU64 = AtomicU64::new(0);
#[cfg(windows)]
static HOVER_MIN: AtomicBool = AtomicBool::new(false);
#[cfg(windows)]
static HOVER_STP: AtomicBool = AtomicBool::new(false);
#[cfg(windows)]
static HICON: AtomicIsize = AtomicIsize::new(0);
#[cfg(windows)]
static TRACKING: AtomicBool = AtomicBool::new(false);

#[cfg(windows)]
static GAME_NAME_WIDE: OnceLock<Vec<u16>> = OnceLock::new();

// ─── Helpers ──────────────────────────────────────────────────────────────────

#[cfg(windows)]
fn to_wide(s: &str) -> Vec<u16> {
    OsStr::new(s)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

/// COLORREF is 0x00BBGGRR
#[cfg(windows)]
fn rgb(r: u8, g: u8, b: u8) -> u32 {
    (r as u32) | ((g as u32) << 8) | ((b as u32) << 16)
}

#[cfg(windows)]
fn elapsed_secs() -> u64 {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let start = START_MS.load(Ordering::Relaxed);
    if now >= start { (now - start) / 1000 } else { 0 }
}

#[cfg(windows)]
fn format_time(secs: u64) -> String {
    let h = secs / 3600;
    let m = (secs % 3600) / 60;
    let s = secs % 60;
    if h > 0 {
        format!("{:02}:{:02}:{:02}", h, m, s)
    } else {
        format!("{:02}:{:02}", m, s)
    }
}

#[cfg(windows)]
fn lparam_x(lp: LPARAM) -> i32 { (lp & 0xffff) as u16 as i16 as i32 }
#[cfg(windows)]
fn lparam_y(lp: LPARAM) -> i32 { ((lp >> 16) & 0xffff) as u16 as i16 as i32 }

// ─── Window procedure ─────────────────────────────────────────────────────────

#[cfg(windows)]
unsafe extern "system" fn wndproc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    match msg {
        // Start 1-second repaint timer
        _ if msg == 0x0001 /* WM_CREATE */ => {
            SetTimer(hwnd, TIMER_ID, 1000, None);
            0
        }

        _ if msg == WM_TIMER => {
            use windows_sys::Win32::UI::WindowsAndMessaging::InvalidateRect;
            InvalidateRect(hwnd, null_mut(), 0);
            0
        }

        // Suppress background erase — we fill everything in WM_PAINT
        _ if msg == WM_ERASEBKGND => 1,

        _ if msg == WM_PAINT => {
            let mut ps: PAINTSTRUCT = std::mem::zeroed();
            let hdc_real = BeginPaint(hwnd, &mut ps);

            // ── Double-buffer to eliminate flicker ──
            let hdc = CreateCompatibleDC(hdc_real);
            let hbm = CreateCompatibleBitmap(hdc_real, W, H);
            let hbm_old = SelectObject(hdc, hbm as HGDIOBJ);

            // ── Background ──
            let bg = rgb(30, 30, 46);
            let mut full = RECT { left: 0, top: 0, right: W, bottom: H };
            let hbr_bg = CreateSolidBrush(bg);
            FillRect(hdc, &full, hbr_bg);
            DeleteObject(hbr_bg as HGDIOBJ);

            // ── Title bar strip (top 26px) ──
            let mut title_rect = RECT { left: 0, top: 0, right: W, bottom: 26 };
            let hbr_title = CreateSolidBrush(rgb(20, 20, 36));
            FillRect(hdc, &title_rect, hbr_title);
            DeleteObject(hbr_title as HGDIOBJ);

            // ── Green running dot (top-right of title bar) ──
            let mut dot = RECT { left: W - 20, top: 8, right: W - 8, bottom: 20 };
            let hbr_dot = CreateSolidBrush(rgb(100, 220, 100));
            FillRect(hdc, &dot, hbr_dot);
            DeleteObject(hbr_dot as HGDIOBJ);

            // ── Shared font setup ──
            SetBkMode(hdc, 1 /* TRANSPARENT */);

            // Title text (game name, small, in bar)
            let hfont_sm = CreateFontW(
                13, 0, 0, 0, 400, 0, 0, 0,
                DEFAULT_CHARSET as u32,
                OUT_DEFAULT_PRECIS as u32,
                CLIP_DEFAULT_PRECIS as u32,
                CLEARTYPE_QUALITY as u32,
                DEFAULT_PITCH as u32,
                to_wide("Segoe UI").as_ptr(),
            );
            let prev = SelectObject(hdc, hfont_sm as HGDIOBJ);
            SetTextColor(hdc, rgb(180, 180, 200));

            let name = GAME_NAME_WIDE.get()
                .cloned()
                .unwrap_or_else(|| to_wide("Game Running"));
            let mut nr = RECT { left: 10, top: 0, right: W - 24, bottom: 26 };
            DrawTextW(hdc, name.as_ptr(), -1, &mut nr,
                DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_END_ELLIPSIS);

            SelectObject(hdc, prev);
            DeleteObject(hfont_sm as HGDIOBJ);

            // ── Game icon (32×32 at left of content area) ──
            let hicon = HICON.load(Ordering::Relaxed) as isize;
            if hicon != 0 {
                DrawIconEx(hdc, 10, 29, hicon, 32, 32, 0, 0, DI_NORMAL);
            }

            // ── Elapsed time (large, green) ──
            let hfont_time = CreateFontW(
                24, 0, 0, 0, 700, 0, 0, 0,
                DEFAULT_CHARSET as u32,
                OUT_DEFAULT_PRECIS as u32,
                CLIP_DEFAULT_PRECIS as u32,
                CLEARTYPE_QUALITY as u32,
                DEFAULT_PITCH as u32,
                to_wide("Segoe UI").as_ptr(),
            );
            let prev = SelectObject(hdc, hfont_time as HGDIOBJ);
            SetTextColor(hdc, rgb(166, 227, 161));

            let time_str = format_time(elapsed_secs());
            let time_wide = to_wide(&time_str);
            let mut tr = RECT { left: 50, top: 26, right: W - 8, bottom: 64 };
            DrawTextW(hdc, time_wide.as_ptr(), -1, &mut tr,
                DT_LEFT | DT_VCENTER | DT_SINGLELINE);

            SelectObject(hdc, prev);
            DeleteObject(hfont_time as HGDIOBJ);

            // ── Buttons ──
            let hfont_btn = CreateFontW(
                12, 0, 0, 0, 600, 0, 0, 0,
                DEFAULT_CHARSET as u32,
                OUT_DEFAULT_PRECIS as u32,
                CLIP_DEFAULT_PRECIS as u32,
                CLEARTYPE_QUALITY as u32,
                DEFAULT_PITCH as u32,
                to_wide("Segoe UI").as_ptr(),
            );
            let prev = SelectObject(hdc, hfont_btn as HGDIOBJ);
            SetTextColor(hdc, rgb(255, 255, 255));
            SetBkMode(hdc, 1);

            let hov_min = HOVER_MIN.load(Ordering::Relaxed);
            let hov_stp = HOVER_STP.load(Ordering::Relaxed);

            // Minimize button
            let col_min = if hov_min { rgb(37, 99, 235) } else { rgb(59, 130, 246) };
            let mut btn_min = RECT {
                left: BTN_MIN_X1, top: BTN_Y,
                right: BTN_MIN_X2, bottom: BTN_Y + BTN_H,
            };
            let hbr_min = CreateSolidBrush(col_min);
            FillRect(hdc, &btn_min, hbr_min);
            DeleteObject(hbr_min as HGDIOBJ);
            DrawTextW(hdc, to_wide("Minimize").as_ptr(), -1, &mut btn_min,
                DT_CENTER | DT_VCENTER | DT_SINGLELINE);

            // Stop button
            let col_stp = if hov_stp { rgb(220, 38, 38) } else { rgb(239, 68, 68) };
            let mut btn_stp = RECT {
                left: BTN_STP_X1, top: BTN_Y,
                right: BTN_STP_X2, bottom: BTN_Y + BTN_H,
            };
            let hbr_stp = CreateSolidBrush(col_stp);
            FillRect(hdc, &btn_stp, hbr_stp);
            DeleteObject(hbr_stp as HGDIOBJ);
            DrawTextW(hdc, to_wide("Stop").as_ptr(), -1, &mut btn_stp,
                DT_CENTER | DT_VCENTER | DT_SINGLELINE);

            SelectObject(hdc, prev);
            DeleteObject(hfont_btn as HGDIOBJ);

            // ── Blit memory DC → real DC ──
            BitBlt(hdc_real, 0, 0, W, H, hdc, 0, 0, SRCCOPY);

            SelectObject(hdc, hbm_old);
            DeleteObject(hbm as HGDIOBJ);
            DeleteDC(hdc);

            EndPaint(hwnd, &ps);
            0
        }

        _ if msg == WM_LBUTTONDOWN => {
            let x = lparam_x(lp);
            let y = lparam_y(lp);

            if y >= BTN_Y && y <= BTN_Y + BTN_H {
                if x >= BTN_MIN_X1 && x <= BTN_MIN_X2 {
                    ShowWindow(hwnd, SW_MINIMIZE);
                } else if x >= BTN_STP_X1 && x <= BTN_STP_X2 {
                    PostQuitMessage(0);
                }
            } else {
                // Drag the borderless window
                ReleaseCapture();
                SendMessageW(hwnd, WM_NCLBUTTONDOWN, HTCAPTION as WPARAM, 0);
            }
            0
        }

        _ if msg == WM_RBUTTONDOWN => {
            PostQuitMessage(0);
            0
        }

        _ if msg == WM_MOUSEMOVE => {
            let x = lparam_x(lp);
            let y = lparam_y(lp);

            let in_btn_row = y >= BTN_Y && y <= BTN_Y + BTN_H;
            let new_hm = in_btn_row && x >= BTN_MIN_X1 && x <= BTN_MIN_X2;
            let new_hs = in_btn_row && x >= BTN_STP_X1 && x <= BTN_STP_X2;

            let changed =
                HOVER_MIN.swap(new_hm, Ordering::Relaxed) != new_hm ||
                HOVER_STP.swap(new_hs, Ordering::Relaxed) != new_hs;

            if changed {
                use windows_sys::Win32::UI::WindowsAndMessaging::InvalidateRect;
                InvalidateRect(hwnd, null_mut(), 0);
            }

            // Subscribe to WM_MOUSELEAVE once per entry
            if !TRACKING.swap(true, Ordering::Relaxed) {
                let mut tme = TRACKMOUSEEVENT {
                    cbSize: std::mem::size_of::<TRACKMOUSEEVENT>() as u32,
                    dwFlags: TME_LEAVE,
                    hwndTrack: hwnd,
                    dwHoverTime: 0,
                };
                use windows_sys::Win32::UI::WindowsAndMessaging::TrackMouseEvent;
                TrackMouseEvent(&mut tme);
            }
            0
        }

        _ if msg == WM_MOUSELEAVE => {
            TRACKING.store(false, Ordering::Relaxed);
            HOVER_MIN.store(false, Ordering::Relaxed);
            HOVER_STP.store(false, Ordering::Relaxed);
            use windows_sys::Win32::UI::WindowsAndMessaging::InvalidateRect;
            InvalidateRect(hwnd, null_mut(), 0);
            0
        }

        // Throttle repaints when minimised — no point waking every second when hidden
        _ if msg == WM_SIZE => {
            let is_minimized = (wp as u32) == 1; // SIZE_MINIMIZED = 1
            KillTimer(hwnd, TIMER_ID);
            SetTimer(hwnd, TIMER_ID, if is_minimized { 10_000 } else { 1_000 }, None);
            DefWindowProcW(hwnd, msg, wp, lp)
        }

        _ if msg == WM_CLOSE || msg == WM_DESTROY => {
            KillTimer(hwnd, TIMER_ID);
            PostQuitMessage(0);
            0
        }

        _ if msg == WM_QUERYENDSESSION => 1,
        _ if msg == WM_ENDSESSION => 0,

        _ => DefWindowProcW(hwnd, msg, wp, lp),
    }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

#[cfg(windows)]
fn main() {
    // Record process start time, minus a 10-second grace offset.
    // Discord's process scanner takes a few seconds to detect a new process;
    // starting the displayed timer 10 s ahead keeps it roughly in sync with
    // what Discord shows once it picks up the activity.
    let start_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
        .saturating_sub(10_000);
    START_MS.store(start_ms, Ordering::Relaxed);

    // Derive names from argv / exe path
    let exe_path = env::current_exe().unwrap_or_default();
    let exe_stem = Path::new(&exe_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Game")
        .to_string();

    let args: Vec<String> = env::args().collect();
    let icon_path: Option<String> = args.get(1).filter(|s| !s.is_empty()).cloned();
    // argv[2] = friendly display name (e.g. "Cyberpunk 2077")
    let display_name = args.get(2).cloned().unwrap_or(exe_stem);

    GAME_NAME_WIDE.set(to_wide(&display_name)).ok();

    let class_name = to_wide("DisactivitySlaveClass");
    let window_title = to_wide(&display_name);

    unsafe {
        let hinstance = GetModuleHandleW(null_mut());

        // Load the game icon from the downloaded .ico file
        let hicon = if let Some(ref path) = icon_path {
            let wide = to_wide(path);
            let h = LoadImageW(
                0,
                wide.as_ptr(),
                IMAGE_ICON,
                0, 0,
                LR_LOADFROMFILE,
            ) as isize;
            if h != 0 { h } else {
                // Fallback: system default application icon
                LoadImageW(0, 32512usize as *const u16, IMAGE_ICON, 0, 0, 0) as isize
            }
        } else {
            LoadImageW(0, 32512usize as *const u16, IMAGE_ICON, 0, 0, 0) as isize
        };
        HICON.store(hicon, Ordering::Relaxed);

        let wc = WNDCLASSW {
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(wndproc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: hinstance,
            hIcon: hicon,
            hCursor: LoadCursorW(0, IDC_ARROW),
            hbrBackground: 0,
            lpszMenuName: null_mut(),
            lpszClassName: class_name.as_ptr(),
        };
        RegisterClassW(&wc);

        // Position: bottom-right of the work area (excludes taskbar)
        let mut work: RECT = std::mem::zeroed();
        SystemParametersInfoW(SPI_GETWORKAREA, 0, &mut work as *mut RECT as *mut _, 0);
        let wx = work.right - W - 12;
        let wy = work.bottom - H - 8;

        let hwnd = CreateWindowExW(
            WS_EX_APPWINDOW | WS_EX_TOPMOST,
            class_name.as_ptr(),
            window_title.as_ptr(),
            WS_POPUP | WS_VISIBLE,
            wx, wy,
            W, H,
            null_mut(), null_mut(), hinstance, null_mut(),
        );

        // Windows 11: request rounded corners (silently ignored on Win10)
        let corner: u32 = 2; // DWMWCP_ROUND
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &corner as *const u32 as *const _,
            4,
        );

        ShowWindow(hwnd, SW_SHOWNOACTIVATE);

        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, null_mut(), 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
}

#[cfg(not(windows))]
fn main() {
    // On non-Windows platforms the slave binary is not used for its GUI,
    // but it must exist as a valid executable for setup_game_executable to embed.
    // Simply sleep forever so the process stays alive while Discord detects it.
    loop {
        std::thread::sleep(std::time::Duration::from_secs(60));
    }
}
