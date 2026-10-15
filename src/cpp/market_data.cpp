// ============================================================
//  market_data.cpp — DỮ LIỆU THỊ TRƯỜNG THẬT
//
//  Nguồn (không cần khóa API):
//   • World Bank Open Data  → GDP, lạm phát, thất nghiệp, lãi suất (số liệu năm thật)
//       https://api.worldbank.org/v2/country/VNM/indicator/NY.GDP.MKTP.KD.ZG?format=json
//   • Yahoo Finance chart   → chỉ số, giá cổ phiếu, chuỗi 30 ngày, khối lượng
//       https://query1.finance.yahoo.com/v8/finance/chart/^GSPC?interval=1d&range=1mo
//
//  Không có mạng / không có curl / mã không tồn tại → simulated = true và `source`
//  ghi rõ lý do. TUYỆT ĐỐI không trộn số ngẫu nhiên vào dữ liệu thật.
//
//  Test offline: đặt RUNE_YAHOO_BASE / RUNE_WORLDBANK_BASE trỏ tới server giả lập.
// ============================================================
#include "market_data.h"

#include <algorithm>
#include <array>
#include <cctype>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <sstream>
#include <string>
#include <thread>
#include <unistd.h>
#include <vector>

namespace {

    /* ---------------- cấu hình theo quốc gia ---------------- */
    struct SymCfg { const char* yahoo; const char* show; const char* name; };
    struct CountryCfg {
        const char* code;         // VN/US/JP/CN/EU
        const char* wb;           // mã World Bank
        const char* index_name;
        std::vector<std::pair<const char*, const char*>> index_candidates;  // {yahoo, nhãn}
        std::vector<SymCfg> stocks;
    };

    const std::vector<CountryCfg>& configs() {
        static const std::vector<CountryCfg> C = {
            { "VN", "VNM", "VN-Index",
              { {"^VNINDEX", "VN-Index (HOSE)"}, {"VNM", "VanEck Vietnam ETF (đại diện thị trường VN)"} },
              { {"VIC.VN","VIC","Vingroup"}, {"VHM.VN","VHM","Vinhomes"}, {"VNM.VN","VNM","Vinamilk"},
                {"VCB.VN","VCB","Vietcombank"}, {"BID.VN","BID","BIDV"}, {"CTG.VN","CTG","VietinBank"},
                {"GAS.VN","GAS","PV Gas"}, {"FPT.VN","FPT","FPT Corp"}, {"MWG.VN","MWG","Thế Giới Di Động"},
                {"HPG.VN","HPG","Hòa Phát"}, {"MSN.VN","MSN","Masan"}, {"SSI.VN","SSI","SSI Securities"} } },

            { "US", "USA", "S&P 500",
              { {"^GSPC", "S&P 500"}, {"^DJI", "Dow Jones"}, {"^IXIC", "Nasdaq Composite"} },
              { {"AAPL","AAPL","Apple"}, {"MSFT","MSFT","Microsoft"}, {"GOOGL","GOOGL","Alphabet"},
                {"AMZN","AMZN","Amazon"}, {"NVDA","NVDA","NVIDIA"}, {"META","META","Meta"},
                {"TSLA","TSLA","Tesla"}, {"JPM","JPM","JPMorgan"}, {"V","V","Visa"}, {"WMT","WMT","Walmart"} } },

            { "JP", "JPN", "Nikkei 225",
              { {"^N225", "Nikkei 225"} },
              { {"7203.T","7203","Toyota"}, {"6758.T","6758","Sony"}, {"9984.T","9984","SoftBank Group"},
                {"6861.T","6861","Keyence"}, {"9432.T","9432","NTT"}, {"8306.T","8306","Mitsubishi UFJ"},
                {"6501.T","6501","Hitachi"}, {"4063.T","4063","Shin-Etsu"}, {"7974.T","7974","Nintendo"},
                {"6098.T","6098","Recruit"} } },

            { "CN", "CHN", "SSE Composite",
              { {"000001.SS", "SSE Composite (Thượng Hải)"}, {"399001.SZ", "SZSE Component (Thâm Quyến)"} },
              { {"600519.SS","600519","Kweichow Moutai"}, {"601318.SS","601318","Ping An"},
                {"600036.SS","600036","China Merchants Bank"}, {"000858.SZ","000858","Wuliangye"},
                {"601899.SS","601899","Zijin Mining"}, {"0700.HK","0700","Tencent"},
                {"9988.HK","9988","Alibaba"}, {"3690.HK","3690","Meituan"},
                {"1810.HK","1810","Xiaomi"}, {"0941.HK","0941","China Mobile"} } },

            { "EU", "EUU", "Euro Stoxx 50",
              { {"^STOXX50E", "Euro Stoxx 50"} },
              { {"SAP.DE","SAP","SAP"}, {"ASML.AS","ASML","ASML"}, {"SIE.DE","SIE","Siemens"},
                {"MC.PA","MC","LVMH"}, {"OR.PA","OR","L'Oréal"}, {"TTE.PA","TTE","TotalEnergies"},
                {"ENEL.MI","ENEL","Enel"}, {"IBE.MC","IBE","Iberdrola"}, {"SHEL.L","SHEL","Shell"},
                {"SAN.MC","SAN","Banco Santander"} } },
        };
        return C;
    }

