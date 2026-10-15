#pragma once
#include "xkiro.h"
#include <string>
#include <mutex>

class SystemMonitor {
public:
    static SystemMonitor& instance();
    void refresh();
    const SystemInfo& get_info() const { return info; }

private:
    SystemMonitor();
    ~SystemMonitor() = default;
    SystemMonitor(const SystemMonitor&) = delete;
    SystemMonitor& operator=(const SystemMonitor&) = delete;

    void read_cpu_usage();
    void read_memory_info();
    void read_cpu_name();
    void read_gpu_info();
    void read_disk_io();
    void read_disk_space();
    void read_network_io();

    SystemInfo info{};
    std::mutex mtx;

    uint64_t prev_idle = 0, prev_total = 0;
    uint64_t prev_disk_read = 0, prev_disk_write = 0;
    uint64_t prev_net_up = 0, prev_net_down = 0;
    uint64_t last_check_ms = 0;
};

// FFI exports
extern "C" {
    const SystemInfo* xkiro_get_system_info();
    void xkiro_refresh_system_info();
}
