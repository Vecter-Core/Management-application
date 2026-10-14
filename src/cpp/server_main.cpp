// xKiro Local Server - C++20
// Server HTTP local chạy nền để phục vụ giao diện và cung cấp API
// Build command:
// mkdir build && cd build && cmake .. && make -j$(nproc)

#include <iostream>
#include <string>
#include <cstring>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <fstream>
#include <sstream>
#include <thread>
#include <chrono>
#include <filesystem>

#include "system_monitor.h"
#include "market_data.h"
#include "key_manager.h"
#include "cli_runner.h"

namespace fs = std::filesystem;

std::string read_file(const std::string& path) {
    std::ifstream f(path);
    if (!f) return "";
    std::stringstream ss;
    ss << f.rdbuf();
    return ss.str();
}

std::string get_mime(const std::string& path) {
    if (path.ends_with(".html")) return "text/html; charset=utf-8";
    if (path.ends_with(".css")) return "text/css; charset=utf-8";
    if (path.ends_with(".js")) return "application/javascript; charset=utf-8";
    if (path.ends_with(".json")) return "application/json";
    if (path.ends_with(".png")) return "image/png";
    if (path.ends_with(".jpg") || path.ends_with(".jpeg")) return "image/jpeg";
    return "application/octet-stream";
}

std::string json_escape(const std::string& s) {
    std::string out;
    for (char c : s) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            default: out += c;
        }
    }
    return out;
}

void handle_request(int client_fd) {
    char buf[16384] = {0};
    read(client_fd, buf, sizeof(buf) - 1);
    
    std::string request(buf);
    std::string method, path;
    std::istringstream req(request);
    req >> method >> path;

    std::string body;
    size_t body_pos = request.find("\r\n\r\n");
    if (body_pos != std::string::npos) {
        body = request.substr(body_pos + 4);
    }

    std::cout << "[REQ] " << method << " " << path << std::endl;

    std::string response;
    std::string content;
    std::string content_type = "text/plain";

    // API endpoints
    if (path.starts_with("/api/system")) {
        content_type = "application/json";
        SystemMonitor::instance().refresh();
        const SystemInfo* info = xkiro_get_system_info();
        
        std::ostringstream json;
        json << "{"
            << "\"cpu_usage\":" << info->cpu_usage << ","
            << "\"cpu_temp\":" << info->cpu_temp << ","
            << "\"cpu_cores\":" << info->cpu_cores << ","
            << "\"cpu_name\":\"" << json_escape(info->cpu_name) << "\","
            << "\"gpu_name\":\"" << json_escape(info->gpu_name) << "\","
            << "\"gpu_usage\":" << info->gpu_usage << ","
            << "\"gpu_temp\":" << info->gpu_temp << ","
            << "\"ram_total\":" << info->ram_total << ","
            << "\"ram_used\":" << info->ram_used << ","
            << "\"ram_available\":" << info->ram_available << ","
            << "\"disk_read\":" << info->disk_read << ","
            << "\"disk_write\":" << info->disk_write << ","
            << "\"net_upload\":" << info->net_upload << ","
            << "\"net_download\":" << info->net_download
            << "}";
        content = json.str();
    }
    else if (path.starts_with("/api/market")) {
        content_type = "application/json";
        // Parse country code
        std::string country = "VN";
        size_t q = path.find("?country=");
        if (q != std::string::npos) {
            country = path.substr(q + 9);
            size_t end = country.find('&');
            if (end != std::string::npos) country = country.substr(0, end);
        }

        const EconomicIndicator* eco = xkiro_get_economic_data(country.c_str());
        Stock stocks[50];
        size_t count = xkiro_get_stock_list(country.c_str(), stocks, 50);

        std::ostringstream json;
        json << "{\"indicator\":"
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
            if (i > 0) json << ",";
            json << "{\"symbol\":\"" << stocks[i].symbol << "\","
                 << "\"name\":\"" << json_escape(stocks[i].name) << "\","
                 << "\"price\":" << stocks[i].price << ","
                 << "\"change\":" << stocks[i].change << ","
                 << "\"change_pct\":" << stocks[i].change_pct << ","
                 << "\"volume\":" << stocks[i].volume << "}";
        }
        json << "]}";
        content = json.str();
    }
    else {
        // Serve static files
        std::string file_path = "public/";
        if (path == "/" || path.empty()) {
            file_path += "index.html";
        } else {
            file_path += path.substr(1);
        }

        if (fs::exists(file_path) && fs::is_regular_file(file_path)) {
            content = read_file(file_path);
            content_type = get_mime(file_path);
        } else {
            content = "404 Not Found";
            content_type = "text/plain";
        }
    }

    // Build HTTP response
    std::ostringstream resp;
    resp << "HTTP/1.1 200 OK\r\n"
         << "Content-Type: " << content_type << "\r\n"
         << "Content-Length: " << content.size() << "\r\n"
         << "Access-Control-Allow-Origin: *\r\n"
         << "Connection: close\r\n"
         << "\r\n"
         << content;
    
    response = resp.str();
    write(client_fd, response.c_str(), response.size());
    close(client_fd);
}

int main() {
    std::cout << "========================================" << std::endl;
    std::cout << " xKiro Management Server (C++20)       " << std::endl;
    std::cout << " Backend: Native C++                   " << std::endl;
    std::cout << " App Shell: Rust Tauri                 " << std::endl;
    std::cout << "========================================" << std::endl;
    std::cout << "Server đang chạy tại http://localhost:8080" << std::endl;
    std::cout << "Nhấn Ctrl+C để dừng" << std::endl;

    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd < 0) {
        std::cerr << "Không thể tạo socket" << std::endl;
        return 1;
    }

    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(8080);

    if (bind(server_fd, (sockaddr*)&addr, sizeof(addr)) < 0) {
        std::cerr << "Không thể bind port 8080. Port đã được sử dụng!" << std::endl;
        close(server_fd);
        return 1;
    }

    listen(server_fd, 10);

    while (true) {
        sockaddr_in client_addr{};
        socklen_t len = sizeof(client_addr);
        int client = accept(server_fd, (sockaddr*)&client_addr, &len);
        if (client >= 0) {
            std::thread(handle_request, client).detach();
        }
    }

    close(server_fd);
    return 0;
}
