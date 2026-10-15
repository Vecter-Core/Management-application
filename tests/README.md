# Kiểm chứng "dữ liệu thật" (không mô phỏng)

Ba script Node kiểm tra tự động rằng giao diện hiển thị **số liệu đo thật từ máy** và
**API thị trường thật**, chứ không phải giá trị bịa.

## Chuẩn bị (một lần)

```bash
cd tests
npm install jsdom        # chỉ cần jsdom, không có phụ thuộc nào khác
```

## Chạy backend C++ trước

```bash
cd ..            # về thư mục gốc repo
./build.sh       # hoặc: make
RUNE_PORT=8096 ./build/rune_server
```

## 1. `realcheck.js` — 25 khẳng định trên UI thật

Nạp `index.html` + `core.js` + `app.js` trong jsdom, trỏ `fetch` vào backend C++ **đang chạy**,
chờ app tự quét rồi đối chiếu DOM:

```bash
BASE=http://127.0.0.1:8096/ node tests/realcheck.js
```

Kiểm tra: tiến trình thật từ `/proc` (không còn `chrome.exe`/`miner.exe` giả), kết nối thật,
12+ mục quét bảo mật kèm *nguồn kiểm tra*, điểm sức khỏe tính từ kết quả thật (không phải `87` cứng),
IP local từ `getifaddrs`, ping TCP thật, báo cáo tối ưu thật, thị trường **hoặc** giá thật
**hoặc** `—` kèm lý do, không nút chết, không lỗi JS.

## 2. `toolcheck.js` — 5 công cụ AI trả dữ liệu thật

```bash
BASE=http://127.0.0.1:8096/ node tests/toolcheck.js
```

In JSON thật của `get_system_info`, `get_market_data`, `show_health`, `optimize_system`,
`kill_process` (gọi với tên tiến trình không tồn tại → phải **báo lỗi thật**, không giả vờ đã tắt).

## 3. `idcheck.js` — không có phần tử "ma"

```bash
node tests/idcheck.js
```

Đối chiếu mọi `#id` mà JS tham chiếu với `index.html` (kể cả id do JS tự tạo), và liệt kê
`Math.random` còn sót — chỉ được dùng cho **id nội bộ** và **hiệu ứng sáng tạo**
(hạt phim, nhiễu trắng, snare/hi-hat), không được dùng để sinh số liệu.

## Kiểm thử API thị trường khi không có mạng

`market_data.cpp` đọc hai biến môi trường để trỏ tới nguồn dữ liệu khác (dùng để test bộ phân tích
JSON với đúng định dạng Yahoo/World Bank mà không cần Internet):

```bash
RUNE_YAHOO_BASE=http://127.0.0.1:8098/yahoo \
RUNE_WORLDBANK_BASE=http://127.0.0.1:8098/wb \
RUNE_IPINFO_URL=http://127.0.0.1:8098/ip \
RUNE_PORT=8097 ./build/rune_server
```

Khi không gọi được API thật, `/api/market` trả `simulated:true`, `note` nêu lý do và
`stock_errors` liệt kê từng mã không lấy được — **không có giá trị tĩnh nào được trộn vào**.
