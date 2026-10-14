// Rust FFI bindings đến C++ backend
// Module này kết nối Rust với thư viện C++ xkiro_backend đã build

use std::ffi::{CStr, CString};
use std::os::raw::c_char;

// FFI Import từ C++
#[link(name = "xkiro_backend")]
extern "C" {
    // System monitoring
    fn xkiro_get_system_info() -> *const SystemInfo;
    fn xkiro_refresh_system_info();

    // Market data
    fn xkiro_get_economic_data(country: *const c_char) -> *const EconomicIndicator;
    fn xkiro_get_stock_list(country: *const c_char, out: *mut Stock, max: usize) -> usize;
    fn xkiro_get_chart_data(symbol: *const c_char, ts: *mut u64, vals: *mut f64, count: *mut usize) -> i32;

    // Key management
    fn xkiro_save_key(service: *const c_char, key: *const c_char) -> i32;
    fn xkiro_get_key(service: *const c_char) -> *const c_char;
    fn xkiro_delete_key(service: *const c_char);

    // CLI Runner
    fn xkiro_cli_execute(cmd: *const c_char, cb: extern "C" fn(*const c_char, *mut std::ffi::c_void), ud: *mut std::ffi::c_void) -> u64;
    fn xkiro_cli_is_running(handle: u64) -> i32;
    fn xkiro_cli_kill(handle: u64);

    // Web fetch
    fn xkiro_web_fetch(url: *const c_char) -> *mut c_char;
    fn xkiro_web_search(query: *const c_char) -> *mut c_char;
    fn xkiro_free_string(s: *mut c_char);
}

// Cấu trúc mapping với C struct
#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct SystemInfo {
    pub cpu_usage: f64,
    pub cpu_temp: f64,
    pub cpu_cores: u32,
    pub ram_total: u64,
    pub ram_used: u64,
    pub ram_available: u64,
    pub cpu_name: [c_char; 256],
    pub gpu_name: [c_char; 256],
    pub gpu_usage: f64,
    pub gpu_temp: f64,
    pub gpu_vram_total: u64,
    pub gpu_vram_used: u64,
    pub disk_usage: f64,
    pub disk_read: u64,
    pub disk_write: u64,
    pub net_upload: u64,
    pub net_download: u64,
}

#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct EconomicIndicator {
    pub country: [c_char; 8],
    pub gdp_growth: f64,
    pub inflation: f64,
    pub unemployment: f64,
    pub interest_rate: f64,
    pub index_name: [c_char; 32],
    pub index_value: f64,
    pub index_change: f64,
    pub index_change_pct: f64,
}

#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct Stock {
    pub symbol: [c_char; 16],
    pub name: [c_char; 128],
    pub price: f64,
    pub change: f64,
    pub change_pct: f64,
    pub volume: f64,
}

// Wrapper functions an toàn cho Tauri commands
pub fn get_system_info() -> SystemInfo {
    unsafe { *xkiro_get_system_info() }
}

pub fn refresh_system() {
    unsafe { xkiro_refresh_system_info() };
}

pub fn get_economic(country: &str) -> Option<EconomicIndicator> {
    let c_country = CString::new(country).ok()?;
    unsafe {
        let ptr = xkiro_get_economic_data(c_country.as_ptr());
        if ptr.is_null() { None } else { Some(*ptr) }
    }
}

pub fn get_stocks(country: &str) -> Vec<Stock> {
    let c_country = match CString::new(country) {
        Ok(c) => c,
        Err(_) => return vec![],
    };
    let mut buf = vec![Stock {
        symbol: [0; 16], name: [0; 128], price: 0.0, change: 0.0, change_pct: 0.0, volume: 0.0
    }; 100];
    unsafe {
        let count = xkiro_get_stock_list(c_country.as_ptr(), buf.as_mut_ptr(), buf.len());
        buf.truncate(count);
    }
    buf
}

pub fn save_api_key(service: &str, key: &str) -> bool {
    let c_svc = match CString::new(service) { Ok(c) => c, Err(_) => return false };
    let c_key = match CString::new(key) { Ok(c) => c, Err(_) => return false };
    unsafe { xkiro_save_key(c_svc.as_ptr(), c_key.as_ptr()) == 1 }
}

pub fn get_api_key(service: &str) -> Option<String> {
    let c_svc = CString::new(service).ok()?;
    unsafe {
        let ptr = xkiro_get_key(c_svc.as_ptr());
        if ptr.is_null() { return None; }
        CStr::from_ptr(ptr).to_str().ok().map(|s| s.to_string())
    }
}

pub fn run_cli_command(cmd: &str) -> Result<u64, String> {
    let c_cmd = CString::new(cmd).map_err(|e| e.to_string())?;
    extern "C" fn cli_callback(line: *const c_char, _ud: *mut std::ffi::c_void) {
        if !line.is_null() {
            unsafe {
                if let Ok(s) = CStr::from_ptr(line).to_str() {
                    print!("{}", s);
                }
            }
        }
    }
    unsafe { Ok(xkiro_cli_execute(c_cmd.as_ptr(), cli_callback, std::ptr::null_mut())) }
}

pub fn web_fetch(url: &str) -> Result<String, String> {
    let c_url = CString::new(url).map_err(|e| e.to_string())?;
    unsafe {
        let ptr = xkiro_web_fetch(c_url.as_ptr());
        if ptr.is_null() { return Err("Fetch failed".into()); }
        let result = CStr::from_ptr(ptr).to_str().map_err(|e| e.to_string())?.to_string();
        xkiro_free_string(ptr);
        Ok(result)
    }
}
