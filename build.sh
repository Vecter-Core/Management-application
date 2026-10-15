#!/usr/bin/env bash
# ============================================================
#  Build RUNE / xKiro backend C++
#  Ưu tiên cmake; nếu máy chưa có cmake thì biên dịch trực tiếp bằng g++.
# ============================================================
set -e
cd "$(dirname "$0")"

CXX=${CXX:-g++}
PORT=${RUNE_PORT:-8080}

echo "=========================================="
echo " RUNE Local Control Center — build backend"
echo " C++20 · không cần thư viện ngoài"
echo "=========================================="

if ! command -v "$CXX" >/dev/null 2>&1; then
    echo "✘ Không tìm thấy $CXX. Cài trước:  sudo apt install build-essential"
    exit 1
fi

mkdir -p build

if command -v cmake >/dev/null 2>&1 && command -v make >/dev/null 2>&1; then
    echo "[1/2] Build bằng cmake…"
    cmake -B build -DCMAKE_BUILD_TYPE=Release >/dev/null
    cmake --build build -j"$(nproc 2>/dev/null || echo 2)"
    BIN=build/rune_server
    [ -x "$BIN" ] || BIN=build/xkiro_server
else
    echo "[1/2] Không có cmake — build trực tiếp bằng $CXX…"
    $CXX -std=c++20 -O2 -pthread -Isrc/cpp \
        src/cpp/server_main.cpp \
        src/cpp/system_monitor.cpp \
        src/cpp/market_data.cpp \
        src/cpp/cli_runner.cpp \
        src/cpp/key_manager.cpp \
        src/cpp/web_scraper.cpp \
        -o build/rune_server
    BIN=build/rune_server
fi

echo "[2/2] Xong: $BIN"
echo ""
echo "Chạy server (giao diện + API thật):"
echo "  ./$BIN                      → http://localhost:$PORT"
echo "  RUNE_PORT=9000 ./$BIN       → đổi cổng"
echo "  RUNE_BIND=0.0.0.0 ./$BIN    → cho máy khác truy cập (khi đó /api/cli bị tắt,"
echo "                                 bật lại bằng RUNE_ALLOW_CLI=1 nếu bạn chấp nhận rủi ro)"
echo ""
echo "Chỉ muốn xem giao diện, không cần backend C++:"
echo "  cd public && python3 -m http.server $PORT"
echo ""
echo "Ứng dụng desktop (Rust/Tauri, tùy chọn):"
echo "  make lib        # tạo build/libxkiro_backend.a cho FFI"
echo "  cargo build     # cần Rust toolchain"
