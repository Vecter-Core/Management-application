#include "market_data.h"
#include <cstring>
#include <cmath>
#include <random>
#include <ctime>

MarketDataManager& MarketDataManager::instance() {
    static MarketDataManager inst;
    return inst;
}

MarketData MarketDataManager::get_default_data(const std::string& country) {
    MarketData md{};
    strncpy(md.indicator.country, country.c_str(), sizeof(md.indicator.country) - 1);

    if (country == "US") {
        strncpy(md.indicator.index_name, "S&P 500", sizeof(md.indicator.index_name) - 1);
        md.indicator.index_value = 5854.0 + (rand() % 200 - 100) * 0.1;
        md.indicator.gdp_growth = 2.8;
        md.indicator.inflation = 3.2;
        md.indicator.unemployment = 4.1;
        md.indicator.interest_rate = 5.5;

        const char* symbols[] = {"AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "JPM", "V", "WMT"};
        const char* names[] = {"Apple", "Microsoft", "Alphabet", "Amazon", "NVIDIA", "Meta", "Tesla", "JPMorgan", "Visa", "Walmart"};
        double prices[] = {225.5, 428.2, 175.3, 188.7, 138.5, 562.1, 242.8, 215.2, 285.4, 72.3};

        for (int i = 0; i < 10; i++) {
            Stock s{};
            strncpy(s.symbol, symbols[i], sizeof(s.symbol)-1);
            strncpy(s.name, names[i], sizeof(s.name)-1);
            s.price = prices[i] + (rand() % 1000 - 500) * 0.01;
            double chg = (rand() % 600 - 300) * 0.01;
            s.change = chg;
            s.change_pct = chg / s.price * 100;
            s.volume = rand() % 50000000 + 10000000;
            md.stocks.push_back(s);
        }
    } else if (country == "VN") {
        strncpy(md.indicator.index_name, "VN-Index", sizeof(md.indicator.index_name) - 1);
        md.indicator.index_value = 1285.5 + (rand() % 300 - 150) * 0.01;
        md.indicator.gdp_growth = 5.2;
        md.indicator.inflation = 3.8;
        md.indicator.unemployment = 2.3;
        md.indicator.interest_rate = 4.5;

        const char* symbols[] = {"VIC", "VHM", "VNM", "VCB", "BID", "CTG", "GAS", "FPT", "MWG", "SSI"};
        const char* names[] = {"Vingroup", "Vinhomes", "Vinamilk", "Vietcombank", "BIDV", "Vietinbank", "PetroGas", "FPT Corp", "Mobile World", "SSI Securities"};
        double prices[] = {45.2, 42.8, 70.5, 89.2, 48.5, 34.2, 82.1, 115.3, 38.7, 28.5};

        for (int i = 0; i < 10; i++) {
            Stock s{};
            strncpy(s.symbol, symbols[i], sizeof(s.symbol)-1);
            strncpy(s.name, names[i], sizeof(s.name)-1);
            s.price = prices[i] + (rand() % 200 - 100) * 0.01;
            double chg = (rand() % 300 - 150) * 0.01;
            s.change = chg;
            s.change_pct = chg / s.price * 100;
            s.volume = rand() % 10000000 + 1000000;
            md.stocks.push_back(s);
        }
    } else if (country == "JP") {
        strncpy(md.indicator.index_name, "Nikkei 225", sizeof(md.indicator.index_name) - 1);
        md.indicator.index_value = 39520.0 + (rand() % 5000 - 2500) * 0.01;
        md.indicator.gdp_growth = 1.2;
        md.indicator.inflation = 2.8;
        md.indicator.unemployment = 2.5;
        md.indicator.interest_rate = 0.25;
    } else if (country == "CN") {
        strncpy(md.indicator.index_name, "SSE Composite", sizeof(md.indicator.index_name) - 1);
        md.indicator.index_value = 3280.5;
        md.indicator.gdp_growth = 4.8;
        md.indicator.inflation = 0.7;
        md.indicator.unemployment = 5.1;
        md.indicator.interest_rate = 3.45;
    } else if (country == "EU") {
        strncpy(md.indicator.index_name, "Euro Stoxx 50", sizeof(md.indicator.index_name) - 1);
        md.indicator.index_value = 4820.3;
        md.indicator.gdp_growth = 0.8;
        md.indicator.inflation = 2.4;
        md.indicator.unemployment = 6.4;
        md.indicator.interest_rate = 4.5;
    }

    double chg_pct = (rand() % 400 - 200) * 0.01;
    md.indicator.index_change = md.indicator.index_value * chg_pct / 100.0;
    md.indicator.index_change_pct = chg_pct;

    // Tạo dữ liệu biểu đồ 30 ngày
    time_t now = time(nullptr);
    double base = md.indicator.index_value * 0.95;
    for (int i = 29; i >= 0; i--) {
        uint64_t ts = now - i * 86400;
        base += (rand() % 300 - 140) * 0.01 * md.indicator.index_value / 100.0;
        md.chart_data.emplace_back(ts, base);
    }
    md.chart_data.back().second = md.indicator.index_value;

    md.last_updated = (uint64_t)now;
    return md;
}

void MarketDataManager::refresh_market(const std::string& country) {
    std::lock_guard<std::mutex> lock(mtx);
    cache[country] = get_default_data(country);
}

const EconomicIndicator* MarketDataManager::get_economic(const std::string& country_code) {
    std::lock_guard<std::mutex> lock(mtx);
    time_t now = time(nullptr);
    if (!cache.count(country_code) || now - (time_t)cache[country_code].last_updated > 60) {
        cache[country_code] = get_default_data(country_code);
    }
    return &cache[country_code].indicator;
}

size_t MarketDataManager::get_stocks(const std::string& country_code, Stock* out, size_t max) {
    std::lock_guard<std::mutex> lock(mtx);
    if (!cache.count(country_code)) {
        cache[country_code] = get_default_data(country_code);
    }
    size_t count = std::min(max, cache[country_code].stocks.size());
    memcpy(out, cache[country_code].stocks.data(), count * sizeof(Stock));
    return count;
}

int MarketDataManager::get_chart(const std::string& symbol, uint64_t* timestamps, double* values, size_t* count) {
    std::lock_guard<std::mutex> lock(mtx);
    // Mặc định trả về chart của chỉ số chính
    std::string country = "US";
    if (!cache.count(country)) {
        cache[country] = get_default_data(country);
    }
    size_t n = std::min(*count, cache[country].chart_data.size());
    for (size_t i = 0; i < n; i++) {
        timestamps[i] = cache[country].chart_data[i].first;
        values[i] = cache[country].chart_data[i].second;
    }
    *count = n;
    return 0;
}

extern "C" {
    const EconomicIndicator* xkiro_get_economic_data(const char* country_code) {
        return MarketDataManager::instance().get_economic(country_code);
    }
    size_t xkiro_get_stock_list(const char* country_code, Stock* out_stocks, size_t max_count) {
        return MarketDataManager::instance().get_stocks(country_code, out_stocks, max_count);
    }
    int xkiro_get_chart_data(const char* symbol, uint64_t* timestamps, double* values, size_t* count) {
        return MarketDataManager::instance().get_chart(symbol, timestamps, values, count);
    }
}
