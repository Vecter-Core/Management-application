#!/bin/bash
set -e

echo "========================================"
echo " Building xKiro Manager"
echo " C++20 Backend + Rust Tauri App"
echo "========================================"

# Build C++ backend trước
echo "[1/3] Build C++ backend..."
mkdir -p build
cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)
cd ..

echo "[2/3] C++ server binary: build/xkiro_server"
ls -la build/

# Hướng dẫn build Rust Tauri app
echo ""
echo "[3/3] Để build ứng dụng desktop bằng Rust:"
echo "  1. Cài đặt Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
echo "  2. Cài đặt Tauri CLI: cargo install tauri-cli"
echo "  3. Build: cd src-tauri && cargo tauri build"
echo ""
echo "Chạy server C++ local: ./build/xkiro_server"
echo "Mở trình duyệt vào http://localhost:8080"
