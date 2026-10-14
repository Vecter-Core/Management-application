#include "system_monitor.h"
#include <fstream>
#include <sstream>
#include <string>
#include <thread>
#include <chrono>
#include <sys/sysinfo.h>
#include <unistd.h>
#include <cstring>

SystemMonitor& SystemMonitor::instance() {
    static SystemMonitor inst;
    return inst;
}

SystemMonitor::SystemMonitor() {
    memset(&info, 0, sizeof(info));
    info.cpu_cores = std::thread::hardware_concurrency();
    read_cpu_name();
    read_gpu_info();
    refresh();
}

void SystemMonitor::read_cpu_name() {
    std::ifstream f("/proc/cpuinfo");
    std::string line;
    while (std::getline(f, line)) {
        if (line.starts_with("model name")) {
            size_t pos = line.find(':');
            if (pos != std::string::npos) {
                std::string name = line.substr(pos + 2);
                strncpy(info.cpu_name, name.c_str(), sizeof(info.cpu_name) - 1);
                break;
            }
        }
    }
    strncpy(info.gpu_name, "Detecting GPU...", sizeof(info.gpu_name) - 1);
}

void SystemMonitor::read_gpu_info() {
    // Đọc thông tin GPU nếu có NVIDIA SMI hoặc AMD
    FILE* pipe = popen("lspci | grep -E 'VGA|3D controller' | head -1", "r");
    if (pipe) {
        char buf[256] = {0};
        if (fgets(buf, sizeof(buf), pipe)) {
            char* name = strstr(buf, ": ");
            if (name) {
                name += 2;
                strncpy(info.gpu_name, name, sizeof(info.gpu_name) - 1);
                info.gpu_name[strcspn(info.gpu_name, "\n")] = 0;
            }
        }
        pclose(pipe);
    }

    // Kiểm tra nvidia-smi
    pipe = popen("nvidia-smi --query-gpu=utilization.gpu,temperature.gpu,memory.total,memory.used --format=csv,noheader,nounits 2>/dev/null", "r");
    if (pipe) {
        int util, temp, mem_total, mem_used;
        if (fscanf(pipe, "%d, %d, %d, %d", &util, &temp, &mem_total, &mem_used) == 4) {
            info.gpu_usage = util;
            info.gpu_temp = temp;
            info.gpu_vram_total = (uint64_t)mem_total * 1024 * 1024;
            info.gpu_vram_used = (uint64_t)mem_used * 1024 * 1024;
        }
        pclose(pipe);
    }
}

void SystemMonitor::read_cpu_usage() {
    std::ifstream f("/proc/stat");
    uint64_t user, nice, system, idle, iowait, irq, softirq;
    f >> line >> user >> nice >> system >> idle >> iowait >> irq >> softirq;

    uint64_t total = user + nice + system + idle + iowait + irq + softirq;
    uint64_t total_diff = total - prev_total;
    uint64_t idle_diff = idle - prev_idle;

    if (total_diff > 0) {
        info.cpu_usage = (100.0 * (total_diff - idle_diff)) / total_diff;
    }

    prev_total = total;
    prev_idle = idle;

    // Đọc nhiệt độ CPU
    std::ifstream temp_f("/sys/class/thermal/thermal_zone0/temp");
    if (temp_f) {
        int temp;
        temp_f >> temp;
        info.cpu_temp = temp / 1000.0;
    }
}

void SystemMonitor::read_memory_info() {
    struct sysinfo si{};
    sysinfo(&si);
    info.ram_total = si.totalram;
    info.ram_available = si.freeram + si.bufferram;
    info.ram_used = info.ram_total - info.ram_available;
}

void SystemMonitor::read_disk_io() {
    std::ifstream f("/proc/diskstats");
    std::string line;
    uint64_t read_sectors = 0, write_sectors = 0;

    while (std::getline(f, line)) {
        std::istringstream iss(line);
        uint64_t r, w;
        std::string dev;
        int major, minor;
        iss >> major >> minor >> dev;
        for (int i = 0; i < 3; i++) iss.ignore(100, ' ');
        iss >> r;
        for (int i = 0; i < 3; i++) iss.ignore(100, ' ');
        iss >> w;
        read_sectors += r;
        write_sectors += w;
    }

    uint64_t now = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now().time_since_epoch()
    ).count();

    double dt = (now - last_check_ms) / 1000.0;
    if (dt > 0) {
        info.disk_read = ((read_sectors - prev_disk_read) * 512) / dt;
        info.disk_write = ((write_sectors - prev_disk_write) * 512) / dt;
    }
    prev_disk_read = read_sectors;
    prev_disk_write = write_sectors;
}

void SystemMonitor::read_network_io() {
    std::ifstream f("/proc/net/dev");
    std::string line;
    std::getline(f, line); std::getline(f, line); // Bỏ 2 dòng header

    uint64_t down = 0, up = 0;
    while (std::getline(f, line)) {
        size_t colon = line.find(':');
        if (colon == std::string::npos) continue;
        std::istringstream iss(line.substr(colon + 1));
        uint64_t r, t;
        iss >> r;
        for (int i = 0; i < 7; i++) iss.ignore(100, ' ');
        iss >> t;
        down += r; up += t;
    }

    uint64_t now = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now().time_since_epoch()
    ).count();
    double dt = (now - last_check_ms) / 1000.0;
    if (dt > 0) {
        info.net_download = (down - prev_net_down) / dt;
        info.net_upload = (up - prev_net_up) / dt;
    }
    prev_net_down = down;
    prev_net_up = up;
}

void SystemMonitor::refresh() {
    std::lock_guard<std::mutex> lock(mtx);
    read_cpu_usage();
    read_memory_info();
    read_disk_io();
    read_network_io();

    last_check_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now().time_since_epoch()
    ).count();
}

extern "C" {
    const SystemInfo* xkiro_get_system_info() {
        return &SystemMonitor::instance().get_info();
    }
    void xkiro_refresh_system_info() {
        SystemMonitor::instance().refresh();
    }
}
