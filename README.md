# Nhac Hot

Ứng dụng nghe nhạc nhiều người dùng, giao diện kiểu iOS 26 (Liquid Glass). Tên miền: https://nhachot.vercel.app

- Đăng ký / đăng nhập bằng **Gmail + mật khẩu** (Gmail và số điện thoại không được trùng). Phiên đăng nhập giữ **6 tháng**.
- Mỗi người tự đổi tên, số điện thoại, Gmail, mật khẩu trong tab **Tài khoản**.
- **Admin tạo sẵn tên danh sách** (Nhạc trẻ, Remix…). Thành viên chỉ dán link rồi chọn tên → bài vào danh sách đó **của riêng mình**
  (Nhạc trẻ của A khác Nhạc trẻ của B). Ai cũng xem/nghe được. Bấm ♥ → vào **Yêu thích** của mình. Có mục **Nghe nhiều nhất**.
- **Admin** có tab **Quản trị**: xem toàn bộ thành viên, Gmail, số điện thoại, mật khẩu; thêm thành viên; đặt lại mật khẩu; xoá thành viên; tạo danh sách chung hoặc tạo hộ cho thành viên.

Cấu trúc (giữ đúng như vậy khi đưa lên GitHub, `index.html` nằm ngay ở gốc repo):

```
index.html
manifest.webmanifest   <- thông tin để "Thêm vào MH chính" có tên + icon đẹp
sw.js                  <- giúp app mở nhanh, mở được khi mạng yếu
qr.svg                 <- mã QR dự phòng
icon-192.png
icon-512.png
package.json
api/app.js             <- "cầu nối" chạy trên Vercel (BẮT BUỘC nằm trong thư mục api)
```

## Vercel
- Nối **Storage → Upstash Redis** vào dự án (Vercel tự thêm các biến kết nối).
- **Tài khoản admin mặc định:** đăng nhập bằng email `ducanhitpt@gmail.com` với mật khẩu mặc định chủ app đã chọn
  (tự tạo ở lần đăng nhập đầu tiên). Đăng nhập xong nên vào Tài khoản → Đổi mật khẩu.
  Tuỳ chọn: biến `ADMIN_EMAIL` / `ADMIN_PASSWORD` để dùng email/mật khẩu khác; `ADMIN_PHONE` để một số điện thoại cũng là admin.
- Biến tuỳ chọn: `SESSION_SECRET` (đừng đổi sau khi đã dùng), `AUDIO_SOURCES` (nguồn Piped/Invidious), `DB_LIMIT_MB`, `CMD_LIMIT`.

Kiểm tra: mở `https://<tên-miền>/api/app?a=usage` phải ra JSON có `"configured":true`.

## Nhật ký cập nhật
- Bản 1–11 (16–23/11/2026): nhiều người dùng, admin, danh sách chung, nghe nền qua Piped/Invidious, cửa sổ nổi, SponsorBlock,
  DeArrow, phụ đề, hàng đợi, bình luận, lưu nghe khi mất mạng, mã ghép nối, chuyển tài khoản, kiểm tra kết nối, xoá dữ liệu,
  quên mật khẩu, giao diện Sáng/Tối/Tự động, đổi tên app thành Nhac Hot, đăng nhập bằng Gmail.
- **24/11/2026 (bản 12)**:
  - Trang chủ khi **chưa đăng nhập**: trình nghe nhạc ở trên → khung **“Đăng nhập để vào danh sách của bạn”** → **danh sách thành viên**
    trong hệ thống (bấm tên để nghe các danh sách của người đó, nút **← Trang chủ** để quay lại). Bấm chữ **Nhac Hot** để về trang chủ.
  - Đã đăng nhập: tab **Danh sách của bạn** và **Thành viên khác** ngay dưới trình phát; không còn nút Đăng ký.
  - Chọn giao diện **Sáng / Tối / Tự động** ngay trên Trang chủ.
  - Khung **Giữ màn hình sáng** và **Chạy nền** có ghi chú cách dùng ngay ở Trang chủ.
  - Thanh tab dưới cùng gọn hơn, sát đáy màn hình điện thoại.
  - Bỏ dòng “Tài khoản cũ đăng nhập bằng số điện thoại”; đăng nhập bằng Gmail. Phiên đăng nhập **6 tháng**.
  - Thêm nhạc: dán **link bài NhacCuaTui / Zing MP3** → app đọc tên bài + ca sĩ và tìm bản YouTube để chọn (máy chủ có thêm `find`).
    Dán link **.mp3** vẫn được (chạy nền tốt nhất); link mp3 của NhacCuaTui (`stream.nct.vn`) được báo ngày hết hạn.
- **24/11/2026 (bản 13)** – mỗi danh sách phát thuộc về đúng một người:
  - **Chưa đăng nhập**: trang chủ chỉ hiện **tên các thành viên** (không hiện nhạc hay danh sách của ai). Bấm vào tên → thấy các
    danh sách phát của người đó → bấm danh sách để nghe. Nút **← Trang chủ** hoặc chữ **Nhac Hot** để quay lại.
  - **Đã đăng nhập**: tab **Danh sách của bạn** chỉ có danh sách của chính mình (chưa có thì báo “Bạn chưa có danh sách phát nào”
    + nút **Tạo danh sách đầu tiên**); tab **Thành viên khác** để xem danh sách của người khác.
  - **Thành viên tự tạo danh sách riêng** (ví dụ “Nhạc trẻ” của A khác “Nhạc trẻ” của B). Ai cũng xem/nghe được, chỉ chủ danh sách
    (và admin) thêm/xoá bài. Bấm ♥ để lưu bài của bất kỳ ai vào mục Yêu thích của mình.
  - Mục mới **Nghe nhiều nhất**: bài được nghe trên 20 giây được tính 1 lượt (mỗi máy tối đa 1 lượt/bài/30 phút).
  - Máy chủ: `plnew` cho mọi thành viên; thêm `top`, `played`.
