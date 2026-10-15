// ============================================================
//  web_scraper.cpp — các hàm FFI mà src/rust/lib.rs khai báo
//  (xkiro_web_fetch / xkiro_web_search / xkiro_free_string)
//
//  Trước đây file này bị thiếu trong repo → thư viện Rust không link được.
//  Cách thực hiện: gọi `curl` có sẵn trên máy (không cần thư viện TLS),
//  quote URL an toàn để không bị tiêm lệnh shell.
//  Kết quả là chuỗi cấp phát bằng malloc() — người gọi phải giải phóng
//  bằng xkiro_free_string() (đúng như lib.rs đang làm).
// ============================================================

#include "xkiro.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cctype>
#include <string>
#include <array>
#include <algorithm>

namespace {

    // Bọc chuỗi trong dấu nháy đơn, thoát nháy đơn bên trong → an toàn cho sh -c
    std::string shell_quote(const std::string& s) {
        std::string out = "'";
        for (char c : s) {
            if (c == '\'') out += "'\\''";
            else out += c;
        }
        out += "'";
        return out;
    }

    bool has_curl() {
        static int cached = -1;
        if (cached < 0) cached = (std::system("command -v curl >/dev/null 2>&1") == 0) ? 1 : 0;
        return cached == 1;
    }

    // Chạy lệnh, gom toàn bộ stdout, giới hạn max_bytes
    std::string capture(const std::string& cmd, size_t max_bytes) {
        std::string out;
        FILE* p = popen(cmd.c_str(), "r");
        if (!p) return out;
        std::array<char, 8192> buf{};
        while (out.size() < max_bytes) {
            size_t n = std::fread(buf.data(), 1, std::min(buf.size(), max_bytes - out.size()), p);
            if (n == 0) break;
            out.append(buf.data(), n);
        }
        pclose(p);
        return out;
    }

    std::string url_encode(const std::string& s) {
        std::string out;
        for (unsigned char c : s) {
            if (std::isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') out += static_cast<char>(c);
            else {
                static const char* hex = "0123456789ABCDEF";
                out += '%';
                out += hex[c >> 4];
                out += hex[c & 0xF];
            }
        }
        return out;
    }

    char* to_c_string(const std::string& s) {
        char* p = static_cast<char*>(std::malloc(s.size() + 1));
        if (!p) return nullptr;
        std::memcpy(p, s.c_str(), s.size() + 1);
        return p;
    }

} // namespace

extern "C" {

    // Tải nội dung 1 URL (HTTP/HTTPS) — trả về nullptr nếu thất bại
    char* xkiro_web_fetch(const char* url) {
        if (!url || !*url) return nullptr;
        if (!has_curl()) return nullptr;
        std::string cmd = "curl -sSL --max-time 20 -A "
                          + shell_quote("RUNE/2.0 (+local)") + " -- " + shell_quote(url) + " 2>/dev/null";
        std::string body = capture(cmd, 4 * 1024 * 1024);
        if (body.empty()) return nullptr;
        return to_c_string(body);
    }

    // Tìm kiếm nhanh bằng DuckDuckGo Instant Answer API (trả về JSON thô)
    char* xkiro_web_search(const char* query) {
        if (!query || !*query) return nullptr;
        if (!has_curl()) return nullptr;
        std::string url = "https://api.duckduckgo.com/?q=" + url_encode(query) + "&format=json&no_html=1&skip_disambig=1";
        std::string body = capture("curl -sSL --max-time 15 -- " + shell_quote(url) + " 2>/dev/null", 2 * 1024 * 1024);
        if (body.empty()) return nullptr;
        return to_c_string(body);
    }

    void xkiro_free_string(char* str) {
        std::free(str);
    }

}
