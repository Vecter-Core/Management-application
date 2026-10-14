#pragma once
#include "xkiro.h"
#include <string>
#include <vector>
#include <unordered_map>
#include <mutex>

struct MarketData {
    EconomicIndicator indicator;
    std::vector<Stock> stocks;
    std::vector<std::pair<uint64_t, double>> chart_data;
    uint64_t last_updated;
};

class MarketDataManager {
public:
    static MarketDataManager& instance();
    const EconomicIndicator* get_economic(const std::string& country_code);
    size_t get_stocks(const std::string& country_code, Stock* out, size_t max);
    int get_chart(const std::string& symbol, uint64_t* timestamps, double* values, size_t* count);
    void refresh_market(const std::string& country_code);

private:
    MarketDataManager() = default;
    std::unordered_map<std::string, MarketData> cache;
    std::mutex mtx;

    void fetch_yahoo_finance(const std::string& country);
    void fetch_fred_data(const std::string& country);
    MarketData get_default_data(const std::string& country);
};

extern "C" {
    const EconomicIndicator* xkiro_get_economic_data(const char* country_code);
    size_t xkiro_get_stock_list(const char* country_code, Stock* out_stocks, size_t max_count);
    int xkiro_get_chart_data(const char* symbol, uint64_t* timestamps, double* values, size_t* count);
}
