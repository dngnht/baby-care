# Deploy BéYêu lên web (mở từ điện thoại)

Ứng dụng là **static site** (Vite + PWA). Deploy chỉ cần host file tĩnh —
không có server, không có database trên cloud. Dữ liệu của bé nằm trong
IndexedDB của **từng trình duyệt/điện thoại**.

> Tôi không thể deploy hộ: việc này cần đăng nhập tài khoản Vercel/GitHub của
> bạn. Không gửi token qua chat. Cấu hình deploy đã được chuẩn bị sẵn ở
> `vercel.json` + `.vercelignore`; bạn chỉ cần bấm deploy.

---

## Cách A — GitHub + Vercel (khuyến nghị, có HTTPS + tên miền miễn phí)

1. **Đưa code lên GitHub** (repo private cũng được), giữ nguyên cấu trúc:
   ```
   apps/web/...
   knowledge/...
   vercel.json
   ```
2. Vào <https://vercel.com/new> → **Import Git Repository** → chọn repo.
3. Ở màn hình cấu hình:
   - **Root Directory**: để trống (repo root) — **đừng** chọn `apps/web`,
     vì app đọc `knowledge/` ở thư mục gốc lúc build.
   - Framework Preset: **Other** (Vercel tự đọc `vercel.json`).
   - Không cần nhập biến môi trường nào.
4. Bấm **Deploy**. Khoảng 1–2 phút, bạn nhận URL dạng
   `https://beyeu-xxxx.vercel.app`.
5. Trên điện thoại: mở URL đó → **Chia sẻ → Thêm vào màn hình chính**
   (iOS Safari) hoặc **⋮ → Thêm vào màn hình chính** (Android Chrome).
   PWA cần HTTPS — Vercel đã có sẵn.

Lần sau mỗi lần push code, Vercel tự build lại.

## Cách B — Vercel CLI trên máy bạn (không cần GitHub)

Chạy ở **thư mục gốc repo** (nơi có `vercel.json`):

```bash
npm i -g vercel
vercel login          # đăng nhập bằng email/GitHub của bạn
vercel --prod         # deploy production, in ra URL
```

## Cách C — Netlify / Cloudflare Pages (cũng miễn phí)

- **Build local rồi upload** (nhanh nhất, không cần cấu hình):
  ```bash
  npm --prefix apps/web ci
  npm --prefix apps/web run build
  # upload thư mục apps/web/dist lên Netlify Drop / Cloudflare Pages
  ```
- **Nối repo** thì dùng đúng 3 giá trị:
  - Build command: `npm --prefix apps/web ci && npm --prefix apps/web run build`
  - Publish directory: `apps/web/dist`
  - Node: 22

---

## Sau khi deploy — kiểm tra 5 điểm

1. Mở `/` → tự chuyển tới **Hồ sơ của bé** (lần đầu).
2. Tạo hồ sơ → về trang **Hôm nay**, bấm thử **Bú bình**.
3. **Tổng quan** → thấy mục *So sánh 7 ngày*.
4. Tắt mạng, mở lại app → vẫn vào được (service worker đã cache).
5. Thêm vào màn hình chính → mở như app, không có thanh địa chỉ.

## Lỗi thường gặp

| Hiện tượng | Nguyên nhân / cách sửa |
|---|---|
| Build lỗi `Cannot find module '.../knowledge/...'` | Root Directory đang là `apps/web` → đổi về repo root |
| Build lỗi Node/`crypto.randomUUID` | Đặt Node 22 (Vercel: Settings → General → Node.js Version) |
| Mở `/timeline` trực tiếp bị 404 | Thiếu rewrite SPA → kiểm tra `vercel.json` có `rewrites` |
| Cài PWA không hiện nút "Thêm vào MH chính" | Phải là HTTPS và mở bằng Safari/Chrome (không dùng trình duyệt trong app Facebook/Zalo) |
| Dữ liệu "mất" khi đổi máy | Dữ liệu không đồng bộ: dùng **Dữ liệu & quyền riêng tư → Xuất bản sao lưu** rồi nhập trên máy mới |

## Lưu ý về dữ liệu

- Deploy chỉ đưa **code** lên mạng; log, số đo, lịch tiêm nằm trên máy.
- Muốn ba mẹ dùng chung một bộ dữ liệu thì cần **T042 Supabase sync** (đang
  chờ cấu hình project — xem `tasks/QUESTIONS.md`).
