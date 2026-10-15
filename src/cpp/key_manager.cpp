#include "key_manager.h"
#include <fstream>
#include <sstream>
#include <filesystem>
#include <cctype>

// ---- JSON tối giản (object phẳng {"key":"value"}) ----
// Tự viết để backend không phụ thuộc thư viện ngoài (nlohmann/json chưa chắc có sẵn),
// nhờ vậy `make -f Makefile` hoặc ./build.sh chạy được trên máy sạch.
namespace {
    std::string esc(const std::string& s) {
        std::string o;
        for (char c : s) {
            if (c == '"') o += "\\\"";
            else if (c == '\\') o += "\\\\";
            else if (c == '\n') o += "\\n";
            else if (c == '\r') o += "\\r";
            else if (c == '\t') o += "\\t";
            else o += c;
        }
        return o;
    }
    std::string unesc(const std::string& s) {
        std::string o;
        for (size_t i = 0; i < s.size(); i++) {
            if (s[i] == '\\' && i + 1 < s.size()) {
                char n = s[++i];
                if (n == 'n') o += '\n';
                else if (n == 't') o += '\t';
                else if (n == 'r') o += '\r';
                else o += n;
            } else o += s[i];
        }
        return o;
    }
    // đọc 1 chuỗi JSON bắt đầu tại dấu nháy kép ở vị trí i; trả vị trí sau dấu nháy đóng
    bool read_string(const std::string& t, size_t& i, std::string& out) {
        if (i >= t.size() || t[i] != '"') return false;
        i++;
        std::string raw;
        while (i < t.size() && t[i] != '"') {
            if (t[i] == '\\' && i + 1 < t.size()) { raw += t[i]; raw += t[i + 1]; i += 2; continue; }
            raw += t[i++];
        }
        if (i >= t.size()) return false;
        i++; // bỏ qua dấu "
        out = unesc(raw);
        return true;
    }
    bool parse_flat_json(const std::string& text, std::unordered_map<std::string, std::string>& out) {
        size_t i = text.find('{');
        if (i == std::string::npos) return false;
        i++;
        while (i < text.size()) {
            while (i < text.size() && (std::isspace(static_cast<unsigned char>(text[i])) || text[i] == ',')) i++;
            if (i >= text.size() || text[i] == '}') break;
            std::string k, v;
            if (!read_string(text, i, k)) return false;
            while (i < text.size() && std::isspace(static_cast<unsigned char>(text[i]))) i++;
            if (i >= text.size() || text[i] != ':') return false;
            i++;
            while (i < text.size() && std::isspace(static_cast<unsigned char>(text[i]))) i++;
            if (!read_string(text, i, v)) return false;
            out[k] = v;
        }
        return true;
    }
}

KeyManager& KeyManager::instance() {
    static KeyManager inst;
    return inst;
}

KeyManager::KeyManager() {
    const char* home = getenv("HOME");
    if (home) {
        std::filesystem::create_directories(std::string(home) + "/.config/xkiro");
        config_path = std::string(home) + "/.config/xkiro/keys.json";
    } else {
        config_path = "keys.json";
    }
    load_from_file();
}

KeyManager::~KeyManager() {
    save_to_file();
}

void KeyManager::load_from_file() {
    std::ifstream f(config_path);
    if (!f) return;
    std::stringstream ss;
    ss << f.rdbuf();
    std::unordered_map<std::string, std::string> parsed;
    if (parse_flat_json(ss.str(), parsed)) {
        std::lock_guard<std::mutex> lock(mtx);
        for (auto& [k, v] : parsed) keys[k] = v;
    }
}

void KeyManager::save_to_file() {
    std::ofstream f(config_path);
    if (!f) return;
    f << "{\n";
    bool first = true;
    for (auto& [k, v] : keys) {
        if (!first) f << ",\n";
        first = false;
        f << "    \"" << esc(k) << "\": \"" << esc(v) << "\"";
    }
    f << (first ? "" : "\n") << "}\n";
    f.flush();
    try {
        std::filesystem::permissions(config_path,
            std::filesystem::perms::owner_read | std::filesystem::perms::owner_write,
            std::filesystem::perm_options::replace);
    } catch (...) {}
}

bool KeyManager::save_key(const std::string& service, const std::string& key) {
    std::lock_guard<std::mutex> lock(mtx);
    keys[service] = key;
    save_to_file();
    return true;
}

std::string KeyManager::get_key(const std::string& service) {
    std::lock_guard<std::mutex> lock(mtx);
    auto it = keys.find(service);
    if (it != keys.end()) return it->second;
    return "";
}

void KeyManager::delete_key(const std::string& service) {
    std::lock_guard<std::mutex> lock(mtx);
    keys.erase(service);
    save_to_file();
}

std::unordered_map<std::string, std::string> KeyManager::get_all_keys() {
    std::lock_guard<std::mutex> lock(mtx);
    return keys;
}

static thread_local std::string return_buf;

extern "C" {
    int xkiro_save_key(const char* service, const char* key) {
        return KeyManager::instance().save_key(service, key) ? 1 : 0;
    }
    const char* xkiro_get_key(const char* service) {
        return_buf = KeyManager::instance().get_key(service);
        return return_buf.c_str();
    }
    void xkiro_delete_key(const char* service) {
        KeyManager::instance().delete_key(service);
    }
}
