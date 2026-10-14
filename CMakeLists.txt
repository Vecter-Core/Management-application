cmake_minimum_required(VERSION 3.16)
project(xKiroManager CXX C)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Tối ưu hiệu năng
if(CMAKE_BUILD_TYPE STREQUAL "Release")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O3 -march=native")
endif()

# C++ backend sources
set(CPP_SOURCES
    src/cpp/main.cpp
    src/cpp/system_monitor.cpp
    src/cpp/market_data.cpp
    src/cpp/cli_runner.cpp
    src/cpp/key_manager.cpp
    src/cpp/web_scraper.cpp
    src/cpp/http_server.cpp
)

# Build thư viện tĩnh C++ để Rust gọi qua FFI
add_library(xkiro_backend STATIC ${CPP_SOURCES})
target_include_directories(xkiro_backend PUBLIC src/cpp)
target_link_libraries(xkiro_backend pthread)

# Build server độc lập chạy local
add_executable(xkiro_server src/cpp/server_main.cpp)
target_link_libraries(xkiro_server xkiro_backend)
