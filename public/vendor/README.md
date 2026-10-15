# Thư viện bên thứ ba (vendor)

Các file trong thư mục này được **tải về và lưu sẵn trong repo** để RUNE chạy hoàn toàn
ngoại tuyến — toàn bộ giao diện và 12 app Creative **không gọi CDN nào** cả:

| File | Thư viện | Phiên bản | Giấy phép | Nguồn |
|---|---|---|---|---|
| `pdf.min.js`, `pdf.worker.min.js` | PDF.js (Mozilla) — legacy build | 3.11.174 | Apache-2.0 | `https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-3.11.174.tgz` (`package/legacy/build/`) |
| `pdf-lib.min.js` | pdf-lib — đọc/ghi PDF thật trong trình duyệt | 1.17.1 | MIT | `https://registry.npmjs.org/pdf-lib/-/pdf-lib-1.17.1.tgz` (`package/dist/`) |
| `pdf-lib-fontkit.umd.min.js` | @pdf-lib/fontkit — cần để pdf-lib nhúng font TTF | 1.1.1 | MIT | `https://registry.npmjs.org/@pdf-lib/fontkit/-/fontkit-1.1.1.tgz` (`package/dist/`) |
| `chart.umd.js` | Chart.js — biểu đồ thị trường/mạng ở Dashboard | 4.4.7 | MIT (xem `LICENSE-chart.js.md`) | `https://registry.npmjs.org/chart.js/-/chart.js-4.4.7.tgz` (`package/dist/`) |
| `DejaVuSans.ttf`, `DejaVuSans-Bold.ttf` | DejaVu Fonts | 2.37 | DejaVu license (Bitstream Vera + Arev) | `/usr/share/fonts/truetype/dejavu/` |

Font DejaVu được nhúng khi **tạo PDF mới** và khi **ghi chú thích tiếng Việt vào PDF**
(`xPDF`), vì font Helvetica có sẵn trong PDF không mã hoá được dấu tiếng Việt.

Giấy phép DejaVu (tóm tắt): được phép sao chép, sử dụng, nhúng và phân phối lại
nguyên bản hoặc đã sửa, miễn là giữ nguyên thông báo bản quyền; không được bán riêng
font dưới tên gốc.

Không sửa đổi nội dung các file này. Nếu cần nâng cấp, hãy tải lại từ nguồn ở trên.
