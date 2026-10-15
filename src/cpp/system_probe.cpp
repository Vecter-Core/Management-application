// ============================================================
//  system_probe.cpp — số liệu THẬT của máy, đọc từ /proc, /sys
//  và các lệnh có sẵn (lsblk, ufw, apt, smartctl…).
//  Nguyên tắc: không bịa. Không đọc được → status "unknown"/"unsupported"
//  kèm lý do thật (thiếu quyền, thiếu lệnh, không phải Linux…).
// ============================================================
#include "system_probe.h"

#include <algorithm>
#include <array>
#include <cerrno>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cctype>
#include <cstring>
#include <ctime>
#include <fstream>
#include <map>
#include <mutex>
#include <set>
#include <sstream>
#include <string>
#include <thread>
#include <vector>
#include <signal.h>
#include <unistd.h>
#include <pwd.h>
#include <dirent.h>
#include <netdb.h>
#include <sys/socket.h>
#include <sys/select.h>
#include <sys/statvfs.h>
#include <sys/types.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <ifaddrs.h>
#include <net/if.h>
#include <fcntl.h>

namespace {

    /* ---------- đọc file ---------- */
    std::string read_all(const std::string& path) {
        std::ifstream f(path);
        if (!f) return "";
        std::ostringstream ss;
        ss << f.rdbuf();
        return ss.str();
    }
    std::vector<std::string> split(const std::string& s, char sep = ' ') {
        std::vector<std::string> out;
        std::string cur;
        std::istringstream ss(s);
        if (sep == ' ') { while (ss >> cur) out.push_back(cur); }
        else { while (std::getline(ss, cur, sep)) out.push_back(cur); }
        return out;
    }
    std::string trim(const std::string& s) {
        size_t a = s.find_first_not_of(" \t\r\n");
        if (a == std::string::npos) return "";
        size_t b = s.find_last_not_of(" \t\r\n");
        return s.substr(a, b - a + 1);
    }
    std::string json_escape(const std::string& s) {
        std::string o;
        for (unsigned char c : s) {
            switch (c) {
                case '"': o += "\\\""; break;
                case '\\': o += "\\\\"; break;
                case '\n': o += "\\n"; break;
                case '\r': o += "\\r"; break;
                case '\t': o += "\\t"; break;
                default: if (c < 0x20) { char b[8]; std::snprintf(b, sizeof(b), "\\u%04x", c); o += b; } else o += (char)c;
            }
        }
        return o;
    }

