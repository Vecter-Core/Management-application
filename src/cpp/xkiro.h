#pragma once

#ifdef __cplusplus
extern "C" {
#endif

#include <stdint.h>
#include <stddef.h>

// ============================================
// FFI Header cho Rust gọi C++ functions
// ============================================

// Giám sát hệ thống
typedef struct {
    double cpu_usage;       // % sử dụng CPU
    double cpu_temp;        // Nhiệt độ CPU (°C)
    uint32_t cpu_cores;     // Số nhân
    uint64_t ram_total;     // Tổng RAM (bytes)
    uint64_t ram_used;      // RAM đã dùng
    uint64_t ram_available; // RAM trống
    char cpu_name[256];     // Tên CPU
    char gpu_name[256];     // Tên GPU
    double gpu_usage;       // % sử dụng GPU
    double gpu_temp;        // Nhiệt độ GPU
    uint64_t gpu_vram_total;
    uint64_t gpu_vram_used;
    double disk_usage;      // % sử dụng ổ đĩa
    uint64_t disk_read;     // B/s đọc
    uint64_t disk_write;    // B/s ghi
    uint64_t net_upload;    // B/s upload
    uint64_t net_download;  // B/s download
} SystemInfo;

const SystemInfo* xkiro_get_system_info();
void xkiro_refresh_system_info();

// Dữ liệu thị trường kinh tế
typedef struct {
    char country[8];            // US, VN, JP, CN, EU...
    double gdp_growth;          // % tăng trưởng GDP
    double inflation;           // % lạm phát
    double unemployment;        // % thất nghiệp
    double interest_rate;       // Lãi suất %
    char index_name[32];        // Tên chỉ số: S&P 500, VN-Index...
    double index_value;         // Điểm
    double index_change;        // Thay đổi điểm
    double index_change_pct;    // % thay đổi
} EconomicIndicator;

typedef struct {
    char symbol[16];
    char name[128];
    double price;
    double change;
    double change_pct;
    double volume;
} Stock;

// Lấy chỉ số kinh tế theo quốc gia
const EconomicIndicator* xkiro_get_economic_data(const char* country_code);
size_t xkiro_get_stock_list(const char* country_code, Stock* out_stocks, size_t max_count);

// Quản lý API Keys
int xkiro_save_key(const char* service, const char* key);
const char* xkiro_get_key(const char* service);
void xkiro_delete_key(const char* service);

// Chạy lệnh CLI
typedef void (*CliOutputCallback)(const char* line, void* userdata);
uint64_t xkiro_cli_execute(const char* command, CliOutputCallback callback, void* userdata);
int xkiro_cli_is_running(uint64_t handle);
void xkiro_cli_kill(uint64_t handle);

// Web scraping & tìm kiếm
char* xkiro_web_fetch(const char* url);
char* xkiro_web_search(const char* query);
void xkiro_free_string(char* str);

// Lấy dữ liệu biểu đồ
int xkiro_get_chart_data(const char* symbol, uint64_t* timestamps, double* values, size_t* count);

#ifdef __cplusplus
}
#endif
