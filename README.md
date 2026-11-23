# Nhạc Của Tui

Ứng dụng nghe nhạc nhiều người dùng, giao diện kiểu iOS 26 (Liquid Glass).

- Tên đăng nhập = **số điện thoại** (không trùng). Mỗi người có thư viện & danh sách phát riêng.
- Mỗi người tự đổi tên, số điện thoại, mật khẩu trong tab **Tài khoản**.
- **Admin** có tab **Quản trị**: xem toàn bộ thành viên, số điện thoại, mật khẩu; thêm thành viên; đặt lại mật khẩu; xoá thành viên.

Cấu trúc (giữ đúng như vậy khi đưa lên GitHub, `index.html` nằm ngay ở gốc repo):

```
index.html
manifest.webmanifest   <- thông tin để "Thêm vào MH chính" có tên + icon đẹp
sw.js                  <- giúp app mở nhanh, mở được khi mạng yếu
qr.svg                 <- mã QR trỏ tới https://nhaccuatui.vercel.app/
icon-192.png
icon-512.png
package.json
api/app.js             <- "cầu nối" chạy trên Vercel (BẮT BUỘC nằm trong thư mục api)
```

## Vercel
- Nối **Storage → Upstash Redis** vào dự án (Vercel tự thêm các biến kết nối).
- **Nên đặt** biến `ADMIN_PHONE` = số điện thoại của admin (ví dụ `0901234567`).
  Không đặt thì người tạo tài khoản đầu tiên sau khi cập nhật sẽ thành admin.
- Biến tuỳ chọn: `ADMIN_EMAIL` (admin của bản cũ), `SESSION_SECRET` (đừng đổi sau khi đã dùng,
  vì mật khẩu lưu cho admin xem được mã hoá bằng chuỗi này), `DB_LIMIT_MB`, `CMD_LIMIT`.

## Tài khoản cũ (đăng ký bằng email)
Vẫn đăng nhập được: bấm "Tài khoản cũ đăng ký bằng email" ở màn hình đăng nhập.
Sau khi đăng nhập, vào Tài khoản → Số điện thoại để gắn số, lần sau đăng nhập bằng số.
Mật khẩu của tài khoản cũ sẽ hiện trong trang Quản trị sau lần đăng nhập kế tiếp của họ.

Kiểm tra: mở `https://<tên-miền>/api/app?a=usage` phải ra JSON có `"configured":true`.

## Nhật ký cập nhật
- **17/11/2026**: thêm `manifest.webmanifest` và `qr.svg` (trước đây thiếu); sửa lỗi tài khoản cũ
  (chưa có thư viện) bấm "Tạo danh sách" / "Yêu thích" bị báo lỗi máy chủ; `sw.js` bản v5
  (lưu cả icon, mở được khi mất mạng, tự xoá bộ nhớ cũ).
- **17/11/2026 (bản 2)**: trang Đang phát có nút "Giữ màn hình luôn sáng", danh sách bài hát ngay dưới phần
  điều khiển, và mục "Ứng dụng" (chia sẻ, mã QR, tạo icon) ở cuối. Thanh tab có thêm "Đang phát".
  Trang chủ có icon Đăng nhập / Đăng ký và ô "Thể loại của bạn" (bấm để nghe theo thể loại, lấy từ
  mọi danh sách của chính mình – máy chủ có thêm chức năng `mine`). Link chia sẻ luôn là
  https://nhaccuatui.vercel.app/. Nút nhiều màu tươi hơn, chữ hamy19902020 nhỏ hơn.
- **23/11/2026 (bản 3)**: Trang chủ chính là trang nghe nhạc (máy tính: trình phát bên trái, danh sách bên phải).
  Chỉ còn 2 tab: **Nghe nhạc** và **Tài khoản** (gồm cài đặt, Mọi người, Ứng dụng/QR) + tab Quản trị cho admin.
  **Danh sách phát chung** do admin tạo (Quản trị → Tạo danh sách phát mới); thành viên chọn danh sách rồi thêm nhạc,
  chỉ người thêm hoặc admin mới sửa/xoá bài. Mỗi người vẫn có mục Yêu thích riêng.
  Tính năng mới: phát trong nền + tự phát tiếp khi có mạng lại, điều khiển ở màn hình khoá, cửa sổ nổi (PiP, Chrome/Edge máy tính),
  SponsorBlock, DeArrow, tốc độ 0.25x–2x, phụ đề + dịch tự động sang tiếng Việt, hàng đợi (phát tiếp theo), hẹn giờ tắt,
  bình luận theo bài, lưu bài .mp3 để nghe khi mất mạng, đăng nhập bằng mã ghép nối 6 số, chuyển nhanh nhiều tài khoản,
  vuốt trái/phải trên tên bài để chuyển bài, phím tắt (Space, ←/→, n, p).
  Máy chủ có thêm: lists, gsongs, glnew/glren/gldel, gadd/gedit/gdel, cmts/cmt/cmdel, pairnew/pairuse, switch.