    /* ---------- chạy lệnh ngoài, có timeout, không in rác ---------- */
    std::string run_cmd(const std::string& cmd, int timeout_s = 5, size_t max_bytes = 65536) {
        std::string full = "(" + cmd + ") 2>/dev/null";
        if (access("/usr/bin/timeout", X_OK) == 0) {
            std::string q;
            for (char c : full) { if (c == '\'') q += "'\\''"; else q += c; }
            full = std::string("/usr/bin/timeout ") + std::to_string(timeout_s) + "s sh -c '" + q + "'";
        }
        FILE* p = popen(full.c_str(), "r");
        if (!p) return "";
        std::string out;
        std::array<char, 4096> buf{};
        while (out.size() < max_bytes) {
            size_t n = std::fread(buf.data(), 1, std::min(buf.size(), max_bytes - out.size()), p);
            if (!n) break;
            out.append(buf.data(), n);
        }
        pclose(p);
        return out;
    }
    bool has_cmd(const std::string& name) {
        static std::map<std::string, bool> cache;
        auto it = cache.find(name);
        if (it != cache.end()) return it->second;
        bool ok = !trim(run_cmd("command -v " + name, 3)).empty();
        cache[name] = ok;
        return ok;
    }
    long clk_tck() { static long v = sysconf(_SC_CLK_TCK); return v > 0 ? v : 100; }
    uint64_t now_ms() {
        return (uint64_t)std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now().time_since_epoch()).count();
    }

    /* ---------- đọc /proc/net (tcp, tcp6, udp, udp6) ---------- */
    std::string decode_addr_v4(const std::string& hex) {
        if (hex.size() != 8) return "?";
        unsigned b[4];
        for (int i = 0; i < 4; i++) b[i] = (unsigned)std::strtoul(hex.substr(i * 2, 2).c_str(), nullptr, 16);
        char out[24];
        std::snprintf(out, sizeof(out), "%u.%u.%u.%u", b[3], b[2], b[1], b[0]);
        return out;
    }
    std::string decode_addr_v6(const std::string& hex) {
        if (hex.size() != 32) return "?";
        unsigned char bytes[16];
        for (int g = 0; g < 4; g++) {                       // 4 nhóm 32-bit, mỗi nhóm little-endian
            for (int i = 0; i < 4; i++) {
                bytes[g * 4 + i] = (unsigned char)std::strtoul(hex.substr(g * 8 + (3 - i) * 2, 2).c_str(), nullptr, 16);
            }
        }
        char out[INET6_ADDRSTRLEN] = {0};
        inet_ntop(AF_INET6, bytes, out, sizeof(out));
        return out;
    }
    const char* tcp_state(int st) {
        switch (st) {
            case 0x01: return "ESTABLISHED"; case 0x02: return "SYN_SENT"; case 0x03: return "SYN_RECV";
            case 0x04: return "FIN_WAIT1"; case 0x05: return "FIN_WAIT2"; case 0x06: return "TIME_WAIT";
            case 0x07: return "CLOSE"; case 0x08: return "CLOSE_WAIT"; case 0x09: return "LAST_ACK";
            case 0x0A: return "LISTEN"; case 0x0B: return "CLOSING"; default: return "UNKNOWN";
        }
    }

    // inode socket → pid (quét /proc/*/fd, cache 2 giây vì khá tốn)
    const std::map<std::string, long>& socket_inodes() {
        static std::map<std::string, long> m;
        static uint64_t last = 0;
        static std::mutex mtx;
        std::lock_guard<std::mutex> lk(mtx);
        uint64_t t = now_ms();
        if (t - last < 2000) return m;
        m.clear();
        DIR* proc = opendir("/proc");
        if (!proc) { last = t; return m; }
        struct dirent* e;
        while ((e = readdir(proc))) {
            if (!std::isdigit((unsigned char)e->d_name[0])) continue;
            std::string fddir = std::string("/proc/") + e->d_name + "/fd";
            DIR* fd = opendir(fddir.c_str());
            if (!fd) continue;
            struct dirent* f;
            while ((f = readdir(fd))) {
                char link[512], target[256];
                std::snprintf(link, sizeof(link), "%s/%s", fddir.c_str(), f->d_name);
                ssize_t n = readlink(link, target, sizeof(target) - 1);
                if (n <= 0) continue;
                target[n] = 0;
                if (!std::strncmp(target, "socket:[", 8)) {
                    std::string inode(target + 8);
                    size_t rb = inode.find(']');
                    if (rb != std::string::npos) inode = inode.substr(0, rb);
                    m[inode] = std::atol(e->d_name);
                }
            }
            closedir(fd);
        }
        closedir(proc);
        last = t;
        return m;
    }

    std::string proc_name(long pid) {
        std::string s = read_all("/proc/" + std::to_string(pid) + "/comm");
        return trim(s);
    }
    std::string uid_name(const std::string& uid) {
        struct passwd* pw = getpwuid((uid_t)std::strtoul(uid.c_str(), nullptr, 10));
        return pw && pw->pw_name ? std::string(pw->pw_name) : ("uid " + uid);
    }

    std::vector<std::string> numeric_dirs(const std::string& base) {
        std::vector<std::string> out;
        DIR* d = opendir(base.c_str());
        if (!d) return out;
        struct dirent* e;
        while ((e = readdir(d))) {
            if (std::isdigit((unsigned char)e->d_name[0])) out.push_back(e->d_name);
        }
        closedir(d);
        return out;
    }

    // binary nằm ở chỗ đáng ngờ? (thư mục tạm, bộ nhớ chia sẻ, thư mục ẩn)
    bool suspicious_path(const std::string& e) {
        if (e.rfind("/tmp/", 0) == 0 || e.rfind("/var/tmp/", 0) == 0 || e.rfind("/dev/shm/", 0) == 0 ||
            e.rfind("/run/user/", 0) == 0) return true;
        return e.find("/.") != std::string::npos;   // /home/user/.hidden/prog
    }

    /* trạng thái CPU toàn máy giữa 2 lần gọi */
    //  Cả hai hàm đo %CPU đều so sánh 2 lần đọc /proc. Nếu 2 lần đọc cách nhau vài chục
    //  mili-giây thì chỉ cần 1 jiffy (10 ms) cũng thành hàng chục % — số liệu sai dù "thật".
    //  Vì vậy luôn chờ cho cửa sổ đo đủ dài (250–400 ms) trước khi đọc lần hai.
    void wait_window(uint64_t& last, uint64_t min_ms) {
        if (last) {
            const uint64_t age = now_ms() - last;
            if (age < min_ms) std::this_thread::sleep_for(std::chrono::milliseconds(min_ms - age));
        }
        last = now_ms();
    }

    double cpu_pct_internal() {
        static uint64_t prev_total = 0, prev_idle = 0;
        static uint64_t last_call = 0;
        static std::mutex mtx;
        std::lock_guard<std::mutex> lk(mtx);
        wait_window(last_call, 250);
        std::string line;
        std::istringstream ss(read_all("/proc/stat"));
        if (!std::getline(ss, line)) return -1;
        auto f = split(line);
        if (f.size() < 5 || f[0] != "cpu") return -1;
        uint64_t user = std::strtoull(f[1].c_str(), nullptr, 10);
        uint64_t nice = std::strtoull(f[2].c_str(), nullptr, 10);
        uint64_t system = std::strtoull(f[3].c_str(), nullptr, 10);
        uint64_t idle = std::strtoull(f[4].c_str(), nullptr, 10);
        uint64_t iowait = f.size() > 5 ? std::strtoull(f[5].c_str(), nullptr, 10) : 0;
        uint64_t irq = f.size() > 6 ? std::strtoull(f[6].c_str(), nullptr, 10) : 0;
        uint64_t softirq = f.size() > 7 ? std::strtoull(f[7].c_str(), nullptr, 10) : 0;
        uint64_t steal = f.size() > 8 ? std::strtoull(f[8].c_str(), nullptr, 10) : 0;
        uint64_t total = user + nice + system + idle + iowait + irq + softirq + steal;
        uint64_t idle_all = idle + iowait;
        double pct = -1;
        if (prev_total && total > prev_total) {
            uint64_t dt = total - prev_total, di = idle_all > prev_idle ? idle_all - prev_idle : 0;
            pct = 100.0 * (double)(dt - di) / (double)dt;
        }
        prev_total = total; prev_idle = idle_all;
        return pct;
    }

} // namespace

namespace probe {

    bool available() {
        static bool ok = (access("/proc/stat", R_OK) == 0);
        return ok;
    }

    uint64_t uptime_seconds() {
        auto f = split(read_all("/proc/uptime"));
        return f.empty() ? 0 : (uint64_t)std::strtod(f[0].c_str(), nullptr);
    }

    double cpu_total_pct() { return cpu_pct_internal(); }

