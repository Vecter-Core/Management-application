#pragma once
#include <string>
#include <unordered_map>
#include <mutex>

class KeyManager {
public:
    static KeyManager& instance();
    bool save_key(const std::string& service, const std::string& key);
    std::string get_key(const std::string& service);
    void delete_key(const std::string& service);
    std::unordered_map<std::string, std::string> get_all_keys();
    void load_from_file();
    void save_to_file();

private:
    KeyManager();
    ~KeyManager();
    std::unordered_map<std::string, std::string> keys;
    std::mutex mtx;
    std::string config_path;
};

extern "C" {
    int xkiro_save_key(const char* service, const char* key);
    const char* xkiro_get_key(const char* service);
    void xkiro_delete_key(const char* service);
}
