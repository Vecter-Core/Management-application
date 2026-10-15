# ============================================================
#  RUNE / xKiro — Makefile (không cần cmake)
#
#   make            → build build/rune_server
#   make run        → build rồi chạy server (http://localhost:8080)
#   make lib        → build thư viện tĩnh build/libxkiro_backend.a (cho Rust FFI)
#   make web        → chỉ chạy giao diện bằng server tĩnh (python3)
#   make test       → gọi thử các API của server
#   make clean
# ============================================================

CXX      ?= g++
CXXFLAGS ?= -std=c++20 -O2 -pthread -Wall -Wextra -Wno-unused-parameter
INCLUDES := -Isrc/cpp
PORT     ?= 8080
BIND     ?= 127.0.0.1

LIB_SRC  := src/cpp/system_monitor.cpp \
            src/cpp/market_data.cpp \
            src/cpp/cli_runner.cpp \
            src/cpp/key_manager.cpp \
            src/cpp/web_scraper.cpp
LIB_OBJ  := $(LIB_SRC:.cpp=.o)
SERVER   := build/rune_server
STATIC   := build/libxkiro_backend.a

.PHONY: all run lib web test clean help

all: $(SERVER)

help:
	@echo "make          build server C++ -> $(SERVER)"
	@echo "make run      build + chạy server tại http://localhost:$(PORT)"
	@echo "make lib      build $(STATIC) cho Rust FFI"
	@echo "make web      phục vụ giao diện bằng python3 (không có API C++)"
	@echo "make test     kiểm tra nhanh các API"
	@echo "make clean    xóa file build"

$(SERVER): src/cpp/server_main.cpp $(LIB_SRC) | build
	$(CXX) $(CXXFLAGS) $(INCLUDES) src/cpp/server_main.cpp $(LIB_SRC) -o $@
	@echo "✔ Đã build xong: $@"
	@echo "  Chạy:  ./$(SERVER)   (hoặc: make run)"

build:
	@mkdir -p build

%.o: %.cpp
	$(CXX) $(CXXFLAGS) $(INCLUDES) -c $< -o $@

lib: $(STATIC)

$(STATIC): $(LIB_OBJ) | build
	ar rcs $@ $(LIB_OBJ)
	@echo "✔ Thư viện tĩnh: $@"

run: $(SERVER)
	RUNE_PORT=$(PORT) RUNE_BIND=$(BIND) ./$(SERVER)

web:
	@echo "Phục vụ giao diện tĩnh tại http://localhost:$(PORT) (không có /api/cli)"
	cd public && python3 -m http.server $(PORT) --bind 0.0.0.0

test: $(SERVER)
	@RUNE_PORT=$(PORT) RUNE_BIND=$(BIND) ./$(SERVER) & sleep 1; \
	echo "--- /api/health";   curl -s http://127.0.0.1:$(PORT)/api/health; echo; \
	echo "--- /api/system";   curl -s http://127.0.0.1:$(PORT)/api/system | head -c 300; echo; \
	echo "--- /api/market";   curl -s "http://127.0.0.1:$(PORT)/api/market?country=VN" | head -c 200; echo; \
	echo "--- /api/cli";      curl -s -X POST http://127.0.0.1:$(PORT)/api/cli -H 'Content-Type: application/json' -d '{"command":"uname -a","timeout":5}'; echo; \
	echo "--- giao diện";     curl -s -o /dev/null -w "index.html %{http_code}\n" http://127.0.0.1:$(PORT)/; \
	pkill -f rune_server

clean:
	rm -rf build $(LIB_OBJ)