    /* ---------------- tiến trình thật ---------------- */
    std::vector<ProcInfo> processes(size_t limit, bool* first_sample) {
        std::vector<ProcInfo> out;
        if (!available()) { if (first_sample) *first_sample = true; return out; }

        static std::map<long, std::pair<uint64_t, uint64_t>> prev;  // pid → (jiffies, ms)
        static std::mutex mtx;
        static bool first = true;

        std::lock_guard<std::mutex> lk(mtx);
        if (first_sample) *first_sample = first;

        static uint64_t last_sample = 0;
        if (!first) wait_window(last_sample, 400); else last_sample = now_ms();
        uint64_t t_now = last_sample;
        const auto& socks = socket_inodes(); (void)socks;

        for (const std::string& d : numeric_dirs("/proc")) {
            long pid = std::atol(d.c_str());
            ProcInfo p;
            p.pid = pid;

            std::string stat = read_all("/proc/" + d + "/stat");
            size_t lp = stat.find('('), rp = stat.rfind(')');
            if (lp == std::string::npos || rp == std::string::npos || rp <= lp) continue;
            p.name = stat.substr(lp + 1, rp - lp - 1);
            auto tok = split(stat.substr(rp + 2));
            if (tok.size() < 20) continue;
            p.state = tok[0];
            uint64_t utime = std::strtoull(tok[11].c_str(), nullptr, 10);
            uint64_t stime = std::strtoull(tok[12].c_str(), nullptr, 10);
            p.threads = std::atol(tok[17].c_str());
            uint64_t starttime_j = std::strtoull(tok[19].c_str(), nullptr, 10);

            // %CPU = delta jiffies / (delta giây * CLK_TCK)
            uint64_t jif = utime + stime;
            auto it = prev.find(pid);
            if (!first && it != prev.end() && t_now > it->second.second) {
                double secs = (double)(t_now - it->second.second) / 1000.0;
                long dj = (long)jif - (long)it->second.first;
                if (secs > 0 && dj >= 0) p.cpu_pct = 100.0 * (double)dj / (double)clk_tck() / secs;
            }
            prev[pid] = { jif, t_now };

            // status: Uid + VmRSS
            std::string status = read_all("/proc/" + d + "/status");
            std::istringstream ss(status);
            std::string line;
            while (std::getline(ss, line)) {
                if (line.rfind("Uid:", 0) == 0) { auto u = split(line, '\t'); if (u.size() > 1) p.user = uid_name(trim(u[1])); }
                else if (line.rfind("VmRSS:", 0) == 0) {
                    auto v = split(line);
                    if (v.size() >= 2) p.rss = (uint64_t)std::strtoull(v[1].c_str(), nullptr, 10) * 1024;
                }
            }
            if (p.user.empty()) p.user = "root";

            // cmdline
            std::string cl = read_all("/proc/" + d + "/cmdline");
            for (auto& c : cl) if (c == '\0') c = ' ';
            p.cmdline = trim(cl);

            // exe (có thể bị từ chối nếu không cùng user)
            char target[512];
            std::string exepath = "/proc/" + d + "/exe";
            ssize_t n = readlink(exepath.c_str(), target, sizeof(target) - 1);
            if (n > 0) { target[n] = 0; p.exe = target; }

            // thời điểm bắt đầu (ước lượng từ starttime + btime)
            static uint64_t btime = 0;
            if (!btime) {
                std::istringstream ms(read_all("/proc/stat"));
                std::string ml;
                while (std::getline(ms, ml)) if (ml.rfind("btime ", 0) == 0) { btime = std::strtoull(ml.c_str() + 6, nullptr, 10); break; }
            }
            if (btime) p.started_unix = btime + starttime_j / (uint64_t)clk_tck();

            // đánh giá độ tin cậy dựa trên đường dẫn thật của binary
            if (p.cmdline.empty() && p.exe.empty()) { p.trust = "kernel"; p.trust_note = "Tiến trình nhân (kernel thread)"; }
            else if (p.exe.empty()) { p.trust = "unknown"; p.trust_note = "Không đọc được /proc/" + d + "/exe (thiếu quyền)"; }
            else if (p.exe.find("(deleted)") != std::string::npos) { p.trust = "bad"; p.trust_note = "Binary đã bị xóa khỏi đĩa khi đang chạy — dấu hiệu đáng ngờ"; }
            else if (suspicious_path(p.exe)) { p.trust = "bad"; p.trust_note = "Chạy từ thư mục tạm/ẩn: " + p.exe; }
            else if (p.exe.rfind("/usr/", 0) == 0 || p.exe.rfind("/bin/", 0) == 0 || p.exe.rfind("/sbin/", 0) == 0 ||
                     p.exe.rfind("/lib/", 0) == 0 || p.exe.rfind("/lib64/", 0) == 0 || p.exe.rfind("/snap/", 0) == 0 ||
                     p.exe.rfind("/opt/", 0) == 0) { p.trust = "good"; p.trust_note = "Binary hệ thống: " + p.exe; }
            else if (p.exe.rfind("/home/", 0) == 0) { p.trust = "warn"; p.trust_note = "Chạy từ thư mục người dùng: " + p.exe; }
            else { p.trust = "unknown"; p.trust_note = "Đường dẫn lạ: " + p.exe; }

            out.push_back(p);
        }

        // dọn tiến trình đã chết khỏi cache
        if (!out.empty()) {
            std::set<long> alive;
            for (auto& p : out) alive.insert(p.pid);
            for (auto it = prev.begin(); it != prev.end();) {
                if (alive.count(it->first) == 0) it = prev.erase(it); else ++it;
            }
        }
        first = false;

        std::sort(out.begin(), out.end(), [](const ProcInfo& a, const ProcInfo& b) {
            if (a.rss != b.rss) return a.rss > b.rss;
            return a.cpu_pct > b.cpu_pct;
        });
        if (out.size() > limit) out.resize(limit);
        return out;
    }

