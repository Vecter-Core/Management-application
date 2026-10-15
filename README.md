# ✨ RUNE — Local Control Center

> **Trung tâm điều khiển tất cả trong một, chạy local trên máy bạn.**
> Backend **C++20 native** (HTTP server + giám sát hệ thống + chạy lệnh thật), giao diện Glassmorphism 4D,
> **AI kết nối thật** tới nhà cung cấp bạn chọn (streaming + tự gọi 20 công cụ), và **12 ứng dụng Creative** mà mọi nút bấm đều dùng được.

![Engine](https://img.shields.io/badge/Engine-C%2B%2B20%20%7C%20Vanilla%20JS-8b5cf6?style=for-the-badge)
![AI](https://img.shields.io/badge/AI-Streaming%20%2B%2020%20Tools-06b6d4?style=for-the-badge)
![Creative](https://img.shields.io/badge/Creative-12%20Apps-f59e0b?style=for-the-badge)
![Offline](https://img.shields.io/badge/Vendor-Offline%20libs-34d399?style=for-the-badge)

---

## 🚀 Chạy ngay

**Cách 1 — đầy đủ (giao diện + API C++ thật, khuyến nghị):**

```bash
./build.sh          # hoặc: make        (cần g++; cmake không bắt buộc)
./build/rune_server # mặc định http://localhost:8080
```

**Cách 2 — chỉ giao diện (không cần biên dịch):**

```bash
cd public && python3 -m http.server 8080
```

Mở `http://localhost:8080`. Với Cách 2, các API `/api/*` không tồn tại → dashboard tự chuyển sang
**chế độ trình duyệt (mô phỏng)** và xTerminal dùng **shell ảo**; app vẫn chạy đầy đủ, có nhãn ghi rõ nguồn dữ liệu.

> **AI Chat cần khóa API.** Vào trang **🔑 Khóa** (hoặc nút *Nhập khóa AI* ngay trong khung chat) và dán khóa của
> OpenAI / Anthropic / Gemini / Groq / DeepSeek / OpenRouter / endpoint tùy chỉnh.

---

## 🔑 1. Khóa API — đúng MỘT nơi duy nhất

Trang **Khóa** là chỗ duy nhất để nhập khóa, cho cả app lẫn 12 ứng dụng Creative (dùng chung một kho):

- **Khóa AI (1 bộ duy nhất):** nhà cung cấp → khóa → model → nhiệt độ → base URL tùy chỉnh → *Kiểm tra khóa* → *Lưu*.
- **Các khóa khác (cùng trang):** Alpha Vantage, Tavily, Stable Diffusion, OpenWeather, ElevenLabs + **thêm khóa tùy chỉnh** không giới hạn.
- Khóa hiển thị dạng che (`sk-a••••••wxyz`), có nút hiện/ẩn, xóa từng khóa.
- Lưu ở `localStorage` khóa `rune.keys.v2` (có tự di trú từ phiên bản cũ); **không** gửi đi đâu ngoài nhà cung cấp bạn chọn.
- Backend C++ cũng có kho khóa riêng tại `~/.config/xkiro/keys.json` qua `GET/POST/DELETE /api/keys` — độc lập với trình duyệt.

Trong từng app Creative, nếu chưa có khóa AI, hộp thoại cho phép **nhập khóa ngay tại chỗ** và nó ghi vào cùng một kho đó.

---

## 🤖 2. AI Chat — kết nối thật, không còn trả lời giả

`public/core.js` → `RuneAI` gọi thẳng HTTP tới nhà cung cấp:

| Nhà cung cấp | Endpoint | Kiểu |
|---|---|---|
| OpenAI (GPT) | `POST /v1/chat/completions` | OpenAI-compatible, SSE streaming |
| Anthropic (Claude) | `POST /v1/messages` | `anthropic-dangerous-direct-browser-access`, SSE |
| Google Gemini | `POST /v1beta/models/{model}:streamGenerateContent` | `functionCall` / `functionResponse` |
| Groq, DeepSeek, OpenRouter | OpenAI-compatible | SSE |
| Endpoint tùy chỉnh | base URL bạn nhập | OpenAI-compatible |

- **Streaming token thật** (chữ hiện dần), có nút **■ Dừng**.
- **Tool calling vòng lặp tối đa 8 lượt**: AI tự gọi công cụ → RUNE thực thi → trả kết quả → AI nói tiếp.
- **20 công cụ** AI có thể tự gọi:

| Công cụ | Nói gì để gọi |
|---|---|
| `get_system_info` | *"CPU đang bao nhiêu %?"* |
| `get_market_data` | *"VN-Index hôm nay thế nào?"* |
| `open_app` / `control_app` / `list_app_commands` | *"mở app sửa ảnh rồi làm ảnh đen trắng"* |
| `run_cli` | *"chạy `ls -la`"* (qua `/api/cli` của backend C++) |
| `web_search` / `fetch_url` | *"tìm và đọc trang này giúp tôi"* |
| `create_automation` | *"tạo quy trình báo cáo 9h sáng"* |
| `save_api_key` / `list_api_keys` | *"lưu khóa tavily là tvly-…"* |
| `apply_photo_filter` / `edit_video` | *"áp filter vintage vào ảnh đang mở"* |
| `navigate_to` / `get_time` / `calculate` | *"vào trang cài đặt"*, *"tính 15% của 2.4 triệu"* |
| `show_health` / `optimize_system` / `kill_process` | *"máy có khỏe không?"*, *"đóng tiến trình X"* |
| `write_note` | *"ghi chú lại rồi mở xDocs"* |

- Lỗi được dịch ra tiếng người (`humanError`): thiếu khóa, sai khóa, hết hạn mức, model không tồn tại, CORS, mạng…
- **Chế độ dự phòng offline:** nếu chưa có khóa/mất mạng, chat vẫn trả lời bằng engine cục bộ và **ghi rõ** đây là phản hồi mô phỏng.

---

## 🎨 3. Trung tâm Sáng tạo — 12 app, nút nào cũng bấm được

Mỗi app là một trang độc lập trong `public/tools/`, dùng chung `toolkit.js` (`TK`):
mọi phần tử có `data-action` đều được gắn handler khi `TK.init()` chạy — **không có nút trang trí**.

| App | File | Làm được gì |
|---|---|---|
| **xPhoto** (Photoshop) | `image-editor.*` | layer, brush/tẩy/màu, crop, xoay/lật, resize, bộ lọc **nướng vào pixel thật** (xuất ra vẫn giữ), text, undo/redo, xuất PNG/JPG + project JSON |
| **xLight** (Lightroom) | `lightroom.*` | histogram, Basic/Tone Curve/HSL, sharpen/noise, preset, so sánh Before/After, filmstrip, sách ảnh, trình chiếu, in, web gallery |
| **xCut** (Premiere) | `video-editor.*` | timeline đa track, cắt/tách/tốc độ/âm lượng, text overlay, transition, xuất video bằng MediaRecorder (thời gian thực, có % tiến độ), tách frame |
| **xFX** (After Effects) | `after-effects.*` | comp, layer, **keyframe thật** (position/scale/opacity/rotate/màu), graph easing, preview rAF, render ra video |
| **xVector** (Illustrator) | `illustrator.*` | pen/bezier, shape, stroke→path, group, align, text, gradient, xuất SVG/PNG |
| **xLayout** (InDesign) | `indesign.*` | trang master, paragraph/character style, khung text/ảnh, margin-guide, mục lục, in, xuất HTML/TXT |
| **xPrototype** (XD/Figma) | `xd.*` | artboard, component, flow liên kết màn hình, prototype chạy thật, preview mobile/desktop, xuất file HTML độc lập |
| **xAudio** (Audition) | `audio.*` | waveform + phổ, thu âm, cắt/sao/dán, fade, normalize, khử ồn, EQ/reverb/delay/distort/compress, generator (tone/noise/sweep/beat), multitrack mix, xuất WAV |
| **xDocs** (Word) | `docs.*` | ribbon đầy đủ (font/màu/align/list/bảng/ảnh/link/footnote/mục lục), đếm từ, tìm & thay thế, lịch sử, xuất HTML/MD/TXT/DOC, in |
| **xPDF** (Acrobat) | `pdf.html` + `xpdf.js` | đọc PDF bằng **PDF.js offline**, chú thích (vẽ/chữ/mũi tên/đóng dấu), **ký tên** (nhúng ảnh chữ ký vào PDF thật bằng pdf-lib + font DejaVu tiếng Việt), xoay/tách/xóa/trộn trang, trích text, tìm kiếm, xuất PNG trang, tạo PDF mới từ text/ảnh |
| **xCalc** | `calc.html` + `calc.js` | parser tự viết (**không dùng `eval`**): `!`, `^`, ẩn phép nhân, `\|x\|`, hàm lượng giác/hyperbolic, DEG⇄RAD; **vẽ đồ thị** (pan/zoom, crosshair, bảng giá trị); **phân tích**: nghiệm, đạo hàm, tích phân Simpson; đổi đơn vị 12 nhóm (có sào/mẫu/lượng/cân); đổi cơ số + toán bit 32-bit; %/GCD-BCNN/số nguyên tố/phân tích thừa số/phương trình bậc 2/thống kê/làm tròn/số ngẫu nhiên; công cụ ngày (khoảng cách, cộng/trừ, ngày làm việc, tuần ISO) + đồng hồ bấm giờ có lap; bộ nhớ MC/MR/M+/M−, `ANS`, lịch sử, hằng số |
| **xTerminal** | `terminal.*` | **backend C++ sống → gửi `POST /api/cli`, chạy lệnh thật trên máy**; không có backend → **shell ảo** với hệ thống file riêng (lưu `localStorage`) và 40+ lệnh chạy thật: `ls cd pwd cat echo write append touch mkdir rm rmdir mv cp tree head tail wc grep find du df clear history whoami hostname date uptime uname env free ps calc apps open key theme font fetch api ping sudo save export reboot exit help man sysinfo neofetch ai`. Có màu ANSI, tự hoàn thành bằng **Tab**, lịch sử **↑/↓**, tìm ngược **Ctrl+R**, xóa **Ctrl+L**, AI gợi ý lệnh/giải thích/sửa lỗi, tải nhật ký phiên |

Mỗi app còn mở **lệnh điều khiển cho AI** (`TK.cmd`) — nên bạn có thể bảo AI trong Chat:
*"mở xPDF rồi tóm tắt tài liệu"*, *"vẽ đồ thị sin(x)/x trong xCalc"*, *"chạy `df -h` trong terminal"*.

---

## 🏗️ Kiến trúc

```
Management-application/
├── src/cpp/                     # Backend C++20 (không phụ thuộc thư viện ngoài)
│   ├── server_main.cpp          # HTTP server: static + /api/* (body Content-Length, OPTIONS, mã trạng thái thật)
│   ├── system_monitor.cpp       # CPU/RAM/GPU/disk/net từ /proc, sysinfo, statvfs, nvidia-smi
│   ├── market_data.cpp          # chỉ số + cổ phiếu theo quốc gia (mô hình hoá, ghi rõ nguồn)
│   ├── cli_runner.cpp           # thực thi lệnh bất đồng bộ (FFI/streaming)
│   ├── key_manager.cpp          # kho khóa ~/.config/xkiro/keys.json (JSON tự viết, chmod 600)
│   ├── web_scraper.cpp          # xkiro_web_fetch / web_search / free_string (qua curl)
│   └── xkiro.h                  # header FFI
├── src/rust/lib.rs              # Rust FFI bindings (Tauri desktop)
├── public/
│   ├── index.html               # shell 6 trang
│   ├── style.css                # giao diện glass 4D
│   ├── core.js                  # RuneKeys · RuneAI · RuneNet · RuneUI
│   ├── app.js                   # điều phối, AI tool-loop, bridge tới app
│   ├── tools/                   # 12 app Creative + toolkit.js
│   └── vendor/                  # thư viện offline (PDF.js, pdf-lib, fontkit, font DejaVu) + README nguồn gốc
├── Makefile                     # make / make run / make lib / make test
├── CMakeLists.txt               # build bằng cmake (nếu có)
├── build.sh                     # cmake nếu có, không thì g++ trực tiếp
└── README.md
```

### API của backend C++

| Method | Đường dẫn | Trả về |
|---|---|---|
| `GET` | `/api/health` | trạng thái server, uptime, `cli_enabled`, thư mục public |
| `GET` | `/api/system` | CPU %, nhiệt độ, tên CPU/GPU, VRAM, RAM, **`disk_total/disk_used/disk_free`**, disk I/O, net I/O, `"simulated":false` |
| `GET` | `/api/market?country=VN` | chỉ số kinh tế + bảng cổ phiếu (`VN/US/JP/CN/EU`) |
| `GET` | `/api/keys[?service=x&reveal=1]` | danh sách khóa (mặc định đã che) |
| `POST` | `/api/keys` `{"service","key"}` | lưu khóa (key rỗng = xóa) |
| `DELETE` | `/api/keys?service=x` | xóa khóa |
| `POST` | `/api/cli` `{"command","cwd","timeout"}` | chạy lệnh **thật**, trả `output`, `exit_code`, `ms`, `timed_out` |
| `GET` | `/*` | file tĩnh trong `public/` (chặn vượt thư mục, SPA fallback) |

Có `OPTIONS` (CORS preflight), `HEAD`, mã trạng thái đúng (400/403/404/405/413/500/501).

### 🔒 Ghi chú an toàn

- Server mặc định chỉ nghe **`127.0.0.1`**. `/api/cli` chỉ bật ở chế độ loopback.
- Nếu chạy `RUNE_BIND=0.0.0.0` (mở ra mạng LAN), `/api/cli` **tự tắt**; muốn bật phải `RUNE_ALLOW_CLI=1`
  (lúc đó bất kỳ ai trong mạng cũng chạy được lệnh trên máy bạn — chỉ dùng khi bạn hiểu rõ rủi ro).
- Lệnh chạy qua `sh -c` có timeout (`/usr/bin/timeout` nếu có), output cắt ở 512 KB.
- Đường dẫn tĩnh được chuẩn hoá và kiểm tra nằm trong `public/` → `../` bị chặn (403).
- Khóa AI trong trình duyệt chỉ ở `localStorage`; khóa phía backend ở `~/.config/xkiro/keys.json` với quyền `600`.

---

## 📦 Thư viện offline trong `public/vendor/`

App **không phụ thuộc CDN** cho các chức năng nặng (CDN chỉ dùng cho Chart.js ở trang dashboard).

| File | Thư viện | Phiên bản | License |
|---|---|---|---|
| `pdf.min.js`, `pdf.worker.min.js` | PDF.js (legacy build, global `pdfjsLib`) | 3.11.174 | Apache-2.0 |
| `pdf-lib.min.js` | pdf-lib (global `PDFLib`) | 1.17.1 | MIT |
| `pdf-lib-fontkit.umd.min.js` | @pdf-lib/fontkit (global `fontkit`) — **bắt buộc** để nhúng font TTF | 1.1.1 | MIT |
| `DejaVuSans.ttf`, `DejaVuSans-Bold.ttf` | DejaVu (hỗ trợ dấu tiếng Việt — Helvetica của PDF không encode được) | 2.37 | license tự do của DejaVu |

Chi tiết + cách nâng cấp: [`public/vendor/README.md`](public/vendor/README.md). **Không sửa tay các file này** — muốn đổi phiên bản thì tải lại.

---

## ✅ Trung thực về dữ liệu: cái gì thật, cái gì mô phỏng

| Thành phần | Trạng thái |
|---|---|
| AI Chat (khi có khóa) | **Thật** — gọi API nhà cung cấp, streaming, tool calling |
| CPU/RAM/disk/net (khi chạy backend C++) | **Thật** — đọc `/proc`, `sysinfo`, `statvfs` |
| Dashboard khi KHÔNG có backend | Mô phỏng — UI gắn nhãn *"○ Chế độ trình duyệt: dữ liệu mô phỏng"* |
| Chạy lệnh CLI (`/api/cli`) | **Thật** khi backend sống; xTerminal tự rơi về shell ảo và nói rõ |
| 12 app Creative | **Thật** — xử lý ảnh/audio/video/PDF ngay trong trình duyệt bằng API web chuẩn |
| Xuất video (xCut/xFX) | **Thật** nhưng theo thời gian thực (MediaRecorder) — video 30s thì xuất ~30s |
| Số liệu thị trường `/api/market` | Mô hình hoá theo quốc gia trong `market_data.cpp`, chuỗi `source` ghi rõ |
| Ping ở dashboard | Chưa đo → hiện `—` (không bịa số) |

Đã kiểm bằng harness (nạp từng app trong môi trường DOM giả lập, đối chiếu mọi `data-action`
với handler đã đăng ký): **12/12 app không còn nút chết**, không lỗi cú pháp, không id thiếu.

---

## 🔨 Build & phát triển

```bash
make            # build build/rune_server (g++, không cần cmake)
make run        # build + chạy tại http://localhost:8080
make lib        # build build/libxkiro_backend.a cho Rust FFI
make test       # smoke-test các API
./build.sh      # tự chọn cmake hoặc g++
cmake -B build && cmake --build build    # nếu bạn thích cmake

RUNE_PORT=9000 RUNE_BIND=0.0.0.0 ./build/rune_server   # đổi cổng / mở ra LAN
```

Bản desktop Rust/Tauri: `make lib` rồi `cargo build` (cần Rust toolchain; binding FFI ở `src/rust/lib.rs`).

---

## 🎮 Điều khiển nhanh

- **Sidebar**: 6 trang (Tổng quan · AI Chat · Khóa · Sáng tạo · Cài đặt · Tự động hóa).
- **AI Chat**: gõ yêu cầu tự nhiên — AI tự chọn công cụ; **■ Dừng** để ngắt; chip khóa để nhập key ngay.
- **Creative**: mở app trong cửa sổ riêng (phóng to / thu nhỏ / tải lại / mở tab mới), AI điều khiển được app qua bridge.
- **Automation**: 8 kịch bản bật/tắt + Flow Builder kéo thả + *tạo bằng lời nói với AI* + nhật ký hoạt động.

---

**RUNE v2.0 — 4D Edition** · Made in Vietnam 🇻🇳