    const CountryCfg* cfg_for(const std::string& c) {
        for (const auto& k : configs()) if (c == k.code) return &k;
        return nullptr;
    }

    /* ---------------- HTTP qua curl (không cần libcurl/TLS) ---------------- */
    std::string shell_quote(const std::string& s) {
        std::string o = "'";
        for (char c : s) { if (c == '\'') o += "'\\''"; else o += c; }
        return o + "'";
    }
    bool have_curl() {
        static int v = -1;
        if (v < 0) v = (access("/usr/bin/curl", X_OK) == 0 || std::system("command -v curl >/dev/null 2>&1") == 0) ? 1 : 0;
        return v == 1;
    }
    std::string url_encode(const std::string& s) {
        std::string o;
        for (unsigned char c : s) {
            if (std::isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') o += (char)c;
            else { static const char* h = "0123456789ABCDEF"; o += '%'; o += h[c >> 4]; o += h[c & 0xF]; }
        }
        return o;
    }
    std::string http_get(const std::string& url, int timeout_s = 12) {
        if (!have_curl()) return "";
        std::string cmd = "curl -sSL --compressed --max-time " + std::to_string(timeout_s) +
                          " -A " + shell_quote("RUNE/2.0 (local market data)") +
                          " -H " + shell_quote("Accept: application/json") +
                          " -- " + shell_quote(url) + " 2>/dev/null";
        FILE* p = popen(cmd.c_str(), "r");
        if (!p) return "";
        std::string out;
        std::array<char, 16384> buf{};
        const size_t MAX = 8u * 1024u * 1024u;
        while (out.size() < MAX) {
            size_t n = std::fread(buf.data(), 1, std::min(buf.size(), MAX - out.size()), p);
            if (!n) break;
            out.append(buf.data(), n);
        }
        pclose(p);
        return out;
    }
    std::string yahoo_base() {
        const char* e = getenv("RUNE_YAHOO_BASE");
        if (e && *e) return e;
        return "https://query1.finance.yahoo.com";
    }
    std::string wb_base() {
        const char* e = getenv("RUNE_WORLDBANK_BASE");
        if (e && *e) return e;
        return "https://api.worldbank.org";
    }

    /* ---------------- parse JSON tối giản (không cần thư viện) ---------------- */
    bool json_number(const std::string& j, const std::string& key, double& out, size_t from = 0) {
        std::string pat = "\"" + key + "\"";
        size_t p = j.find(pat, from);
        if (p == std::string::npos) return false;
        p = j.find(':', p + pat.size());
        if (p == std::string::npos) return false;
        p++;
        while (p < j.size() && std::isspace((unsigned char)j[p])) p++;
        if (j.compare(p, 4, "null") == 0) return false;
        char* end = nullptr;
        double v = std::strtod(j.c_str() + p, &end);
        if (end == j.c_str() + p) return false;
        out = v;
        return true;
    }
    bool json_string(const std::string& j, const std::string& key, std::string& out) {
        std::string pat = "\"" + key + "\"";
        size_t p = j.find(pat);
        if (p == std::string::npos) return false;
        p = j.find(':', p + pat.size());
        if (p == std::string::npos) return false;
        p++;
        while (p < j.size() && std::isspace((unsigned char)j[p])) p++;
        if (p >= j.size() || j[p] != '"') return false;
        p++;
        std::string r;
        while (p < j.size() && j[p] != '"') {
            if (j[p] == '\\' && p + 1 < j.size()) { r += j[p + 1]; p += 2; continue; }
            r += j[p++];
        }
        if (p >= j.size()) return false;
        out = r;
        return true;
    }
    // mảng số, "null" → NaN (giữ đúng vị trí để khớp với timestamp)
    bool json_number_array(const std::string& j, const std::string& key, std::vector<double>& out, size_t from = 0) {
        std::string pat = "\"" + key + "\"";
        size_t p = j.find(pat, from);
        if (p == std::string::npos) return false;
        p = j.find('[', p);
        if (p == std::string::npos) return false;
        size_t e = j.find(']', p);
        if (e == std::string::npos) return false;
        std::string body = j.substr(p + 1, e - p - 1);
        out.clear();
        std::stringstream ss(body);
        std::string tok;
        while (std::getline(ss, tok, ',')) {
            std::string t;
            for (char c : tok) if (!std::isspace((unsigned char)c)) t += c;
            if (t.empty()) continue;
            if (t == "null") out.push_back(std::nan(""));
            else out.push_back(std::strtod(t.c_str(), nullptr));
        }
        return true;
    }
    std::string json_string_escape(const std::string& s) {
        std::string o;
        for (unsigned char c : s) {
            if (c == '"') o += "\\\"";
            else if (c == '\\') o += "\\\\";
            else if (c == '\n') o += "\\n";
            else if (c < 0x20) { char b[8]; std::snprintf(b, sizeof(b), "\\u%04x", c); o += b; }
            else o += (char)c;
        }
        return o;
    }

    /* ---------------- Yahoo Finance ---------------- */
    struct Quote {
        bool ok = false;
        double price = 0, prev_close = 0, volume = 0;
        std::string symbol, currency;
        std::vector<uint64_t> ts;
        std::vector<double> close;
        std::string error;
    };
    Quote yahoo_quote(const std::string& symbol, const std::string& range = "1mo") {
        Quote q;
        q.symbol = symbol;
        std::string url = yahoo_base() + "/v8/finance/chart/" + url_encode(symbol) +
                          "?interval=1d&range=" + range + "&includePrePost=false&events=div%2Csplit";
        std::string body = http_get(url, 10);
        if (body.empty()) { q.error = have_curl() ? "không có phản hồi (mạng/chặn?)" : "máy không có curl"; return q; }
        if (body.find("\"error\"") != std::string::npos && body.find("\"result\":null") != std::string::npos) {
            std::string desc;
            json_string(body, "description", desc);
            q.error = desc.empty() ? "Yahoo trả về lỗi cho mã này" : desc;
            return q;
        }
        if (!json_number(body, "regularMarketPrice", q.price) || q.price <= 0) {
            // vài mã chỉ có chartPreviousClose / previousClose
            if (!json_number(body, "regularMarketPrice", q.price)) { q.error = "không đọc được giá (phản hồi lạ)"; return q; }
        }
        if (!json_number(body, "previousClose", q.prev_close)) json_number(body, "chartPreviousClose", q.prev_close);
        json_number(body, "regularMarketVolume", q.volume);
        json_string(body, "currency", q.currency);

        std::vector<double> tsd;
        if (json_number_array(body, "timestamp", tsd)) {
            for (double d : tsd) if (!std::isnan(d)) q.ts.push_back((uint64_t)d);
        }
        size_t ind = body.find("\"indicators\"");
        std::vector<double> cl;
        if (ind != std::string::npos && json_number_array(body, "close", cl, ind)) q.close = cl;
        if (q.volume <= 0 && ind != std::string::npos) {
            std::vector<double> vol;
            if (json_number_array(body, "volume", vol, ind))
                for (auto it = vol.rbegin(); it != vol.rend(); ++it) if (!std::isnan(*it) && *it > 0) { q.volume = *it; break; }
        }
        q.ok = true;
        return q;
    }

    /* ---------------- World Bank ---------------- */
    struct WbPoint { int year = 0; double value = 0; };
    //  Đọc giá trị chuỗi của một khóa JSON, bỏ qua khoảng trắng quanh ':' (API thật
    //  có thể trả về dạng gọn hoặc dạng có space) — không dùng thư viện JSON.
    bool json_raw_string(const std::string& j, size_t& pos, const std::string& key, std::string& out) {
        std::string pat = "\"" + key + "\"";
        size_t p = j.find(pat, pos);
        if (p == std::string::npos) return false;
        p += pat.size();
        while (p < j.size() && std::isspace((unsigned char)j[p])) p++;
        if (p >= j.size() || j[p] != ':') return false;
        p++;
        while (p < j.size() && std::isspace((unsigned char)j[p])) p++;
        if (p >= j.size() || j[p] != '"') { pos = p; return false; }
        size_t e = j.find('"', p + 1);
        if (e == std::string::npos) return false;
        out = j.substr(p + 1, e - p - 1);
        pos = e + 1;
        return true;
    }
    std::vector<WbPoint> wb_points(const std::string& j) {
        std::vector<WbPoint> pts;
        size_t pos = 0;
        std::string raw;
        while (json_raw_string(j, pos, "date", raw)) {
            int year = std::atoi(raw.c_str());
            //  "value" nằm ngay sau "date" trong mỗi phần tử của World Bank
            size_t v = j.find("\"value\"", pos);
            if (v != std::string::npos && v - pos < 500) {
                v += 7;
                while (v < j.size() && (std::isspace((unsigned char)j[v]) || j[v] == ':')) v++;
                if (j.compare(v, 4, "null") != 0) {
                    char* end = nullptr;
                    double d = std::strtod(j.c_str() + v, &end);
                    if (end != j.c_str() + v && year > 1900) pts.push_back({ year, d });
                }
            }
        }
        return pts;
    }
    bool wb_indicator(const std::string& iso, const std::string& indicator, WbPoint& best) {
        std::string url = wb_base() + "/v2/country/" + url_encode(iso) + "/indicator/" + url_encode(indicator) +
                          "?format=json&per_page=40&source=2&mrv=6";
        std::string body = http_get(url, 12);
        if (body.empty()) return false;
        auto pts = wb_points(body);
        if (pts.empty()) return false;
        best = *std::max_element(pts.begin(), pts.end(), [](const WbPoint& a, const WbPoint& b) { return a.year < b.year; });
        return true;
    }

    struct Econ { bool ok = false; double gdp = 0, cpi = 0, unemp = 0, rate = 0; int year = 0; std::string missing; };
    Econ fetch_econ(const std::string& iso) {
        Econ e;
        std::array<WbPoint, 4> p{};
        std::array<bool, 4> got{};
        const char* inds[4] = { "NY.GDP.MKTP.KD.ZG", "FP.CPI.TOTL.ZG", "SL.UEM.TOTL.ZS", "FR.INR.LEND" };
        const char* names[4] = { "GDP", "lạm phát", "thất nghiệp", "lãi suất" };
        std::vector<std::thread> ths;
        std::mutex m;
        for (int i = 0; i < 4; i++) {
            ths.emplace_back([&, i] {
                WbPoint pt;
                bool ok = wb_indicator(iso, inds[i], pt);
                std::lock_guard<std::mutex> lk(m);
                got[i] = ok; p[i] = pt;
            });
        }
        for (auto& t : ths) t.join();

        for (int i = 0; i < 4; i++) {
            if (!got[i]) { if (!e.missing.empty()) e.missing += ", "; e.missing += names[i]; continue; }
            switch (i) {
                case 0: e.gdp = p[i].value; break;
                case 1: e.cpi = p[i].value; break;
                case 2: e.unemp = p[i].value; break;
                case 3: e.rate = p[i].value; break;
            }
            e.year = std::max(e.year, p[i].year);
        }
        e.ok = got[0] || got[1] || got[2] || got[3];
        return e;
    }

    uint64_t now_s() { return (uint64_t)std::time(nullptr); }

} // namespace

/* ============================================================ */

MarketDataManager& MarketDataManager::instance() {
    static MarketDataManager inst;
    return inst;
}

bool MarketDataManager::is_stale(const MarketData& md, uint64_t now, uint64_t ttl) const {
    return md.last_updated == 0 || (now > md.last_updated && now - md.last_updated > ttl);
}

MarketData& MarketDataManager::ensure_entry(const std::string& country_code) {
    std::lock_guard<std::mutex> lk(mtx);
    auto it = cache.find(country_code);
    if (it == cache.end()) {
        MarketData md{};
        std::strncpy(md.indicator.country, country_code.c_str(), sizeof(md.indicator.country) - 1);
        md.simulated = true;
        md.source = "chưa lấy dữ liệu";
        it = cache.emplace(country_code, md).first;
    }
    return it->second;
}

/* Lấy dữ liệu THẬT; nếu thất bại thì ghi rõ lý do, không bịa số */
MarketData MarketDataManager::build(const std::string& country_code) {
    MarketData md{};
    std::strncpy(md.indicator.country, country_code.c_str(), sizeof(md.indicator.country) - 1);
    md.last_updated = now_s();

    const CountryCfg* cfg = cfg_for(country_code);
    if (!cfg) {
        md.simulated = true;
        md.source = "Không hỗ trợ quốc gia '" + country_code + "' (hỗ trợ: VN, US, JP, CN, EU)";
        std::strncpy(md.indicator.index_name, "N/A", sizeof(md.indicator.index_name) - 1);
        return md;
    }
    std::strncpy(md.indicator.index_name, cfg->index_name, sizeof(md.indicator.index_name) - 1);

    if (!have_curl()) {
        md.simulated = true;
        md.source = "Máy không có 'curl' nên backend không gọi được API thị trường";
        md.note = "Cài curl (sudo apt install curl) rồi chạy lại server để có giá thật.";
        return md;
    }

    /* --- 1. chỉ tiêu kinh tế (World Bank) --- */
    static std::map<std::string, std::pair<uint64_t, Econ>> econ_cache;
    static std::mutex econ_mtx;
    Econ econ;
    {
        std::lock_guard<std::mutex> lk(econ_mtx);
        auto it = econ_cache.find(cfg->wb);
        if (it != econ_cache.end() && now_s() - it->second.first < 6 * 3600) econ = it->second.second;
    }
    if (!econ.ok) {
        econ = fetch_econ(cfg->wb);
        if (econ.ok) { std::lock_guard<std::mutex> lk(econ_mtx); econ_cache[cfg->wb] = { now_s(), econ }; }
    }
    if (econ.ok) {
        md.indicator.gdp_growth = econ.gdp;
        md.indicator.inflation = econ.cpi;
        md.indicator.unemployment = econ.unemp;
        md.indicator.interest_rate = econ.rate;
        md.real_econ = true;
        md.econ_year = std::to_string(econ.year);
        if (!econ.missing.empty()) md.note = "World Bank thiếu số liệu: " + econ.missing;
    } else {
        md.note = "Không gọi được World Bank API (mạng bị chặn?)";
    }

    /* --- 2. chỉ số chính + chuỗi 30 ngày (Yahoo) --- */
    std::string idx_err;
    for (const auto& cand : cfg->index_candidates) {
        Quote q = yahoo_quote(cand.first, "1mo");
        if (!q.ok) { idx_err = q.error; continue; }
        md.index_symbol = cand.first;
        md.indicator.index_value = q.price;
        double prev = q.prev_close > 0 ? q.prev_close : q.price;
        md.indicator.index_change = q.price - prev;
        md.indicator.index_change_pct = prev > 0 ? (q.price - prev) / prev * 100.0 : 0.0;
        std::strncpy(md.indicator.index_name, cand.second, sizeof(md.indicator.index_name) - 1);
        md.currency = q.currency;
        md.real_index = true;
        md.simulated = false;
        for (size_t i = 0; i < q.ts.size() && i < q.close.size(); i++)
            if (!std::isnan(q.close[i])) md.chart_data.emplace_back(q.ts[i], q.close[i]);
        idx_err.clear();
        break;
    }
    if (!md.real_index) {
        md.simulated = true;
        if (!md.note.empty()) md.note += " · ";
        md.note += "Không lấy được chỉ số từ Yahoo Finance" + (idx_err.empty() ? "" : " (" + idx_err + ")");
    }

    /* --- 3. cổ phiếu (Yahoo, song song) --- */
    md.stocks_total = cfg->stocks.size();
    std::vector<Quote> quotes(cfg->stocks.size());
    {
        std::vector<std::thread> ths;
        size_t i = 0;
        for (const auto& s : cfg->stocks) {
            ths.emplace_back([&quotes, i, sym = std::string(s.yahoo)] { quotes[i] = yahoo_quote(sym, "5d"); });
            i++;
            if (ths.size() >= 6) { for (auto& t : ths) t.join(); ths.clear(); }   // tối đa 6 luồng
        }
        for (auto& t : ths) t.join();
    }
    std::string stock_err;
    for (size_t i = 0; i < cfg->stocks.size(); i++) {
        const Quote& q = quotes[i];
        if (!q.ok) {
            if (stock_err.empty()) stock_err = q.error;
            md.stock_errors.push_back(std::string(cfg->stocks[i].show) + " (" + cfg->stocks[i].name + "): " + q.error);
            continue;
        }
        Stock s{};
        std::strncpy(s.symbol, cfg->stocks[i].show, sizeof(s.symbol) - 1);
        std::strncpy(s.name, cfg->stocks[i].name, sizeof(s.name) - 1);
        s.price = q.price;
        double prev = q.prev_close > 0 ? q.prev_close : q.price;
        s.change = q.price - prev;
        s.change_pct = prev > 0 ? (q.price - prev) / prev * 100.0 : 0.0;
        s.volume = q.volume;
        md.stocks.push_back(s);
        md.stocks_ok++;
    }
    md.real_stocks = md.stocks_ok > 0;
    if (!md.real_stocks && !stock_err.empty()) {
        if (!md.note.empty()) md.note += " · ";
        md.note += "0/" + std::to_string(md.stocks_total) + " mã cổ phiếu lấy được (" + stock_err + ")";
    }

    /* --- nguồn --- */
    std::ostringstream src;
    src << (md.real_index ? "Yahoo Finance (giá thật, mã " + md.index_symbol + (md.currency.empty() ? "" : ", " + md.currency) + ")"
                          : "Không lấy được giá Yahoo")
        << " · " << (md.real_econ ? "World Bank (số liệu năm " + md.econ_year + ")" : "World Bank: không gọi được")
        << " · cổ phiếu thật: " << md.stocks_ok << "/" << md.stocks_total;
    md.source = src.str();
    return md;
}

void MarketDataManager::refresh_market(const std::string& country_code, bool force) {
    ensure_entry(country_code);
    {
        std::lock_guard<std::mutex> lk(mtx);
        auto& md = cache[country_code];
        if (!force && !is_stale(md, now_s(), 60)) return;
    }
    std::lock_guard<std::mutex> flk(fetch_mtx);
    {   // kiểm tra lại sau khi lấy khoá mạng (có thể luồng khác vừa cập nhật)
        std::lock_guard<std::mutex> lk(mtx);
        auto& md = cache[country_code];
        if (!force && !is_stale(md, now_s(), 60)) return;
    }
    MarketData fresh = build(country_code);
    std::lock_guard<std::mutex> lk(mtx);
    cache[country_code] = fresh;
}

const EconomicIndicator* MarketDataManager::get_economic(const std::string& country_code) {
    refresh_market(country_code);
    std::lock_guard<std::mutex> lk(mtx);
    return &cache[country_code].indicator;
}

size_t MarketDataManager::get_stocks(const std::string& country_code, Stock* out, size_t max) {
    refresh_market(country_code);
    std::lock_guard<std::mutex> lk(mtx);
    auto& md = cache[country_code];
    size_t n = std::min(max, md.stocks.size());
    if (n) std::memcpy(out, md.stocks.data(), n * sizeof(Stock));
    return n;
}

int MarketDataManager::get_chart(const std::string& symbol, uint64_t* timestamps, double* values, size_t* count) {
    if (!symbol.empty()) {
        // chuỗi thật cho 1 mã bất kỳ (không cache)
        Quote q = yahoo_quote(symbol, "1mo");
        size_t n = 0;
        for (size_t i = 0; i < q.ts.size() && i < q.close.size() && n < *count; i++) {
            if (std::isnan(q.close[i])) continue;
            timestamps[n] = q.ts[i];
            values[n] = q.close[i];
            n++;
        }
        *count = n;
        return q.ok ? 0 : 1;
    }
    std::lock_guard<std::mutex> lk(mtx);
    if (cache.empty()) { *count = 0; return 1; }
    auto& md = cache.begin()->second;
    size_t n = std::min(*count, md.chart_data.size());
    for (size_t i = 0; i < n; i++) { timestamps[i] = md.chart_data[i].first; values[i] = md.chart_data[i].second; }
    *count = n;
    return 0;
}

std::vector<std::pair<uint64_t, double>> MarketDataManager::chart_series(const std::string& country_code) {
    refresh_market(country_code);
    std::lock_guard<std::mutex> lk(mtx);
    return cache[country_code].chart_data;
}

std::string MarketDataManager::meta_json(const std::string& country_code) {
    refresh_market(country_code);
    std::lock_guard<std::mutex> lk(mtx);
    const MarketData& md = cache[country_code];
    std::ostringstream j;
    j << "{"
      << "\"country\":\"" << json_string_escape(country_code) << "\","
      << "\"source\":\"" << json_string_escape(md.source) << "\","
      << "\"note\":\"" << json_string_escape(md.note) << "\","
      << "\"index_symbol\":\"" << json_string_escape(md.index_symbol) << "\","
      << "\"currency\":\"" << json_string_escape(md.currency) << "\","
      << "\"econ_year\":\"" << json_string_escape(md.econ_year) << "\","
      << "\"real_index\":" << (md.real_index ? "true" : "false") << ","
      << "\"real_econ\":" << (md.real_econ ? "true" : "false") << ","
      << "\"real_stocks\":" << (md.real_stocks ? "true" : "false") << ","
      << "\"simulated\":" << (md.simulated ? "true" : "false") << ","
      << "\"stocks_ok\":" << md.stocks_ok << ","
      << "\"stocks_total\":" << md.stocks_total << ","
      << "\"chart_points\":" << md.chart_data.size() << ","
      << "\"curl\":" << (have_curl() ? "true" : "false") << ","
      << "\"fetched_at\":" << md.last_updated << ","
      << "\"stock_errors\":[";
    for (size_t i = 0; i < md.stock_errors.size(); i++)
        j << (i ? "," : "") << "\"" << json_string_escape(md.stock_errors[i]) << "\"";
    j << "]}" ;
    return j.str();
}

extern "C" {
    const EconomicIndicator* xkiro_get_economic_data(const char* country_code) {
        return MarketDataManager::instance().get_economic(country_code ? country_code : "VN");
    }
    size_t xkiro_get_stock_list(const char* country_code, Stock* out_stocks, size_t max_count) {
        return MarketDataManager::instance().get_stocks(country_code ? country_code : "VN", out_stocks, max_count);
    }
    int xkiro_get_chart_data(const char* symbol, uint64_t* timestamps, double* values, size_t* count) {
        return MarketDataManager::instance().get_chart(symbol ? symbol : "", timestamps, values, count);
    }
    const char* xkiro_market_meta(const char* country_code) {
        static thread_local std::string buf;
        buf = MarketDataManager::instance().meta_json(country_code ? country_code : "VN");
        return buf.c_str();
    }
}
