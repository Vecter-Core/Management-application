// ============================================================
//  RUNE / xKiro Local Server — C++20
//  Server HTTP local: phục vụ giao diện (thư mục public/) + API thật
//
//  Build:  ./build.sh              (cmake nếu có, không thì g++ trực tiếp)
//          make -f Makefile        (cách nhanh nhất, không cần cmake)
//  Chạy:   ./build/rune_server
//          RUNE_PORT=9000 RUNE_BIND=0.0.0.0 ./build/rune_server
//
//  API:
//    GET    /api/health            trạng thái server
//    GET    /api/system            CPU/RAM/GPU/mạng thật (SystemMonitor)
//    GET    /api/market?country=VN chỉ số + cổ phiếu (MarketData)
//    GET    /api/keys              danh sách khóa đã lưu (đã che)
//    POST   /api/keys              {"service":"openai","key":"sk-..."}
//    DELETE /api/keys?service=x    xóa 1 khóa
//    POST   /api/cli               {"command":"ls -la","cwd":"/tmp","timeout":15}
//                                  → chạy lệnh THẬT trên máy, trả output + mã thoát
// ============================================================

#include <iostream>
#include <string>
#include <cstring>
#include <cstdlib>
#include <cerrno>
#include <csignal>
#include <sys/socket.h>
#include <sys/select.h>
#include <sys/statvfs.h>
#include <sys/wait.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <fcntl.h>
#include <fstream>
#include <sstream>
#include <thread>
#include <mutex>
#include <atomic>
#include <chrono>
#include <ctime>
#include <cctype>
#include <filesystem>
#include <algorithm>

#include "system_monitor.h"
#include "market_data.h"
#include "key_manager.h"
#include "cli_runner.h"

namespace fs = std::filesystem;

static const char* SERVER_NAME = "rune-server";
static const char* SERVER_VERSION = "2.0";
static std::atomic<uint64_t> g_req_count{0};
static std::chrono::steady_clock::time_point g_started = std::chrono::steady_clock::now();
static bool g_loopback_only = true;   // đặt false khi RUNE_BIND=0.0.0.0
static bool g_allow_cli = true;       // /api/cli chỉ mở khi server chạy loopback (hoặc RUNE_ALLOW_CLI=1)

/* ---------------- tiện ích chuỗi / JSON ---------------- */

static std::string to_lower(std::string s) {
    std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) { return std::tolower(c); });
    return s;
}

static std::string json_escape(const std::string& s) {
    std::string out;
    out.reserve(s.size() + 16);
    for (unsigned char c : s) {
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            case '\b': out += "\\b"; break;
            case '\f': out += "\\f"; break;
            default:
                if (c < 0x20) { char b[8]; std::snprintf(b, sizeof(b), "\\u%04x", c); out += b; }
                else out += static_cast<char>(c);
        }
    }
    return out;
}

// Đọc 1 chuỗi JSON dạng "key":"value" (có hỗ trợ escape) — đủ dùng cho body nhỏ của app
static bool json_get_string(const std::string& body, const std::string& key, std::string& out) {
    std::string pat = "\"" + key + "\"";
    size_t p = body.find(pat);
    if (p == std::string::npos) return false;
    p = body.find(':', p + pat.size());
    if (p == std::string::npos) return false;
    p++;
    while (p < body.size() && std::isspace(static_cast<unsigned char>(body[p]))) p++;
    if (p >= body.size() || body[p] != '"') return false;
    p++;
    std::string res;
    while (p < body.size()) {
        char c = body[p];
        if (c == '\\' && p + 1 < body.size()) {
            char n = body[++p];
            switch (n) {
                case 'n': res += '\n'; break;
                case 't': res += '\t'; break;
                case 'r': res += '\r'; break;
                case 'b': res += '\b'; break;
                case 'f': res += '\f'; break;
                case '/': res += '/'; break;
                case '"': res += '"'; break;
                case '\\': res += '\\'; break;
                case 'u': {
                    if (p + 4 < body.size()) {
                        std::string hex = body.substr(p + 1, 4);
                        unsigned cp = static_cast<unsigned>(std::strtoul(hex.c_str(), nullptr, 16));
                        if (cp < 0x80) res += static_cast<char>(cp);
                        else if (cp < 0x800) { res += static_cast<char>(0xC0 | (cp >> 6)); res += static_cast<char>(0x80 | (cp & 0x3F)); }
                        else { res += static_cast<char>(0xE0 | (cp >> 12)); res += static_cast<char>(0x80 | ((cp >> 6) & 0x3F)); res += static_cast<char>(0x80 | (cp & 0x3F)); }
                        p += 4;
                    }
                    break;
                }
                default: res += n;
            }
            p++;
            continue;
        }
        if (c == '"') { out = res; return true; }
        res += c;
        p++;
    }
    return false;
}

