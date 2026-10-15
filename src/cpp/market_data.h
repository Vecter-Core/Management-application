#pragma once
#include "xkiro.h"
#include <string>
#include <vector>
#include <map>
#include <mutex>
#include <utility>

// Dữ liệu thị trường THẬT:
//  • GDP / lạm phát / thất nghiệp / lãi suất  → World Bank Open Data (không cần khóa)
//  • Chỉ số + giá cổ phiếu + chuỗi 30 ngày    → Yahoo Finance chart API (không cần khóa)
// Khi máy không có mạng/không có curl thì đánh dấu simulated = true và nói rõ trong `source`,
// KHÔNG trộn số giả vào số thật.
struct MarketData {
    EconomicIndicator indicator{};
    std::vector<Stock> stocks;
    std::vector<std::pair<uint64_t, double>> chart_data;   // chuỗi giá thật theo timestamp
    uint64_t last_updated = 0;

    // ---- nguồn gốc dữ liệu (để UI hiển thị trung thực) ----
    std::string index_symbol;      // ^GSPC, ^VNINDEX…
    std::string source;            // mô tả nguồn thật
    std::string note;              // ghi chú lỗi/giới hạn (nếu có)
    std::string econ_year;         // năm của số liệu World Bank, vd "2023"
    std::string currency;
    bool real_index = false;       // chỉ số lấy được từ Yahoo?
    bool real_econ = false;        // 4 chỉ tiêu lấy được từ World Bank?
    bool real_stocks = false;      // có ít nhất 1 mã cổ phiếu giá thật?
    bool simulated = true;         // true nếu PHẢI dùng số tham khảo tĩnh
    size_t stocks_ok = 0;          // bao nhiêu mã trả về giá thật
    size_t stocks_total = 0;
    std::vector<std::string> stock_errors;   // mã nào KHÔNG lấy được + lý do thật
};

class MarketDataManager {
public:
    static MarketDataManager& instance();
    const EconomicIndicator* get_economic(const std::string& country_code);
    size_t get_stocks(const std::string& country_code, Stock* out, size_t max);
    int get_chart(const std::string& symbol, uint64_t* timestamps, double* values, size_t* count);
    void refresh_market(const std::string& country_code, bool force = false);

    // metadata JSON (nguồn, năm số liệu, số mã lấy được, có phải mô phỏng không)
    std::string meta_json(const std::string& country_code);
    // chuỗi biểu đồ thật của 1 quốc gia (rỗng nếu không lấy được)
    std::vector<std::pair<uint64_t, double>> chart_series(const std::string& country_code);

private:
    MarketDataManager() = default;
    std::map<std::string, MarketData> cache;   // std::map → con trỏ trả ra ngoài vẫn ổn định
    std::mutex mtx;          // bảo vệ cache
    std::mutex fetch_mtx;    // chỉ một luồng đi mạng tại một thời điểm

    MarketData& ensure_entry(const std::string& country_code);
    bool is_stale(const MarketData& md, uint64_t now, uint64_t ttl) const;
    MarketData build(const std::string& country_code);
};

extern "C" {
    const EconomicIndicator* xkiro_get_economic_data(const char* country_code);
    size_t xkiro_get_stock_list(const char* country_code, Stock* out_stocks, size_t max_count);
    int xkiro_get_chart_data(const char* symbol, uint64_t* timestamps, double* values, size_t* count);
    const char* xkiro_market_meta(const char* country_code);
}