    /* ---------------- kết nối mạng thật ---------------- */
    std::vector<ConnInfo> connections(size_t limit) {
        std::vector<ConnInfo> out;
        const std::vector<std::pair<std::string, std::string>> files = {
            {"/proc/net/tcp", "tcp"}, {"/proc/net/tcp6", "tcp6"},
            {"/proc/net/udp", "udp"}, {"/proc/net/udp6", "udp6"}
        };
        const auto& inodes = socket_inodes();

        for (const auto& [path, proto] : files) {
            std::string content = read_all(path);
            if (content.empty()) continue;
            std::istringstream ss(content);
            std::string line;
            std::getline(ss, line);   // header
            bool v6 = proto.find('6') != std::string::npos;
            while (std::getline(ss, line)) {
                auto f = split(line);
                if (f.size() < 10) continue;
                auto split_addr = [&](const std::string& a, std::string& ip, int& port) {
                    size_t c = a.rfind(':');
                    if (c == std::string::npos) return;
                    ip = v6 ? decode_addr_v6(a.substr(0, c)) : decode_addr_v4(a.substr(0, c));
                    port = (int)std::strtoul(a.substr(c + 1).c_str(), nullptr, 16);
                };
                ConnInfo ci;
                ci.proto = proto;
                int lp = 0, rp = 0;
                std::string lip, rip;
                split_addr(f[1], lip, lp);
                split_addr(f[2], rip, rp);
                char b1[96], b2[96];
                std::snprintf(b1, sizeof(b1), "[%s]:%d", lip.c_str(), lp);
                std::snprintf(b2, sizeof(b2), "[%s]:%d", rip.c_str(), rp);
                if (!v6) { std::snprintf(b1, sizeof(b1), "%s:%d", lip.c_str(), lp); std::snprintf(b2, sizeof(b2), "%s:%d", rip.c_str(), rp); }
                ci.local = b1; ci.remote = b2;
                int st = (int)std::strtoul(f[3].c_str(), nullptr, 16);
                ci.state = (proto.rfind("tcp", 0) == 0) ? tcp_state(st) : (st == 0x07 ? "UNCONN" : tcp_state(st));
                ci.listening = (st == 0x0A);
                ci.loopback = (lip.rfind("127.", 0) == 0 || lip == "::1" || lip == "[::1]");
                auto it = inodes.find(f[9]);
                if (it != inodes.end()) { ci.pid = it->second; ci.pname = proc_name(it->second); }
                out.push_back(ci);
                if (out.size() >= limit) return out;
            }
        }
        // ưu tiên kết nối đang mở + có tiến trình
        std::stable_sort(out.begin(), out.end(), [](const ConnInfo& a, const ConnInfo& b) {
            auto score = [](const ConnInfo& c) { return (c.pid ? 2 : 0) + (c.state == "ESTABLISHED" ? 1 : 0); };
            return score(a) > score(b);
        });
        return out;
    }

    /* ---------------- ổ đĩa thật ---------------- */
    std::vector<DiskInfo> disks() {
        std::vector<DiskInfo> out;
        static const std::set<std::string> skip = {
            "proc","sysfs","devpts","cgroup","cgroup2","pstore","securityfs","debugfs","tracefs",
            "configfs","fusectl","mqueue","hugetlbfs","bpf","autofs","binfmt_misc","nsfs","ramfs",
            "devtmpfs","efivarfs","squashfs","rpc_pipefs","nfsd","selinuxfs","tmpfs"
        };
        std::set<std::string> seen;
        std::istringstream ss(read_all("/proc/mounts"));
        std::string line;
        while (std::getline(ss, line)) {
            auto f = split(line);
            if (f.size() < 3) continue;
            std::string dev = f[0], mnt = f[1], fst = f[2];
            if (skip.count(fst)) continue;
            // /proc/mounts escape khoảng trắng bằng \040
            std::string mp;
            for (size_t i = 0; i < mnt.size(); i++) {
                if (mnt[i] == '\\' && i + 3 < mnt.size()) {
                    mp += (char)std::strtol(mnt.substr(i + 1, 3).c_str(), nullptr, 8);
                    i += 3;
                } else mp += mnt[i];
            }
            if (seen.count(mp)) continue;
            struct statvfs st{};
            if (statvfs(mp.c_str(), &st) != 0) continue;
            DiskInfo d;
            d.device = dev; d.mount = mp; d.fstype = fst;
            d.total = (uint64_t)st.f_blocks * st.f_frsize;
            d.avail = (uint64_t)st.f_bavail * st.f_frsize;
            uint64_t free_all = (uint64_t)st.f_bfree * st.f_frsize;
            d.used = d.total > free_all ? d.total - free_all : 0;
            d.pct = d.total ? 100.0 * (double)d.used / (double)d.total : 0;
            if (d.total == 0) continue;
            seen.insert(mp);
            out.push_back(d);
        }
        std::sort(out.begin(), out.end(), [](const DiskInfo& a, const DiskInfo& b) { return a.mount.size() < b.mount.size(); });
        return out;
    }

    /* ---------------- nhiệt độ thật ---------------- */
    std::vector<TempInfo> temps() {
        std::vector<TempInfo> out;
        for (int i = 0; i < 32; i++) {
            std::string base = "/sys/class/thermal/thermal_zone" + std::to_string(i);
            std::string t = trim(read_all(base + "/temp"));
            if (t.empty()) break;
            TempInfo ti;
            ti.zone = trim(read_all(base + "/type"));
            if (ti.zone.empty()) ti.zone = "thermal_zone" + std::to_string(i);
            ti.celsius = std::strtod(t.c_str(), nullptr) / 1000.0;
            out.push_back(ti);
        }
        // hwmon (nhiều máy chỉ có ở đây)
        for (int i = 0; i < 16; i++) {
            std::string base = "/sys/class/hwmon/hwmon" + std::to_string(i);
            std::string name = trim(read_all(base + "/name"));
            if (name.empty() && access(base.c_str(), F_OK) != 0) continue;
            for (int k = 1; k <= 6; k++) {
                std::string v = trim(read_all(base + "/temp" + std::to_string(k) + "_input"));
                if (v.empty()) continue;
                TempInfo ti;
                ti.zone = (name.empty() ? "hwmon" + std::to_string(i) : name) + " temp" + std::to_string(k);
                std::string lbl = trim(read_all(base + "/temp" + std::to_string(k) + "_label"));
                if (!lbl.empty()) ti.zone = (name.empty() ? "" : name + " ") + lbl;
                ti.celsius = std::strtod(v.c_str(), nullptr) / 1000.0;
                out.push_back(ti);
            }
        }
        return out;
    }