static long json_get_long(const std::string& body, const std::string& key, long def) {
    std::string pat = "\"" + key + "\"";
    size_t p = body.find(pat);
    if (p == std::string::npos) return def;
    p = body.find(':', p + pat.size());
    if (p == std::string::npos) return def;
    p++;
    while (p < body.size() && (std::isspace(static_cast<unsigned char>(body[p])) || body[p] == '"')) p++;
    char* end = nullptr;
    long v = std::strtol(body.c_str() + p, &end, 10);
    if (end == body.c_str() + p) return def;
    return v;
}

static std::string url_decode(const std::string& in) {
    std::string out;
    for (size_t i = 0; i < in.size(); i++) {
        if (in[i] == '%' && i + 2 < in.size()) {
            char b[3] = { in[i + 1], in[i + 2], 0 };
            out += static_cast<char>(std::strtol(b, nullptr, 16));
            i += 2;
        } else if (in[i] == '+') out += ' ';
        else out += in[i];
    }
    return out;
}

static std::string query_param(const std::string& path, const std::string& key) {
    size_t q = path.find('?');
    if (q == std::string::npos) return "";
    std::string qs = path.substr(q + 1);
    size_t pos = 0;
    while (pos < qs.size()) {
        size_t amp = qs.find('&', pos);
        std::string pair = qs.substr(pos, amp == std::string::npos ? std::string::npos : amp - pos);
        size_t eq = pair.find('=');
        if (eq != std::string::npos && pair.substr(0, eq) == key) return url_decode(pair.substr(eq + 1));
        if (amp == std::string::npos) break;
        pos = amp + 1;
    }
    return "";
}

static std::string mask_key(const std::string& k) {
    if (k.size() <= 8) return k.empty() ? "" : "****";
    return k.substr(0, 4) + std::string(std::min<size_t>(12, k.size() - 8), '*') + k.substr(k.size() - 4);
}

/* ---------------- file tĩnh ---------------- */

static std::string get_mime(const std::string& path) {
    std::string p = to_lower(path);
    if (p.ends_with(".html") || p.ends_with(".htm")) return "text/html; charset=utf-8";
    if (p.ends_with(".css")) return "text/css; charset=utf-8";
    if (p.ends_with(".js") || p.ends_with(".mjs")) return "application/javascript; charset=utf-8";
    if (p.ends_with(".json") || p.ends_with(".map")) return "application/json";
    if (p.ends_with(".svg")) return "image/svg+xml";
    if (p.ends_with(".png")) return "image/png";
    if (p.ends_with(".jpg") || p.ends_with(".jpeg")) return "image/jpeg";
    if (p.ends_with(".gif")) return "image/gif";
    if (p.ends_with(".webp")) return "image/webp";
    if (p.ends_with(".ico")) return "image/x-icon";
    if (p.ends_with(".ttf")) return "font/ttf";
    if (p.ends_with(".otf")) return "font/otf";
    if (p.ends_with(".woff")) return "font/woff";
    if (p.ends_with(".woff2")) return "font/woff2";
    if (p.ends_with(".mp3")) return "audio/mpeg";
    if (p.ends_with(".wav")) return "audio/wav";
    if (p.ends_with(".ogg")) return "audio/ogg";
    if (p.ends_with(".mp4")) return "video/mp4";
    if (p.ends_with(".webm")) return "video/webm";
    if (p.ends_with(".pdf")) return "application/pdf";
    if (p.ends_with(".txt") || p.ends_with(".md")) return "text/plain; charset=utf-8";
    if (p.ends_with(".wasm")) return "application/wasm";
    return "application/octet-stream";
}

