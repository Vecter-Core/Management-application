#include "cli_runner.h"
#include <cstdio>
#include <memory>
#include <signal.h>

CliRunner& CliRunner::instance() {
    static CliRunner inst;
    return inst;
}

uint64_t CliRunner::execute(const std::string& command, CliOutputCallback callback, void* userdata) {
    std::lock_guard<std::mutex> lock(mtx);
    auto proc = std::make_unique<CliProcess>();
    
    proc->pipe = popen((command + " 2>&1").c_str(), "r");
    if (!proc->pipe) return 0;

    uint64_t handle = next_handle++;
    proc->running = true;

    CliProcess* proc_ptr = proc.get();
    proc->reader_thread = std::thread([proc_ptr, callback, userdata]() {
        char buf[4096];
        while (proc_ptr->running && fgets(buf, sizeof(buf), proc_ptr->pipe)) {
            if (callback) {
                callback(buf, userdata);
            }
        }
        proc_ptr->running = false;
        pclose(proc_ptr->pipe);
    });
    proc->reader_thread.detach();

    processes[handle] = std::move(proc);
    return handle;
}

bool CliRunner::is_running(uint64_t handle) {
    std::lock_guard<std::mutex> lock(mtx);
    auto it = processes.find(handle);
    if (it == processes.end()) return false;
    return it->second->running;
}

void CliRunner::kill(uint64_t handle) {
    std::lock_guard<std::mutex> lock(mtx);
    auto it = processes.find(handle);
    if (it != processes.end()) {
        it->second->running = false;
        pclose(it->second->pipe);
        processes.erase(it);
    }
}

extern "C" {
    uint64_t xkiro_cli_execute(const char* command, CliOutputCallback callback, void* userdata) {
        return CliRunner::instance().execute(command, callback, userdata);
    }
    int xkiro_cli_is_running(uint64_t handle) {
        return CliRunner::instance().is_running(handle) ? 1 : 0;
    }
    void xkiro_cli_kill(uint64_t handle) {
        CliRunner::instance().kill(handle);
    }
}
