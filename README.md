# Nhac Hot

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
- **Tài khoản admin mặc định:** đăng nhập bằng email `ducanhitpt@gmail.com` (bấm "Đăng nhập bằng email" ở màn hình đăng nhập)
  với mật khẩu mặc định chủ app đã chọn. Tài khoản tự tạo ở lần đăng nhập đầu tiên. Trong code chỉ lưu mật khẩu dạng băm.
  Đăng nhập xong nên vào Tài khoản → Đổi mật khẩu. (Tuỳ chọn: đặt biến `ADMIN_EMAIL` / `ADMIN_PASSWORD` trên Vercel để dùng email/mật khẩu khác.)
- Tuỳ chọn: biến `ADMIN_PHONE` = một số điện thoại cũng được làm admin.
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
- **23/11/2026 (bản 4)**: Tài khoản → **Kiểm tra kết nối** (mạng, máy chủ /api, biến Upstash, ADMIN_PHONE, ghi/đọc thử,
  dung lượng, YouTube, SponsorBlock, DeArrow…) và **Xoá dữ liệu** (admin: theo thành viên / tháng / năm / toàn bộ, đếm trước rồi
  mới xoá). Link chia sẻ + mã QR tự theo tên miền đang mở (không cần sửa code khi đổi tên miền).
  Máy chủ có thêm: health, purge.
- **23/11/2026 (bản 5)**: tài khoản admin mặc định bằng email; **Quên mật khẩu** (thành viên gửi yêu cầu, admin thấy ở tab Quản trị);
  admin **Đặt về 123** hoặc đặt mật khẩu khác; ai đang dùng mật khẩu mặc định sẽ được nhắc đổi khi đăng nhập.
  Máy chủ có thêm: forgot, rsdel; apass nhận `reset: true`.
- **23/11/2026 (bản 6)**: đổi tên app thành **Nhac Hot**. Thành viên **đăng ký / đăng nhập bằng Gmail + mật khẩu** (tài khoản cũ dùng số điện
  thoại vẫn đăng nhập được). Phiên đăng nhập giữ **30 ngày**. Kiểm tra kết nối cho mọi người xem phần cơ sở dữ liệu (admin xem thêm số liệu).
  Trang nghe nhạc có 2 mục **Của bạn / Thành viên**: chọn một thành viên để thấy và nghe các danh sách của người đó.
  Admin tạo danh sách **chung** (ai cũng thêm nhạc) hoặc **riêng cho một thành viên** (chỉ người đó + admin thêm nhạc).
  Máy chủ có thêm: email (đổi Gmail); register/aadd/forgot dùng `email`; glnew/glren nhận `o` (người dùng danh sách).