static fs::path public_root() {
    static fs::path root = [] {
        if (const char* env = std::getenv("RUNE_PUBLIC")) {
            std::error_code ec;
            fs::path p = fs::canonical(env, ec);
            if (!ec && fs::is_directory(p)) return p;
        }
        std::error_code ec;
        fs::path p = fs::canonical("public", ec);
        if (!ec && fs::is_directory(p)) return p;
        return fs::current_path() / "public";
    }();
    return root;
}

static bool read_binary(const fs::path& path, std::string& out) {
    std::ifstream f(path, std::ios::binary);
    if (!f) return false;
    std::ostringstream ss;
    ss << f.rdbuf();
    out = ss.str();
    return true;
}

/* ---------------- chạy lệnh shell thật (đồng bộ, có timeout) ---------------- */

static std::string shell_quote(const std::string& s) {
    std::string out = "'";
    for (char c : s) {
        if (c == '\'') out += "'\\''";
        else out += c;
    }
    out += "'";
    return out;
}

struct CliResult {
    std::string output;
    int exit_code = -1;
    bool timed_out = false;
    bool started = false;
};

// Ghi chú: CliRunner (cli_runner.h) dành cho luồng FFI/streaming bất đồng bộ.
// Ở đây server cần trả output về ngay trong 1 request HTTP nên chạy đồng bộ,
// có timeout và giới hạn dung lượng output — an toàn và dễ kiểm soát hơn.
static CliResult run_command(const std::string& command, const std::string& cwd, int timeout_s) {
    CliResult r;
    if (command.empty()) return r;

    static const bool has_timeout_bin = (access("/usr/bin/timeout", X_OK) == 0);
    std::string wrapped = command;
    if (has_timeout_bin && timeout_s > 0) {
        wrapped = "/usr/bin/timeout " + std::to_string(timeout_s) + "s sh -c " + shell_quote(command);
    } else {
        wrapped = "sh -c " + shell_quote(command);
    }
    if (!cwd.empty()) wrapped = "cd " + shell_quote(cwd) + " && " + wrapped;

    FILE* pipe = popen(wrapped.c_str(), "r");
    if (!pipe) { r.output = "Không chạy được lệnh: " + std::string(std::strerror(errno)); return r; }
    r.started = true;

    int fd = fileno(pipe);
    char buf[8192];
    const size_t MAX_OUT = 512 * 1024;
    auto start = std::chrono::steady_clock::now();

    while (true) {
        fd_set rfds; FD_ZERO(&rfds); FD_SET(fd, &rfds);
        timeval tv; tv.tv_sec = 1; tv.tv_usec = 0;
        int sel = select(fd + 1, &rfds, nullptr, nullptr, &tv);
        if (sel > 0) {
            ssize_t n = ::read(fd, buf, sizeof(buf));
            if (n <= 0) break;
            r.output.append(buf, static_cast<size_t>(n));
            if (r.output.size() >= MAX_OUT) {
                r.output += "\n[output quá dài — đã cắt ở 512 KB]";
                break;
            }
        } else if (sel == 0) {
            auto secs = std::chrono::duration_cast<std::chrono::seconds>(std::chrono::steady_clock::now() - start).count();
            if (timeout_s > 0 && secs >= timeout_s + 2) { r.timed_out = true; break; }
        } else {
            if (errno == EINTR) continue;
            break;
        }
    }

    int st = pclose(pipe);
    if (WIFEXITED(st)) r.exit_code = WEXITSTATUS(st);
    else r.exit_code = -1;
    if (r.timed_out) {
        r.exit_code = 124;
        r.output += "\n[lệnh bị dừng vì vượt quá " + std::to_string(timeout_s) + " giây]";
    }
    return r;
}

/* ---------------- phản hồi HTTP ---------------- */

struct Response {
    int status = 200;
    std::string body;
    std::string type = "text/plain; charset=utf-8";
    std::string extra_headers;
};

static const char* reason(int code) {
    switch (code) {
        case 200: return "OK";
        case 204: return "No Content";
        case 400: return "Bad Request";
        case 403: return "Forbidden";
        case 404: return "Not Found";
        case 405: return "Method Not Allowed";
        case 413: return "Payload Too Large";
        case 500: return "Internal Server Error";
        case 501: return "Not Implemented";
        default: return "OK";
    }
}