    /* ---------------- ping thật (TCP connect) ---------------- */
    namespace {
    //  Đọc giá trị chuỗi của một khóa JSON (bỏ qua khoảng trắng) — không cần thư viện.
    std::string jstr(const std::string& j, const std::string& key) {
        std::string pat = "\"" + key + "\"";
        size_t p = j.find(pat);
        if (p == std::string::npos) return "";
        p += pat.size();
        while (p < j.size() && (std::isspace((unsigned char)j[p]) || j[p] == ':')) p++;
        if (p >= j.size() || j[p] != '"') return "";
        size_t e = j.find('"', p + 1);
        if (e == std::string::npos) return "";
        return j.substr(p + 1, e - p - 1);
    }
}   // namespace

NetInfo net_info(bool want_public) {
    NetInfo ni;
    char host[256] = { 0 };
    if (gethostname(host, sizeof(host) - 1) == 0) ni.hostname = host;

    /* --- địa chỉ IPv4 thật của từng card mạng --- */
    struct ifaddrs* ifa = nullptr;
    if (getifaddrs(&ifa) == 0) {
        for (struct ifaddrs* p = ifa; p; p = p->ifa_next) {
            if (!p->ifa_addr || p->ifa_addr->sa_family != AF_INET) continue;
            NetIface f;
            f.name = p->ifa_name ? p->ifa_name : "";
            char b[INET_ADDRSTRLEN] = { 0 };
            inet_ntop(AF_INET, &(reinterpret_cast<struct sockaddr_in*>(p->ifa_addr))->sin_addr, b, sizeof(b));
            f.ip = b;
            if (p->ifa_netmask && p->ifa_netmask->sa_family == AF_INET) {
                char m[INET_ADDRSTRLEN] = { 0 };
                inet_ntop(AF_INET, &(reinterpret_cast<struct sockaddr_in*>(p->ifa_netmask))->sin_addr, m, sizeof(m));
                f.mask = m;
            }
            f.up = (p->ifa_flags & IFF_UP) != 0;
            f.loopback = (p->ifa_flags & IFF_LOOPBACK) != 0;
            ni.ifaces.push_back(f);
        }
        freeifaddrs(ifa);
    } else {
        ni.note = "getifaddrs() thất bại: ";
        ni.note += std::strerror(errno);
    }
    if (ni.ifaces.empty() && ni.note.empty()) ni.note = "Không đọc được địa chỉ IP nào";

    /* --- gateway mặc định: dòng có Destination = 00000000 trong /proc/net/route --- */
    {
        std::ifstream rf("/proc/net/route");
        std::string line;
        bool header = true;
        while (std::getline(rf, line)) {
            if (header) { header = false; continue; }
            std::istringstream is(line);
            std::string iface, dest, gw;
            if (!(is >> iface >> dest >> gw)) continue;
            if (dest != "00000000") continue;
            unsigned long g = std::strtoul(gw.c_str(), nullptr, 16);   // hex little-endian
            struct in_addr a {};
            a.s_addr = static_cast<uint32_t>(g);
            char b[INET_ADDRSTRLEN] = { 0 };
            if (inet_ntop(AF_INET, &a, b, sizeof(b))) { ni.gateway = b; ni.gw_iface = iface; }
            break;
        }
        if (ni.gateway.empty() && ni.note.empty()) ni.note = "Không thấy route mặc định trong /proc/net/route";
    }

    /* --- DNS từ /etc/resolv.conf --- */
    {
        std::ifstream rc("/etc/resolv.conf");
        std::string line;
        while (std::getline(rc, line)) {
            std::istringstream is(line);
            std::string k, v;
            if ((is >> k >> v) && k == "nameserver" && !v.empty()) ni.dns.push_back(v);
        }
    }

    /* --- IP công cộng + nhà mạng: phải hỏi dịch vụ ngoài, có cache 10 phút --- */
    if (want_public) {
        struct PubCache {
            std::string ip, isp, country, city, note;
            uint64_t at = 0;
        };
        static PubCache pc;
        static std::mutex pc_mtx;
        std::lock_guard<std::mutex> lk(pc_mtx);
        const uint64_t now = static_cast<uint64_t>(std::time(nullptr));
        if (pc.at && now - pc.at < 600) {
            ni.public_ip = pc.ip; ni.isp = pc.isp; ni.country = pc.country; ni.city = pc.city;
            ni.real_public = !pc.ip.empty();
            if (!pc.note.empty() && ni.note.empty()) ni.note = pc.note;
            return ni;
        }
        const char* env = std::getenv("RUNE_IPINFO_URL");
        std::string url = (env && *env) ? env : "https://ipapi.co/json";
        std::string body = run_cmd("curl -sSL --compressed --max-time 8 -A \"RUNE/2.0 (local netinfo)\" -- \"" + url + "\" 2>/dev/null", 10);
        pc.ip = jstr(body, "ip");
        pc.isp = jstr(body, "org");
        if (pc.isp.empty()) pc.isp = jstr(body, "asn");
        pc.country = jstr(body, "country_name");
        pc.city = jstr(body, "city");
        pc.note.clear();
        pc.at = now;
        if (pc.ip.empty()) {
            pc.note = "Không lấy được IP công cộng/nhà mạng (dịch vụ " + url + " không phản hồi — mạng bị chặn hoặc giới hạn tốc độ?)";
            pc.at = now;   // vẫn cache để không gọi lại liên tục
        }
        ni.public_ip = pc.ip; ni.isp = pc.isp; ni.country = pc.country; ni.city = pc.city;
        ni.real_public = !pc.ip.empty();
        if (!pc.note.empty() && ni.note.empty()) ni.note = pc.note;
    }
    return ni;
}

PingResult tcp_ping(const std::string& host, int port, int count, int timeout_ms) {
        PingResult r;
        r.host = host; r.port = port;
        r.note = "Đo bằng thời gian bắt tay TCP tới cổng " + std::to_string(port) + " (không phải ICMP — ICMP cần quyền root)";
        if (host.empty()) { r.note = "Thiếu host"; return r; }

        struct addrinfo hints{}, *res = nullptr;
        hints.ai_family = AF_UNSPEC;
        hints.ai_socktype = SOCK_STREAM;
        std::string ports = std::to_string(port);
        if (getaddrinfo(host.c_str(), ports.c_str(), &hints, &res) != 0 || !res) {
            r.note = "Không phân giải được tên miền " + host;
            return r;
        }
        count = std::max(1, std::min(count, 20));
        for (int i = 0; i < count; i++) {
            int fd = socket(res->ai_family, SOCK_STREAM | SOCK_NONBLOCK, 0);
            if (fd < 0) { r.sent++; r.samples.push_back(-1); continue; }
            auto t0 = std::chrono::steady_clock::now();
            int cr = connect(fd, res->ai_addr, res->ai_addrlen);
            if (cr < 0 && errno == EINPROGRESS) {
                fd_set wf; FD_ZERO(&wf); FD_SET(fd, &wf);
                timeval tv; tv.tv_sec = timeout_ms / 1000; tv.tv_usec = (timeout_ms % 1000) * 1000;
                int sel = select(fd + 1, nullptr, &wf, nullptr, &tv);
                if (sel > 0) {
                    int err = 0; socklen_t len = sizeof(err);
                    getsockopt(fd, SOL_SOCKET, SO_ERROR, &err, &len);
                    cr = (err == 0) ? 0 : -1;
                } else cr = -1;
            }
            double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
            close(fd);
            r.sent++;
            if (cr == 0) {
                r.ok++;
                r.samples.push_back(ms);
                if (r.ok == 1 || ms < r.min_ms) r.min_ms = ms;
                if (ms > r.max_ms) r.max_ms = ms;
            } else r.samples.push_back(-1);
        }
        freeaddrinfo(res);
        if (r.ok) {
            double sum = 0; for (double v : r.samples) if (v >= 0) sum += v;
            r.avg_ms = sum / r.ok;
        } else if (!r.samples.empty() && r.note.find("phân giải") == std::string::npos) {
            r.note += " · tất cả lần kết nối đều thất bại (chặn tường lửa hoặc không có mạng)";
        }
        return r;
    }

