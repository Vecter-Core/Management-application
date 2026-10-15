#pragma once
// ============================================================
//  system_probe.h — đọc số liệu THẬT của máy (Linux /proc, /sys,
//  lsblk, ufw, apt…) thay cho dữ liệu mô phỏng.
//  Mọi hàm đều trả về dữ liệu đo được; khi không đọc được thì
//  báo rõ "unknown"/"unsupported" chứ KHÔNG bịa số.
// ============================================================
#include <string>
#include <vector>
#include <cstdint>

struct ProcInfo {
    long pid = 0;
    std::string name;        // /proc/<pid>/stat  (comm)
    std::string state;       // R/S/D/Z/T
    std::string user;        // uid → tên người dùng
    std::string cmdline;     // dòng lệnh đầy đủ
    std::string exe;         // readlink /proc/<pid>/exe (rỗng nếu không có quyền)
    double cpu_pct = 0;      // % CPU giữa 2 lần gọi (lần đầu = 0, có cờ first_sample)
    uint64_t rss = 0;        // bytes
    long threads = 0;
    uint64_t started_unix = 0;
    std::string trust;       // good | warn | bad | kernel | unknown
    std::string trust_note;  // giải thích thật tại sao
};

struct ConnInfo {
    std::string proto;       // tcp, tcp6, udp, udp6
    std::string local;       // ip:port thật
    std::string remote;      // ip:port thật
    std::string state;       // ESTABLISHED/LISTEN/…
    long pid = 0;            // tiến trình sở hữu socket (0 = không xác định được)
    std::string pname;
    bool listening = false;
    bool loopback = false;
};

struct SecItem {
    std::string id;
    std::string icon;
    std::string title;
    std::string status;      // good | warn | bad | unknown | unsupported
    std::string detail;      // số liệu / kết quả kiểm tra thật
    std::string source;      // lệnh hoặc file đã dùng để kiểm tra
};

struct DiskInfo {
    std::string device, mount, fstype;
    uint64_t total = 0, used = 0, avail = 0;
    double pct = 0;
};

struct TempInfo {
    std::string zone;        // x86_pkg_temp, acpitz…
    double celsius = 0;
};

struct NetIface {
    std::string name;        // eth0, wlan0, lo…
    std::string ip;          // IPv4 thật (getifaddrs)
    std::string mask;
    bool up = false;
    bool loopback = false;
};

struct NetInfo {
    std::string hostname;
    std::vector<NetIface> ifaces;
    std::string gateway;     // /proc/net/route (0.0.0.0/0)
    std::string gw_iface;
    std::vector<std::string> dns;   // /etc/resolv.conf
    std::string public_ip;   // dịch vụ IP công cộng (curl) — rỗng nếu không gọi được
    std::string isp, country, city;
    std::string note;        // lý do thật nếu thiếu phần nào đó
    bool real_public = false;
};

struct PingResult {
    std::string host;
    int port = 443;
    int sent = 0, ok = 0;
    double min_ms = 0, avg_ms = 0, max_ms = 0;
    std::vector<double> samples;
    std::string note;        // "đo bằng TCP connect, không phải ICMP"
};

namespace probe {

    bool available();                          // có phải Linux /proc không
    std::vector<ProcInfo> processes(size_t limit = 200, bool* first_sample = nullptr);
    std::vector<ConnInfo> connections(size_t limit = 300);
    std::vector<SecItem> security();
    std::vector<DiskInfo> disks();
    std::vector<TempInfo> temps();
    PingResult tcp_ping(const std::string& host, int port, int count, int timeout_ms = 2000);
    NetInfo  net_info(bool want_public = true);   // IP thật của máy + gateway/DNS + IP công cộng/ISP
    int  kill_pid(long pid, int sig, std::string& err);
    std::string optimize_report();             // JSON: bộ nhớ có thể thu hồi, cache thật
    double cpu_total_pct();                    // % CPU toàn máy (delta /proc/stat)
    uint64_t uptime_seconds();

}