static Response json_response(int status, const std::string& body) {
    Response r; r.status = status; r.body = body; r.type = "application/json; charset=utf-8"; return r;
}
static Response text_response(int status, const std::string& body) {
    Response r; r.status = status; r.body = body; r.type = "text/plain; charset=utf-8"; return r;
}

/* ---------------- các route API ---------------- */

static Response api_health() {
    std::ostringstream j;
    auto up = std::chrono::duration_cast<std::chrono::seconds>(std::chrono::steady_clock::now() - g_started).count();
    j << "{\"ok\":true,\"name\":\"" << SERVER_NAME << "\",\"version\":\"" << SERVER_VERSION << "\","
      << "\"uptime\":" << up << ",\"requests\":" << g_req_count.load() << ","
      << "\"cli_enabled\":" << (g_allow_cli ? "true" : "false") << ","
      << "\"loopback_only\":" << (g_loopback_only ? "true" : "false") << ","
      << "\"public_dir\":\"" << json_escape(public_root().string()) << "\","
      << "\"time\":\"" << json_escape([] {
            auto t = std::time(nullptr); char b[40];
            std::strftime(b, sizeof(b), "%Y-%m-%dT%H:%M:%S%z", std::localtime(&t));
            return std::string(b);
         }()) << "\"}";
    return json_response(200, j.str());
}

static Response api_system() {
    SystemMonitor::instance().refresh();
    const SystemInfo* info = xkiro_get_system_info();

    // dung lượng ổ đĩa thật — frontend cần disk_total/disk_used để vẽ thanh, không ước lượng
    uint64_t disk_total = 0, disk_used = 0, disk_free = 0;
    {
        struct statvfs st{};
        if (statvfs("/", &st) == 0) {
            disk_total = static_cast<uint64_t>(st.f_blocks) * st.f_frsize;
            disk_free  = static_cast<uint64_t>(st.f_bavail) * st.f_frsize;
            disk_used  = disk_total > disk_free ? disk_total - disk_free : 0;
        }
    }

    std::ostringstream j;
    j << "{"
      << "\"cpu_usage\":" << info->cpu_usage << ","
      << "\"cpu_temp\":" << info->cpu_temp << ","
      << "\"cpu_cores\":" << info->cpu_cores << ","
      << "\"cpu_name\":\"" << json_escape(info->cpu_name) << "\","
      << "\"gpu_name\":\"" << json_escape(info->gpu_name) << "\","
      << "\"gpu_usage\":" << info->gpu_usage << ","
      << "\"gpu_temp\":" << info->gpu_temp << ","
      << "\"gpu_vram_total\":" << info->gpu_vram_total << ","
      << "\"gpu_vram_used\":" << info->gpu_vram_used << ","
      << "\"ram_total\":" << info->ram_total << ","
      << "\"ram_used\":" << info->ram_used << ","
      << "\"ram_available\":" << info->ram_available << ","
      << "\"disk_usage\":" << info->disk_usage << ","
      << "\"disk_total\":" << disk_total << ","
      << "\"disk_used\":" << disk_used << ","
      << "\"disk_free\":" << disk_free << ","
      << "\"disk_read\":" << info->disk_read << ","
      << "\"disk_write\":" << info->disk_write << ","
      << "\"net_upload\":" << info->net_upload << ","
      << "\"net_download\":" << info->net_download << ","
      << "\"simulated\":false"
      << "}";
    return json_response(200, j.str());
}

static Response api_market(const std::string& path) {
    std::string country = query_param(path, "country");
    if (country.empty()) country = "VN";

    const EconomicIndicator* eco = xkiro_get_economic_data(country.c_str());
    Stock stocks[50];
    size_t count = xkiro_get_stock_list(country.c_str(), stocks, 50);

    std::ostringstream j;
    j << "{\"country\":\"" << json_escape(country) << "\",\"source\":\"RUNE C++ MarketData (mô hình hóa theo quốc gia)\",\"indicator\":"
      << "{\"index_name\":\"" << json_escape(eco->index_name) << "\","
      << "\"index_value\":" << eco->index_value << ","
      << "\"index_change\":" << eco->index_change << ","
      << "\"index_change_pct\":" << eco->index_change_pct << ","
      << "\"gdp_growth\":" << eco->gdp_growth << ","
      << "\"inflation\":" << eco->inflation << ","
      << "\"unemployment\":" << eco->unemployment << ","
      << "\"interest_rate\":" << eco->interest_rate << "},"
      << "\"stocks\":[";
    for (size_t i = 0; i < count; i++) {
        if (i) j << ",";
        j << "{\"symbol\":\"" << json_escape(stocks[i].symbol) << "\","
          << "\"name\":\"" << json_escape(stocks[i].name) << "\","
          << "\"price\":" << stocks[i].price << ","
          << "\"change\":" << stocks[i].change << ","
          << "\"change_pct\":" << stocks[i].change_pct << ","
          << "\"volume\":" << stocks[i].volume << "}";
    }
    j << "]}";
    return json_response(200, j.str());
}

