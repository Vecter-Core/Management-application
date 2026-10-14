#include "key_manager.h"
#include <fstream>
#include <filesystem>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

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
    if (f) {
        try {
            json j;
            f >> j;
            for (auto& [k, v] : j.items()) {
                keys[k] = v.get<std::string>();
            }
        } catch (...) {}
    }
}

void KeyManager::save_to_file() {
    std::ofstream f(config_path);
    if (f) {
        json j;
        for (auto& [k, v] : keys) {
            j[k] = v;
        }
        f << j.dump(4);
    }
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
