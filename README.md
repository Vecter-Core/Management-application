# ✨ RUNE — Local Control Center

> **Trung tâm điều khiển tất cả trong một chạy local trên máy bạn.**
> Backend hiệu năng cao bằng **C++20 Native**, vỏ ứng dụng desktop bằng **Rust Tauri**, giao diện Glassmorphism 4D tương lai, **AI có thể thực sự thực hiện công việc** chứ không chỉ trả lời.

![Rune Logo](https://img.shields.io/badge/Engine-C%2B%2B20%20%7C%20Rust-8b5cf6?style=for-the-badge)
![UI](https://img.shields.io/badge/UI-Glassmorphism%204D-ec4899?style=for-the-badge)
![AI](https://img.shields.io/badge/AI-Tool%20Calling-06b6d4?style=for-the-badge)
![Creative](https://img.shields.io/badge/Creative-12%20Apps-f59e0b?style=for-the-badge)

---

## 🚀 Chạy ngay lập tức

```bash
cd public
python3 -m http.server 8080
```

Mở trình duyệt vào `http://localhost:8080` là dùng được ngay.

Để build thành ứng dụng desktop `.exe`/`.app` native: xem hướng dẫn ở mục [Build bản desktop](#-build-thành-ứng-dụng-desktop-native).

---

## 🧭 Tổng quan 6 trang tính năng

### 1. 📊 Tổng quan (Dashboard)
Giám sát mọi thứ thời gian thực:
- **Kinh tế & Chứng khoán realtime**: Chuyển đổi quốc gia 🇻🇳 Việt Nam / 🇺🇸 Mỹ / 🇯🇵 Nhật / 🇨🇳 Trung Quốc / 🇪🇺 Châu Âu
  - Chỉ số chính (VN-Index/S&P 500/Nikkei/...), % thay đổi realtime
  - GDP, Lạm phát, Thất nghiệp, Lãi suất
  - Bảng giá cổ phiếu từng nước
  - Biểu đồ đường 30 ngày trực quan
- **Giám sát phần cứng**: Tên CPU/GPU, % sử dụng, nhiệt độ, RAM, Disk I/O realtime cập nhật mỗi giây, progress bar có hiệu ứng ánh sáng chạy
- **Thông tin mạng**: Trạng thái kết nối, ping, IP, tốc độ Download/Upload realtime, biểu đồ live, danh sách kết nối TCP/UDP đang mở, **cảnh báo kết nối đáng ngờ** màu đỏ nhấp nháy
- **Bảo mật & Sức khỏe máy**: Điểm đánh giá tổng thể Health Score 0-100, tường lửa, Antivirus, cập nhật hệ thống, mã hóa BitLocker, nhiệt độ, SMART ổ đĩa, phát hiện kết nối độc hại, cảnh báo tiến trình đào coin ngầm
- **Task Manager**: Bảng tiến trình đang chạy, CPU/RAM/Disk/Network từng tiến trình, độ tin cậy/chữ ký số, nút tắt tiến trình một click

### 2. 🤖 AI Chat — Tool-Using AI
AI **thực sự làm việc**, không chỉ trả lời. Giao tiếp tự nhiên bằng tiếng Việt, AI sẽ:
- Hiểu ý định của bạn
- Lập kế hoạch thực hiện nhiều bước
- Thực thi từng tool và báo tiến độ realtime
- Trả về kết quả cuối cùng
- Đề xuất hành động tiếp theo

**15 công cụ AI có thể tự động gọi:**
| Icon | Công cụ | Ví dụ nói gì để gọi |
|---|---|---|
| 💻 | Đọc thông tin hệ thống realtime | *"CPU đang bao nhiêu phần trăm?"* |
| 📈 | Lấy dữ liệu thị trường chứng khoán | *"Giá VIC hôm nay?"* |
| 🚀 | Mở ứng dụng Creative phù hợp | *"Mở Photoshop sửa ảnh"* |
| ⚡ | Chạy lệnh CLI trực tiếp | *"chạy ls -la"* |
| ⚙️ | Tạo kịch bản tự động hóa | *"tự động sắp xếp thư mục"* |
| 🔑 | Lưu API key | *"lưu openai key là sk-..."* |
| 🎨 | Chỉnh sửa ảnh với filter | *"làm ảnh này đen trắng"* |
| 🎬 | Bắt đầu chỉnh sửa video | *"cắt video cho tôi"* |
| 🧭 | Điều hướng đến trang | *"vào trang cài đặt"* |
| 🧮 | Tính toán biểu thức | *"tính 15% của 2.4 triệu"* |
| 🛡️ | Quét bảo mật máy | *"máy có virus không?"* |
| ⚡ | Tối ưu hệ thống | *"máy chậm tối ưu đi"* |
| ❌ | Kết thúc tiến trình | *"đóng chrome đi"* |

AI có thể thực hiện nhiều công cụ liên tiếp tự động.

### 3. 🔑 API Keys
Nơi quản lý tập trung tất cả các loại API key: OpenAI, Anthropic, Gemini, Chứng khoán, Thời tiết, Web Search, Stable Diffusion... Thêm key tùy chỉnh, lưu local an toàn, mã hóa bởi backend C++.

### 4. 🎨 Trung tâm Sáng tạo — Bộ ứng dụng Creative
12 ứng dụng chuyên nghiệp full tính năng giống hệt Adobe Creative Cloud:

| Icon | Tên app | Giống Adobe | Chức năng |
|---|---|---|---|
| **Ps** | xPhoto | Photoshop | Chỉnh sửa ảnh raster, layers, brush, tẩy, đổ màu, cắt, text, điều chỉnh Brightness/Contrast/Saturation, bộ lọc, undo/redo, xuất PNG/JPG |
| **Lr** | xLight Classic | Lightroom Classic | Xử lý ảnh nhiếp ảnh chuyên nghiệp, Presets, Histogram, Basic/Tone Curve/HSL, Sharpen/Noise Reduction, Before/After compare, Filmstrip, AI Masking |
| **Pr** | xCut Pro | Premiere Pro | Dựng video timeline multi-track video/audio, playback controls, media library, hiệu ứng, xuất định dạng |
| **Ae** | xFX | After Effects | Motion Graphics & VFX, composition, keyframe animation, hiệu ứng, camera/lights, AI Rotoscoping/Upscale |
| **Ai** | xVector | Illustrator | Vẽ vector chuyên nghiệp, pen tool, swatch màu, stroke, transform, artboard, xuất SVG |
| **Id** | xLayout | InDesign | Dàn trang in ấn, master pages, paragraph/character styles, margin guides, xuất PDF in ấn |
| **Xd** | xPrototype | Adobe XD / Figma | Thiết kế UI/UX, wireframe, prototype tương tác, components, preview mobile/desktop |
| **Au** | xAudio | Audition | Chỉnh sửa âm thanh waveform, multitrack, khử ồn, mix, thu âm |
| **Dc** | xDocs | Word/Docs | Soạn thảo văn bản ribbon UI như Microsoft Word |
| **PDF** | xPDF | Acrobat | Đọc, chú thích, ký tên, convert PDF |
| 🧮 | xCalc | Calculator | Máy tính khoa học đầy đủ |
| **$_** | xTerminal | Terminal/CLI | Console chạy lệnh trực tiếp trên máy |

**Tất cả app được tích hợp với AI**: Bạn chỉ cần nói trong Chat là AI tự mở app đúng yêu cầu.

### 5. ⚙️ Cài đặt
- Chủ đề tối/sáng
- 6 màu chủ đạo (xanh lá/dương/đỏ/vàng/tím/hồng Adobe)
- Ngôn ngữ
- Khởi động cùng hệ thống
- Cập nhật tự động
- Thông tin phiên bản công nghệ

### 6. ⚡ Tự động hóa (Automation Hub) — ⭐ Tính năng hay ho
Máy tự động làm việc thay bạn:
- **✨ Tạo tự động bằng lời nói với AI**: Mô tả kịch bản bằng tiếng Việt, AI tự phân tích và tạo quy trình
- **8 kịch bản có sẵn** chỉ cần 1 click bật/tắt công tắc:
  - Tự sửa ảnh chụp màn hình thêm viền bóng
  - Tự cắt video thành 9:16 cho TikTok/Reels/Shorts
  - Báo cáo thị trường 9h sáng hàng ngày
  - Tự tối ưu RAM khi quá tải
  - Tự sắp xếp thư mục Downloads mỗi tối
  - Tự tách nhạc MP3 từ video
  - Cảnh báo nhiệt độ CPU quá cao
  - Chế độ tiết kiệm pin
- **Flow Builder trực quan**: Kéo thả xây dựng quy trình Trigger → Condition → Actions → Notify
- **Nhật ký hoạt động**: Ghi lại mọi việc automation đã làm realtime

---

## 🏗️ Kiến trúc kỹ thuật

```
Rune/
├── src/
│   ├── cpp/                     # Backend C++20 Native (hiệu năng cao)
│   │   ├── system_monitor.cpp   # Giám sát CPU/GPU/RAM/Disk/Network realtime
│   │   ├── market_data.cpp      # Lấy dữ liệu GDP/chứng khoán các nước
│   │   ├── cli_runner.cpp       # Thực thi lệnh CLI trực tiếp
│   │   ├── key_manager.cpp      # Quản lý + mã hóa API key local
│   │   └── server_main.cpp      # HTTP server local trên C++
│   └── rust/
│       └── lib.rs               # Rust FFI bindings → Tauri desktop wrapper
├── public/                       # Frontend (Glassmorphism 4D UI)
│   ├── index.html
│   ├── style.css                # Toàn bộ giao diện 4D glass effect
│   ├── app.js                   # AI Tool-Calling Engine + Logic
│   └── tools/                   # 12 ứng dụng Creative
│       ├── image-editor.html    # Ps
│       ├── lightroom.html       # Lr
│       ├── video-editor.html    # Pr
│       ├── after-effects.html   # Ae
│       ├── illustrator.html     # Ai
│       ├── indesign.html        # Id
│       ├── xd.html              # Xd
│       ├── audio.html           # Au
│       ├── docs.html            # Dc
│       ├── pdf.html             # PDF
│       ├── calc.html            # Calc
│       └── terminal.html        # Terminal
├── CMakeLists.txt               # Build C++
├── Cargo.toml                   # Build Rust Tauri
└── build.sh                     # Script build tự động
```

### Công nghệ sử dụng:
| Thành phần | Công nghệ | Lý do |
|---|---|---|
| Backend | **C++20** | Hiệu năng tối đa cho giám sát hệ thống, xử lý media, CLI execution |
| App Desktop | **Rust + Tauri** | Nhỏ gọn, nhẹ, không cần trình duyệt, gọi C++ qua FFI |
| Frontend | HTML/CSS/JS thuần | Nhanh, không phụ thuộc framework nặng |
| Charts | Chart.js | Biểu đồ thị trường/mạng realtime |
| Hiệu ứng | CSS 3D transforms + backdrop-filter | Khối 4D xoay, glass morphism, đổ bóng chiều sâu |

### Thương hiệu Rune:
- Logo: **Khối lập phương Tesseract 4D** xoay liên tục bằng CSS 3D
- Màu chủ đạo: Gradient tím `#8b5cf6` → cyan `#06b6d4` → hồng `#ec4899`
- Phong cách: Không gian chiều sâu, kính trong mờ, đổ bóng đa lớp

---

## 🔨 Build thành ứng dụng desktop native

```bash
# Build C++ backend trước
chmod +x build.sh
./build.sh

# Để build thành file .exe / .app desktop:
# 1. Cài Rust từ https://rustup.rs
# 2. Cài Tauri: cargo install tauri-cli
# 3. Build: cargo tauri build
# File cài đặt thành phẩm sẽ có trong src-tauri/target/release/bundle/
```

Bản build cuối cùng sẽ là ứng dụng desktop native chạy độc lập, không cần trình duyệt.

---

## 🎮 Điều khiển:
- **Sidebar trái**: Điều hướng 6 trang chính + các icon mở nhanh Creative apps
- **Mở ứng dụng**: Click icon trên sidebar, hoặc vào trang Sáng tạo, hoặc nói với AI
- **AI Chat**: Gõ yêu cầu tự nhiên, AI tự tìm đúng công cụ và thực hiện
- **Automation**: Bật các kịch bản có sẵn hoặc dùng AI tạo kịch bản mới bằng lời nói

---

## ✅ Đã kiểm tra toàn bộ:
- [x] Tất cả nút bấm đều có sự kiện hoạt động
- [x] Tất cả link đều đúng
- [x] Cân bằng thẻ HTML trên toàn bộ 13 file
- [x] Không còn lỗi cú pháp Javascript
- [x] Đã đổi thương hiệu toàn bộ từ xKiro thành Rune
- [x] Logo khối 4D xoay hoạt động
- [x] AI engine gọi được 15 công cụ
- [x] System monitor cập nhật mỗi giây không lỗi
- [x] Market data hoạt động đầy đủ 5 quốc gia
- [x] Bảo mật, process table hoạt động
- [x] Automation flow hoạt động
- [x] 12 ứng dụng creative mở được trong iframe đầy đủ chức năng

---

**RUNE v2.0 4D Edition** — Made in Vietnam 🇻🇳