static Response api_keys_get(const std::string& path) {
    auto& km = KeyManager::instance();
    std::string one = query_param(path, "service");
    bool reveal = query_param(path, "reveal") == "1";
    if (!one.empty()) {
        std::string v = km.get_key(one);
        std::ostringstream j;
        j << "{\"service\":\"" << json_escape(one) << "\",\"exists\":" << (v.empty() ? "false" : "true") << ",";
        j << (reveal ? "\"key\":\"" + json_escape(v) + "\"" : "\"key_masked\":\"" + json_escape(mask_key(v)) + "\"");
        j << "}";
        return json_response(200, j.str());
    }
    auto all = km.get_all_keys();
    std::ostringstream j;
    j << "{\"count\":" << all.size() << ",\"keys\":[";
    bool first = true;
    for (auto& [k, v] : all) {
        if (!first) j << ",";
        first = false;
        j << "{\"service\":\"" << json_escape(k) << "\",\"masked\":\"" << json_escape(mask_key(v)) << "\",\"length\":" << v.size() << "}";
    }
    j << "],\"note\":\"Khóa lưu tại ~/.config/xkiro/keys.json trên máy bạn. Thêm ?service=xxx&reveal=1 để lấy giá trị thật.\"}";
    return json_response(200, j.str());
}

static Response api_keys_post(const std::string& body) {
    std::string service, key;
    if (!json_get_string(body, "service", service) || service.empty())
        return json_response(400, "{\"ok\":false,\"error\":\"thiếu trường 'service'\"}");
    if (!json_get_string(body, "key", key))
        return json_response(400, "{\"ok\":false,\"error\":\"thiếu trường 'key'\"}");
    if (key.empty()) {
        KeyManager::instance().delete_key(service);
        return json_response(200, "{\"ok\":true,\"action\":\"deleted\",\"service\":\"" + json_escape(service) + "\"}");
    }
    bool ok = KeyManager::instance().save_key(service, key);
    return json_response(ok ? 200 : 500,
        std::string("{\"ok\":") + (ok ? "true" : "false") + ",\"action\":\"saved\",\"service\":\"" + json_escape(service) +
        "\",\"masked\":\"" + json_escape(mask_key(key)) + "\"}");
}

static Response api_keys_delete(const std::string& path, const std::string& body) {
    std::string service = query_param(path, "service");
    if (service.empty()) json_get_string(body, "service", service);
    if (service.empty()) return json_response(400, "{\"ok\":false,\"error\":\"thiếu 'service'\"}");
    KeyManager::instance().delete_key(service);
    return json_response(200, "{\"ok\":true,\"action\":\"deleted\",\"service\":\"" + json_escape(service) + "\"}");
}

static Response api_cli(const std::string& body) {
    if (!g_allow_cli) {
        return json_response(403, "{\"ok\":false,\"error\":\"/api/cli đang tắt. Server không chạy ở chế độ loopback — đặt RUNE_ALLOW_CLI=1 nếu bạn thật sự muốn mở (nguy hiểm: cho phép chạy lệnh từ mạng).\"}");
    }
    std::string command, cwd;
    if (!json_get_string(body, "command", command) || command.empty())
        return json_response(400, "{\"ok\":false,\"error\":\"thiếu trường 'command'\"}");
    json_get_string(body, "cwd", cwd);
    long t = json_get_long(body, "timeout", 15);
    int timeout_s = static_cast<int>(std::min<long>(std::max<long>(t, 1), 120));

    auto t0 = std::chrono::steady_clock::now();
    CliResult r = run_command(command, cwd, timeout_s);
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - t0).count();

    if (!r.started) return json_response(500, "{\"ok\":false,\"error\":\"" + json_escape(r.output) + "\"}");

    std::ostringstream j;
    j << "{\"ok\":" << (r.exit_code == 0 ? "true" : "false") << ","
      << "\"command\":\"" << json_escape(command) << "\","
      << "\"cwd\":\"" << json_escape(cwd.empty() ? fs::current_path().string() : cwd) << "\","
      << "\"exit_code\":" << r.exit_code << ","
      << "\"timed_out\":" << (r.timed_out ? "true" : "false") << ","
      << "\"ms\":" << ms << ","
      << "\"bytes\":" << r.output.size() << ","
      << "\"output\":\"" << json_escape(r.output) << "\"}";
    return json_response(200, j.str());
}