    /* ---------------- kết thúc tiến trình thật ---------------- */
    int kill_pid(long pid, int sig, std::string& err) {
        err.clear();
        if (pid <= 1) { err = "Từ chối: không được kết thúc tiến trình có PID " + std::to_string(pid); return -1; }
        std::string dir = "/proc/" + std::to_string(pid);
        if (access(dir.c_str(), F_OK) != 0) { err = "Không có tiến trình PID " + std::to_string(pid); return -1; }
        if (sig != SIGTERM && sig != SIGKILL && sig != SIGINT && sig != SIGHUP) { err = "Tín hiệu không được phép: " + std::to_string(sig); return -1; }
        if (kill((pid_t)pid, sig) != 0) { err = std::string("kill() thất bại: ") + std::strerror(errno); return -1; }
        return 0;
    }

    /* ---------------- kiểm tra bảo mật thật ---------------- */
    std::vector<SecItem> security() {
        std::vector<SecItem> v;
        auto add = [&](const std::string& id, const std::string& icon, const std::string& title,
                       const std::string& status, const std::string& detail, const std::string& source) {
            v.push_back({ id, icon, title, status, detail, source });
        };

        if (!available()) {
            add("os", "🖥️", "Hệ điều hành", "unsupported",
                "Không thấy /proc — backend chỉ đọc được số liệu thật trên Linux.", "access(\"/proc/stat\")");
            return v;
        }

        /* 1. Hệ điều hành + kernel + uptime */
        {
            std::string pretty = trim(run_cmd(". /etc/os-release 2>/dev/null && echo \"$PRETTY_NAME\""));
            std::string kernel = trim(read_all("/proc/sys/kernel/osrelease"));
            uint64_t up = uptime_seconds();
            char b[96];
            std::snprintf(b, sizeof(b), "%llu ngày %llu giờ", (unsigned long long)(up / 86400), (unsigned long long)((up % 86400) / 3600));
            add("os", "🖥️", "Hệ điều hành & kernel", "good",
                (pretty.empty() ? std::string("Linux") : pretty) + " · kernel " + kernel + " · uptime " + b,
                "/etc/os-release, /proc/sys/kernel/osrelease, /proc/uptime");
        }

        /* 2. Tường lửa */
        {
            std::string ufw = trim(run_cmd("ufw status 2>/dev/null | head -1"));
            if (ufw.find("active") != std::string::npos && ufw.find("inactive") == std::string::npos)
                add("firewall", "🧱", "Tường lửa (ufw)", "good", ufw, "ufw status");
            else if (!ufw.empty())
                add("firewall", "🧱", "Tường lửa (ufw)", "warn", ufw + " — nên bật: sudo ufw enable", "ufw status");
            else if (has_cmd("nft")) {
                std::string n = trim(run_cmd("nft list ruleset 2>/dev/null | head -3"));
                add("firewall", "🧱", "Tường lửa (nftables)", n.empty() ? "unknown" : "good",
                    n.empty() ? "nftables có sẵn nhưng cần quyền root mới đọc được ruleset (chạy server bằng sudo để xem)" : "Có ruleset nftables đang hoạt động",
                    "nft list ruleset");
            } else if (has_cmd("iptables")) {
                std::string n = trim(run_cmd("iptables -S 2>/dev/null | head -3"));
                add("firewall", "🧱", "Tường lửa (iptables)", n.empty() ? "unknown" : "good",
                    n.empty() ? "iptables cần quyền root mới đọc được" : "Có luật iptables đang hoạt động", "iptables -S");
            } else add("firewall", "🧱", "Tường lửa", "unsupported", "Không tìm thấy ufw/nft/iptables trên máy", "command -v ufw nft iptables");
        }

        /* 3. AppArmor / SELinux */
        {
            std::string aa = trim(run_cmd("aa-status 2>/dev/null | head -1"));
            std::string se = trim(run_cmd("getenforce 2>/dev/null"));
            if (!aa.empty() && aa.find("apparmor module is loaded") != std::string::npos)
                add("mac", "🛡️", "AppArmor", "good", aa, "aa-status");
            else if (!se.empty())
                add("mac", "🛡️", "SELinux", se == "Enforcing" ? "good" : "warn", "getenforce = " + se, "getenforce");
            else if (!aa.empty()) add("mac", "🛡️", "AppArmor", "warn", aa, "aa-status");
            else add("mac", "🛡️", "AppArmor / SELinux", "unknown", "Không đọc được trạng thái (thiếu quyền hoặc không cài)", "aa-status, getenforce");
        }

        /* 4. Cập nhật hệ thống */
        {
            std::string cnt, tool;
            if (has_cmd("apt")) { tool = "apt"; cnt = trim(run_cmd("apt list --upgradable 2>/dev/null | grep -c upgradable")); }
            else if (has_cmd("dnf")) { tool = "dnf"; cnt = trim(run_cmd("dnf check-update -q 2>/dev/null | grep -c '^[A-Za-z0-9]'")); }
            else if (has_cmd("pacman")) { tool = "pacman"; cnt = trim(run_cmd("pacman -Qu 2>/dev/null | wc -l")); }
            if (tool.empty()) add("updates", "🔄", "Cập nhật hệ thống", "unsupported", "Không thấy apt/dnf/pacman", "command -v apt dnf pacman");
            else {
                long n = cnt.empty() ? -1 : std::atol(cnt.c_str());
                std::string auto_up = trim(run_cmd("systemctl is-enabled unattended-upgrades 2>/dev/null || dpkg -s unattended-upgrades 2>/dev/null | grep -i ^status"));
                bool has_auto = auto_up.find("enabled") != std::string::npos || auto_up.find("installed ok") != std::string::npos;
                std::string detail = (n > 0 ? std::to_string(n) + " gói đang chờ cập nhật" : n == 0 ? "Không có gói nào chờ cập nhật" : "Không đếm được (cần quyền root)");
                detail += std::string(" · tự động cập nhật: ") + (has_auto ? "BẬT (unattended-upgrades)" : "chưa bật");
                add("updates", "🔄", "Cập nhật hệ thống (" + tool + ")", n > 0 ? "warn" : (n == 0 ? "good" : "unknown"), detail,
                    tool + " list --upgradable / systemctl is-enabled unattended-upgrades");
            }
        }

        /* 5. Mã hóa ổ đĩa */
        {
            if (!has_cmd("lsblk")) add("encrypt", "🔐", "Mã hóa ổ đĩa", "unsupported", "Không có lsblk", "command -v lsblk");
            else {
                std::string ls = run_cmd("lsblk -o NAME,FSTYPE,TYPE 2>/dev/null");
                bool luks = ls.find("crypto_LUKS") != std::string::npos || ls.find("crypt") != std::string::npos;
                std::string home = trim(run_cmd("lsblk -no FSTYPE,MOUNTPOINT 2>/dev/null | grep -E ' /home| /$' | head -1"));
                add("encrypt", "🔐", "Mã hóa ổ đĩa", luks ? "good" : "warn",
                    luks ? "Phát hiện phân vùng mã hóa LUKS/dm-crypt" : "Không thấy LUKS/dm-crypt — dữ liệu đang ở dạng không mã hóa (ổ: " + (home.empty() ? "?" : home) + ")",
                    "lsblk -o NAME,FSTYPE,TYPE");
            }
        }

        /* 6. Phần mềm diệt virus */
        {
            bool clam = has_cmd("clamscan") || has_cmd("clamdscan") || has_cmd("freshclam");
            std::string detail;
            if (clam) {
                std::string ver = trim(run_cmd("clamscan --version 2>/dev/null | head -1"));
                detail = "ClamAV đã cài: " + (ver.empty() ? "có" : ver);
            } else {
                detail = "Không thấy ClamAV/ESET/Kaspersky. Trên Linux, lớp bảo vệ chính là AppArmor/SELinux + repo có ký số";
            }
            add("av", "🦠", "Phần mềm diệt virus", clam ? "good" : "warn", detail, "command -v clamscan clamdscan freshclam");
        }

        /* 7. SMART ổ đĩa */
        {
            if (!has_cmd("smartctl")) add("smart", "💽", "Sức khỏe ổ đĩa (SMART)", "unsupported",
                "Chưa cài smartmontools (sudo apt install smartmontools)", "command -v smartctl");
            else {
                std::string dev = trim(run_cmd("lsblk -dno NAME,TYPE 2>/dev/null | awk '$2==\"disk\"{print \"/dev/\"$1; exit}'"));
                std::string h = dev.empty() ? "" : trim(run_cmd("smartctl -H " + dev + " 2>/dev/null | grep -i 'SMART overall'"));
                if (!h.empty()) add("smart", "💽", "Sức khỏe ổ đĩa (SMART)", h.find("PASSED") != std::string::npos ? "good" : "bad", h + " (" + dev + ")", "smartctl -H " + dev);
                else add("smart", "💽", "Sức khỏe ổ đĩa (SMART)", "unknown",
                    dev.empty() ? "Không xác định được ổ đĩa" : "smartctl cần quyền root (chạy server bằng sudo)", "smartctl -H " + dev);
            }
        }

        /* 8. Cổng đang mở (thật) */
        {
            auto conns = connections(1000);
            std::set<std::string> listening;
            int exposed = 0;
            for (auto& c : conns) {
                if (!c.listening) continue;
                listening.insert(c.local + (c.pname.empty() ? "" : " (" + c.pname + ")"));
                if (!c.loopback) exposed++;
            }
            std::string list;
            int i = 0;
            for (auto& l : listening) { if (i++ >= 8) { list += "…"; break; } if (!list.empty()) list += ", "; list += l; }
            add("ports", "🔌", "Cổng đang lắng nghe", exposed > 0 ? "warn" : "good",
                std::to_string(listening.size()) + " cổng đang mở" + (exposed ? ", trong đó " + std::to_string(exposed) + " cổng mở ra ngoài máy (không phải loopback)" : " (chỉ loopback)") +
                (list.empty() ? "" : ": " + list), "/proc/net/tcp, tcp6, udp, udp6");
        }

        /* 9. Tiến trình đáng ngờ (thật) */
        {
            auto ps = processes(500);
            std::vector<std::string> bad, warn;
            for (auto& p : ps) {
                if (p.trust == "bad") bad.push_back(p.name + " (PID " + std::to_string(p.pid) + "): " + p.trust_note);
                else if (p.trust == "warn") warn.push_back(p.name + " (PID " + std::to_string(p.pid) + ")");
            }
            std::string detail = std::to_string(ps.size()) + " tiến trình đang chạy · " +
                std::to_string(bad.size()) + " đáng ngờ · " + std::to_string(warn.size()) + " chạy từ thư mục người dùng";
            if (!bad.empty()) detail += "\n• " + bad[0];
            add("proc", "🕵️", "Tiến trình đáng ngờ", bad.empty() ? (warn.empty() ? "good" : "warn") : "bad", detail,
                "/proc/*/exe (đối chiếu đường dẫn binary)");
        }

        /* 10. Người dùng đang đăng nhập */
        {
            std::string who = trim(run_cmd("who 2>/dev/null"));
            std::string last = trim(run_cmd("last -n 1 -w 2>/dev/null | head -1"));
            add("users", "👤", "Phiên đăng nhập", "good",
                who.empty() ? "Không có phiên đăng nhập tương tác nào (container/SSH không tạo utmp)" : who,
                last.empty() ? "who" : "who · last: " + last);
        }

        /* 11. SSH */
        {
            bool sshd = has_cmd("sshd") || !trim(run_cmd("systemctl is-active ssh 2>/dev/null || systemctl is-active sshd 2>/dev/null")).empty();
            std::string active = trim(run_cmd("systemctl is-active ssh 2>/dev/null || systemctl is-active sshd 2>/dev/null"));
            if (!sshd && active.empty()) add("ssh", "🔑", "SSH server", "good", "Không cài/không chạy sshd — máy không mở cổng 22", "command -v sshd, systemctl is-active ssh");
            else {
                std::string root = trim(run_cmd("grep -Ei '^PermitRootLogin' /etc/ssh/sshd_config 2>/dev/null"));
                std::string pw = trim(run_cmd("grep -Ei '^PasswordAuthentication' /etc/ssh/sshd_config 2>/dev/null"));
                bool risky = root.find("yes") != std::string::npos || pw.find("yes") != std::string::npos;
                add("ssh", "🔑", "SSH server", active == "active" ? (risky ? "warn" : "good") : "good",
                    "sshd: " + (active.empty() ? "có cài, không rõ trạng thái" : active) +
                    (root.empty() ? "" : " · " + root) + (pw.empty() ? "" : " · " + pw) +
                    (risky ? " → nên tắt đăng nhập root/mật khẩu" : ""), "/etc/ssh/sshd_config, systemctl is-active ssh");
            }
        }

        /* 12. Quyền của server */
        {
            bool root = (geteuid() == 0);
            add("priv", "⚖️", "Quyền tiến trình RUNE", root ? "warn" : "good",
                root ? "Server đang chạy bằng root — /api/cli có toàn quyền trên máy (nên chạy bằng user thường)"
                     : "Server chạy bằng user thường (" + uid_name(std::to_string(geteuid())) + ") — an toàn hơn",
                "geteuid()");
        }

        return v;
    }

