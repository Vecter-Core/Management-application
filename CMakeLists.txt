cmake_minimum_required(VERSION 3.16)
project(RuneManager CXX C)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# Tối ưu hiệu năng (bỏ -march=native để binary chạy được trên máy khác)
set(CMAKE_CXX_FLAGS_RELEASE "-O2")

find_package(Threads REQUIRED)

# ---- thư viện C++ (Rust gọi qua FFI: xem src/rust/lib.rs) ----
set(CPP_SOURCES
    src/cpp/system_monitor.cpp
    src/cpp/market_data.cpp
    src/cpp/cli_runner.cpp
    src/cpp/key_manager.cpp
    src/cpp/web_scraper.cpp
)

add_library(xkiro_backend STATIC ${CPP_SOURCES})
target_include_directories(xkiro_backend PUBLIC src/cpp)
target_link_libraries(xkiro_backend PUBLIC Threads::Threads)

# ---- server HTTP local (phục vụ public/ + /api/*) ----
add_executable(rune_server src/cpp/server_main.cpp)
target_link_libraries(rune_server PRIVATE xkiro_backend Threads::Threads)

# Giữ tên cũ để script/tài liệu cũ không gãy
add_executable(xkiro_server src/cpp/server_main.cpp)
target_link_libraries(xkiro_server PRIVATE xkiro_backend Threads::Threads)

install(TARGETS rune_server RUNTIME DESTINATION bin)

message(STATUS "RUNE: build xong thì chạy  ./rune_server  (mặc định http://localhost:8080)")