/* ---------------- xử lý 1 request ---------------- */

static bool read_request(int fd, std::string& head, std::string& body, std::string& err) {
    head.clear(); body.clear();
    char buf[8192];
    size_t header_end = std::string::npos;
    while (head.size() < 64 * 1024) {
        ssize_t n = ::read(fd, buf, sizeof(buf));
        if (n <= 0) { if (head.empty()) err = "kết nối đóng"; else err = "đọc lỗi"; return false; }
        head.append(buf, static_cast<size_t>(n));
        header_end = head.find("\r\n\r\n");
        if (header_end != std::string::npos) break;
    }
    if (header_end == std::string::npos) { err = "header không hợp lệ"; return false; }

    std::string headers = to_lower(head.substr(0, header_end));
    size_t content_length = 0;
    {
        size_t p = headers.find("content-length:");
        if (p != std::string::npos) {
            p += 15;
            while (p < headers.size() && (headers[p] == ' ' || headers[p] == '\t')) p++;
            content_length = static_cast<size_t>(std::strtoul(headers.c_str() + p, nullptr, 10));
        }
    }
    if (content_length > 8 * 1024 * 1024) { err = "body quá lớn (>8MB)"; return false; }

    body = head.substr(header_end + 4);
    while (body.size() < content_length) {
        ssize_t n = ::read(fd, buf, std::min(sizeof(buf), content_length - body.size()));
        if (n <= 0) break;
        body.append(buf, static_cast<size_t>(n));
    }
    head = head.substr(0, header_end);
    return true;
}

static Response route(const std::string& method, const std::string& full_path, const std::string& body) {
    std::string path = full_path;
    size_t q = path.find('?');
    std::string query = (q == std::string::npos) ? "" : path.substr(q);
    if (q != std::string::npos) path = path.substr(0, q);
    path = url_decode(path);                      // giải mã %2e%2e để chặn vượt thư mục
    if (path.find('\0') != std::string::npos) return text_response(400, "Đường dẫn không hợp lệ");

    if (path.rfind("/api/", 0) == 0) {
        if (method != "GET" && method != "POST" && method != "DELETE" && method != "HEAD")
            return text_response(405, "Method Not Allowed");

        if (path == "/api/health" || path == "/api/ping") return api_health();
        if (path == "/api/system") return api_system();
        if (path == "/api/market") return api_market(path + query);

        if (path == "/api/keys") {
            if (method == "GET" || method == "HEAD") return api_keys_get(path + query);
            if (method == "POST") return api_keys_post(body);
            if (method == "DELETE") return api_keys_delete(path + query, body);
        }
        if (path == "/api/cli") {
            if (method != "POST") return text_response(405, "POST /api/cli {\"command\":\"...\"}");
            return api_cli(body);
        }
        if (path == "/api/cli/check") {
            return json_response(200, std::string("{\"ok\":true,\"cli_enabled\":") + (g_allow_cli ? "true" : "false") +
                ",\"timeout_bin\":" + (access("/usr/bin/timeout", X_OK) == 0 ? "true" : "false") + "}");
        }
        return json_response(404, "{\"ok\":false,\"error\":\"không có API " + json_escape(path) + "\",\"co_san\":[\"/api/health\",\"/api/system\",\"/api/market\",\"/api/keys\",\"/api/cli\"]}");
    }

    if (method != "GET" && method != "HEAD") return text_response(405, "Method Not Allowed");

    // ---- file tĩnh ----
    std::string rel = path;
    if (rel == "/" || rel.empty()) rel = "/index.html";
    if (rel.size() > 1 && rel.back() == '/') rel += "index.html";

    std::error_code ec;
    fs::path root = public_root();
    fs::path target = fs::weakly_canonical(root / rel.substr(1), ec);
    if (ec) return text_response(400, "Đường dẫn không hợp lệ");

    const std::string root_s = root.string();
    std::string target_s = target.string();
    if (target_s.rfind(root_s, 0) != 0) return text_response(403, "403 Forbidden: không được truy cập ngoài thư mục public/");

    if (fs::is_directory(target)) {
        target /= "index.html";
        target_s.append("/index.html");
    }
    if (!fs::exists(target) || !fs::is_regular_file(target)) {
        // SPA: trả index.html cho đường dẫn không có đuôi file
        std::string fname = fs::path(target).filename().string();
        if (fname.find('.') == std::string::npos && fs::exists(root / "index.html")) {
            Response r; r.status = 200; r.type = "text/html; charset=utf-8";
            read_binary(root / "index.html", r.body);
            return r;
        }
        return text_response(404, "404 Not Found: " + path + "\n(Chạy server từ thư mục gốc của dự án: ./build/rune_server)");
    }

    Response r;
    r.status = 200;
    r.type = get_mime(target_s);
    if (!read_binary(target, r.body)) return text_response(500, "Không đọc được file");
    r.extra_headers = "Cache-Control: no-cache\r\n";
    return r;
}