    /* ---------------- báo cáo tối ưu thật ---------------- */
    std::string optimize_report() {
        std::ostringstream j;
        j << "{";
        // /proc/meminfo thật
        std::map<std::string, uint64_t> mem;
        std::istringstream ms(read_all("/proc/meminfo"));
        std::string line;
        while (std::getline(ms, line)) {
            auto f = split(line);
            if (f.size() >= 2) mem[f[0].substr(0, f[0].size() - 1)] = std::strtoull(f[1].c_str(), nullptr, 10) * 1024ULL;
        }
        auto g = [&](const std::string& k) { auto it = mem.find(k); return it == mem.end() ? 0ULL : it->second; };
        j << "\"meminfo\":{"
          << "\"total\":" << g("MemTotal") << ",\"free\":" << g("MemFree") << ",\"available\":" << g("MemAvailable")
          << ",\"buffers\":" << g("Buffers") << ",\"cached\":" << g("Cached") << ",\"s_reclaimable\":" << g("SReclaimable")
          << ",\"dirty\":" << g("Dirty") << ",\"swap_total\":" << g("SwapTotal") << ",\"swap_free\":" << g("SwapFree")
          << "},";
        uint64_t reclaimable = g("Cached") + g("Buffers") + g("SReclaimable");
        j << "\"reclaimable_bytes\":" << reclaimable << ",";

        // dung lượng cache thật
        auto du = [](const std::string& path) -> long long {
            std::string s = trim(run_cmd("du -sx --block-size=1 " + path + " 2>/dev/null | cut -f1"));
            return s.empty() ? -1 : std::atoll(s.c_str());
        };
        const char* home = getenv("HOME");
        std::string usercache = home ? std::string(home) + "/.cache" : "/root/.cache";
        j << "\"caches\":[";
        struct { const char* label; std::string path; } items[] = {
            {"Cache người dùng", usercache},
            {"/tmp", "/tmp"},
            {"/var/tmp", "/var/tmp"},
            {"Cache apt", "/var/cache/apt/archives"},
        };
        bool first = true;
        for (auto& it : items) {
            long long sz = du(it.path);
            if (!first) j << ",";
            first = false;
            j << "{\"label\":\"" << json_escape(it.label) << "\",\"path\":\"" << json_escape(it.path) << "\",\"bytes\":" << sz << "}";
        }
        std::string journal = trim(run_cmd("journalctl --disk-usage 2>/dev/null"));
        j << "],\"journal\":\"" << json_escape(journal) << "\",";

        // top tiến trình ngốn RAM thật
        auto ps = processes(8);
        j << "\"top_memory\":[";
        for (size_t i = 0; i < ps.size(); i++) {
            if (i) j << ",";
            j << "{\"pid\":" << ps[i].pid << ",\"name\":\"" << json_escape(ps[i].name) << "\",\"rss\":" << ps[i].rss
              << ",\"cpu_pct\":" << ps[i].cpu_pct << ",\"user\":\"" << json_escape(ps[i].user) << "\"}";
        }
        j << "],";
        j << "\"actions\":[";
        j << "{\"id\":\"sync\",\"label\":\"Ghi dữ liệu đang đệm xuống đĩa (sync)\",\"needs_root\":false,\"command\":\"sync\"},";
        j << "{\"id\":\"drop_caches\",\"label\":\"Giải phóng page cache (cần root)\",\"needs_root\":true,\"command\":\"echo 3 > /proc/sys/vm/drop_caches\"},";
        j << "{\"id\":\"apt_clean\",\"label\":\"Xóa cache gói apt (cần root)\",\"needs_root\":true,\"command\":\"apt-get clean\"},";
        j << "{\"id\":\"journal_vacuum\",\"label\":\"Cắt nhật ký systemd còn 100MB (cần root)\",\"needs_root\":true,\"command\":\"journalctl --vacuum-size=100M\"},";
        j << "{\"id\":\"user_cache\",\"label\":\"Xóa cache trình duyệt/app trong ~/.cache cũ hơn 30 ngày\",\"needs_root\":false,\"command\":\"find " << json_escape(usercache) << " -type f -atime +30 -delete\"}";
        j << "],";
        j << "\"is_root\":" << (geteuid() == 0 ? "true" : "false");
        j << "}";
        return j.str();
    }

} // namespace probe