- **24/11/2026 (bản 14)** – thành viên không tự tạo danh sách:
  - Tài khoản mới chỉ thấy nút **“+ Thêm Nhạc vào Danh Sách Phát Của Bạn”**. Dán link, **chọn danh sách admin đã tạo**
    (Nhạc trẻ, Remix…) → app tự tạo bản riêng của người đó và mở ngay danh sách vừa thêm.
  - Bấm ♥ ở bài bất kỳ → vào **Yêu thích** của mình (mục Yêu thích chỉ hiện khi đã có bài).
  - Admin: **Quản trị → Tên danh sách phát → Tạo tên danh sách mới** (hoặc ô “Tạo tên danh sách” ở trang chủ). Đổi tên thì
    mọi thành viên thấy tên mới. Danh sách cùng tên có cùng màu; thể loại bài tự theo tên danh sách.
  - Máy chủ: `plnew` lại chỉ dành cho admin; `add` tự tạo bản riêng khi thành viên chọn một danh sách admin đã tạo.
- **24/11/2026 (bản 15)** – tính năng kiểu NewTube (ứng dụng YouTube nâng cao cho Android) làm cho web:
  - **Chế độ phát** (Trang chủ, nút công cụ, hoặc Tài khoản): **Nghe nền** (chỉ âm thanh) · **Video HQ** · **YouTube** (trình phát gốc).
  - **Video HQ**: hình lấy từ luồng video riêng, tiếng lấy từ luồng âm thanh nghe nền, app tự giữ khớp nhau.
    Chất lượng **144p → 4K, mặc định 1080p** (nút **Chất lượng**). **Chọn codec**: Tự động / H.264 / VP9 / AV1
    (app báo codec nào máy không hỗ trợ). Tắt màn hình: hình tạm dừng cho đỡ tốn dữ liệu, **tiếng vẫn chạy**.
  - **Cửa sổ nổi thật** (Picture-in-Picture) cho Video HQ trên Android Chrome, iPhone/iPad Safari và máy tính.
  - **Chương (chapters)**: vạch chương trên thanh tua + tên chương đang phát.
  - **Return YouTube Dislike**: hiện lượt thích / không thích (tắt được trong Tài khoản).
  - Tự phát tiếp khi có mạng lại, SponsorBlock, DeArrow… vẫn giữ như cũ và chạy cả với Video HQ.
  - Máy chủ có thêm: `video` (danh sách chất lượng + codec + chương, lưu tạm 50 phút).
- **24/11/2026 (bản 16)** – **chạy nền cho mọi video YouTube** (giống Background Playback của NewTube):
  - Mặc định chế độ **Video HQ**: tắt màn hình / chuyển app → video vẫn chạy tiếp (nghe tiếng), mở lại → hình chạy tiếp đúng chỗ.
  - Chế độ **YouTube** (trình phát gốc): khi rời app, app tự chuyển sang luồng âm thanh từ đúng giây đang xem; quay lại thì video chạy tiếp.
  - Đang tắt màn hình mà hết bài / bấm “Bài sau” ở màn hình khoá → bài mới vẫn phát được trong nền ở cả 3 chế độ.
  - Mở khoá quyền phát âm thanh ngay lần chạm đầu tiên (iPhone/Android cần thao tác người dùng thì mới cho phát nền về sau).
- **24/11/2026 (bản 17)** – làm gọn, ưu tiên nghe nhạc YouTube khi khoá máy / chuyển app:
  - Bỏ chế độ Video HQ, chọn chất lượng/codec, lượt thích/không thích. Trở lại **1 nút bật/tắt “Chạy nền”**
    (mặc định BẬT: bài YouTube phát bằng âm thanh như file mp3 → khoá máy, mở app khác vẫn nghe; TẮT: xem video YouTube).
  - **Phát nhanh hơn**: lấy sẵn âm thanh của bài vừa thêm, bài đầu danh sách, bài đang dở khi mở app và bài kế tiếp;
    máy chủ nhớ link âm thanh 2 giờ.
  - **Giữ màn hình sáng chạy được trên iPhone**: ngoài Wake Lock, app chạy thêm một đoạn video đen im lặng (cách của NoSleep)
    để màn hình không tự tối / tự khoá.
- **24/11/2026 (bản 18)**:
  - **Chạy nền mặc định TẮT** (máy đã dùng bản trước cũng được đặt lại 1 lần). Ghi chú rõ: nhạc .mp3 luôn chạy nền;
    video YouTube không chạy nền được – bật “Chạy nền” để app thử phát bài YouTube bằng âm thanh.
  - **Khoá máy → mở khoá: nhạc tự phát tiếp** (trước đây iPhone báo “tạm dừng” trễ ngay lúc mở khoá nên app tưởng người dùng
    bấm dừng). Nếu máy không cho tự phát, nút ▶ nhấp nháy kèm lời nhắc “Bấm ▶ để nghe tiếp”.
  - **Giữ màn hình sáng trên iPhone**: video giữ sáng không còn để “lặp tự động” (Safari bỏ qua video lặp) – dùng video 12 giây
    có rãnh âm thanh câm, app tự tua lại; chạm màn hình là chạy lại nếu Safari lỡ dừng.