static void send_response(int fd, const std::string& method, const Response& r) {
    std::ostringstream resp;
    resp << "HTTP/1.1 " << r.status << " " << reason(r.status) << "\r\n"
         << "Content-Type: " << r.type << "\r\n"
         << "Content-Length: " << r.body.size() << "\r\n"
         << "Access-Control-Allow-Origin: *\r\n"
         << "Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS, HEAD\r\n"
         << "Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With\r\n"
         << "Access-Control-Max-Age: 86400\r\n"
         << "X-Content-Type-Options: nosniff\r\n"
         << r.extra_headers
         << "Connection: close\r\n"
         << "\r\n";
    std::string head = resp.str();
    std::string full = (method == "HEAD") ? head : head + r.body;

    size_t sent = 0;
    while (sent < full.size()) {
        ssize_t n = ::write(fd, full.data() + sent, full.size() - sent);
        if (n <= 0) {
            if (errno == EINTR) continue;
            break;
        }
        sent += static_cast<size_t>(n);
    }
}

static void handle_request(int client_fd) {
    std::string head, body, err;
    if (!read_request(client_fd, head, body, err)) {
        if (!err.empty() && err != "kết nối đóng") {
            Response r = text_response(400, "400 Bad Request: " + err);
            send_response(client_fd, "GET", r);
        }
        close(client_fd);
        return;
    }

    std::string method, full_path, version;
    {
        std::istringstream req(head);
        req >> method >> full_path >> version;
    }
    std::transform(method.begin(), method.end(), method.begin(),
                   [](unsigned char c) { return static_cast<char>(std::toupper(c)); });
    if (method.empty() || full_path.empty()) {
        send_response(client_fd, "GET", text_response(400, "400 Bad Request"));
        close(client_fd);
        return;
    }

    g_req_count++;
    std::string show = full_path.size() > 120 ? full_path.substr(0, 120) + "…" : full_path;
    std::cout << "[REQ " << g_req_count.load() << "] " << method << " " << show
              << (body.empty() ? "" : " (" + std::to_string(body.size()) + "B)") << std::endl;

    Response r;
    if (method == "OPTIONS") {
        r.status = 204; r.type = "text/plain"; r.body = "";
    } else if (method == "TRACE" || method == "PUT" || method == "PATCH") {
        r = text_response(501, "501 Not Implemented");
    } else {
        try { r = route(method, full_path, body); }
        catch (const std::exception& e) { r = json_response(500, std::string("{\"ok\":false,\"error\":\"") + json_escape(e.what()) + "\"}"); }
        catch (...) { r = json_response(500, "{\"ok\":false,\"error\":\"lỗi không xác định\"}"); }
    }
    if (method != "OPTIONS" && r.status >= 400) std::cout << "   → " << r.status << " " << reason(r.status) << std::endl;

    send_response(client_fd, method, r);
    close(client_fd);
}

