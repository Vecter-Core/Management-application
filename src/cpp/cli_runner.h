#pragma once
#include "xkiro.h"
#include <string>
#include <unordered_map>
#include <mutex>
#include <thread>
#include <atomic>

struct CliProcess {
    FILE* pipe = nullptr;
    std::thread reader_thread;
    std::atomic<bool> running{false};
    std::string buffer;
};

class CliRunner {
public:
    static CliRunner& instance();
    uint64_t execute(const std::string& command, CliOutputCallback callback, void* userdata);
    bool is_running(uint64_t handle);
    void kill(uint64_t handle);

private:
    CliRunner() = default;
    std::unordered_map<uint64_t, std::unique_ptr<CliProcess>> processes;
    std::mutex mtx;
    uint64_t next_handle = 1;
};

extern "C" {
    uint64_t xkiro_cli_execute(const char* command, CliOutputCallback callback, void* userdata);
    int xkiro_cli_is_running(uint64_t handle);
    void xkiro_cli_kill(uint64_t handle);
}