/* ---------------- main ---------------- */

int main(int argc, char** argv) {
    int port = 8080;
    std::string bind_addr = "127.0.0.1";

    if (const char* p = std::getenv("RUNE_PORT")) port = std::atoi(p);
    if (const char* b = std::getenv("RUNE_BIND")) bind_addr = b;
    for (int i = 1; i < argc; i++) {
        std::string a = argv[i];
        if ((a == "-p" || a == "--port") && i + 1 < argc) port = std::atoi(argv[++i]);
        else if ((a == "-b" || a == "--bind") && i + 1 < argc) bind_addr = argv[++i];
        else if (a == "-h" || a == "--help") {
            std::cout << "Cách dùng: rune_server [-p cổng] [-b địa chỉ]\n"
                      << "  Biến môi trường: RUNE_PORT, RUNE_BIND, RUNE_ALLOW_CLI\n"
                      << "  Mặc định chỉ nghe 127.0.0.1:8080 (an toàn).\n";
            return 0;
        }
    }
    if (port <= 0 || port > 65535) { std::cerr << "Cổng không hợp lệ: " << port << std::endl; return 1; }

    g_loopback_only = (bind_addr == "127.0.0.1" || bind_addr == "localhost");
    if (const char* ac = std::getenv("RUNE_ALLOW_CLI")) g_allow_cli = (std::string(ac) == "1" || to_lower(ac) == "true");
    else g_allow_cli = g_loopback_only;

    if (!fs::exists(public_root() / "index.html")) {
        std::cout << "⚠ Không thấy public/index.html tại " << public_root().string()
                  << "\n  Hãy chạy server từ thư mục gốc của dự án." << std::endl;
    }

    std::cout << "==================================================" << std::endl;
    std::cout << "  RUNE Local Server (C++20)  v" << SERVER_VERSION << std::endl;
    std::cout << "==================================================" << std::endl;
    std::cout << "  URL          : http://" << (g_loopback_only ? "localhost" : bind_addr) << ":" << port << std::endl;
    std::cout << "  Thư mục web  : " << public_root().string() << std::endl;
    std::cout << "  /api/cli     : " << (g_allow_cli ? "BẬT (chạy lệnh thật trên máy)" : "TẮT") << std::endl;
    std::cout << "  Khóa API     : ~/.config/xkiro/keys.json" << std::endl;
    std::cout << "  Dừng server  : Ctrl+C" << std::endl;
    std::cout << "==================================================" << std::endl;

    std::signal(SIGPIPE, SIG_IGN);

    // Lấy mẫu CPU/RAM đầu tiên để lần gọi /api/system đầu tiên đã có số liệu
    SystemMonitor::instance().refresh();
    std::this_thread::sleep_for(std::chrono::milliseconds(180));
    SystemMonitor::instance().refresh();

    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd < 0) { std::cerr << "Không tạo được socket: " << std::strerror(errno) << std::endl; return 1; }

    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(static_cast<uint16_t>(port));
    if (inet_pton(AF_INET, bind_addr.c_str(), &addr.sin_addr) != 1) {
        std::cerr << "Địa chỉ bind không hợp lệ: " << bind_addr << std::endl;
        close(server_fd);
        return 1;
    }
    if (bind(server_fd, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) < 0) {
        std::cerr << "Không bind được " << bind_addr << ":" << port << " — " << std::strerror(errno)
                  << "\n  (port đang bị chiếm? thử: RUNE_PORT=9000 ./build/rune_server)" << std::endl;
        close(server_fd);
        return 1;
    }
    if (listen(server_fd, 64) < 0) {
        std::cerr << "listen() lỗi: " << std::strerror(errno) << std::endl;
        close(server_fd);
        return 1;
    }

    while (true) {
        sockaddr_in client_addr{};
        socklen_t len = sizeof(client_addr);
        int client = accept(server_fd, reinterpret_cast<sockaddr*>(&client_addr), &len);
        if (client < 0) {
            if (errno == EINTR) continue;
            std::cerr << "accept() lỗi: " << std::strerror(errno) << std::endl;
            continue;
        }
        std::thread(handle_request, client).detach();
    }

    close(server_fd);
    return 0;
}
