# Backlog (AI agent làm tuần tự)

## M0 – Nền tảng
- [x] T001 Init Vite React TS + Tailwind + Vitest + ESLint + vite-plugin-pwa, deploy Vercel, CI — AC: link Vercel mở được trên điện thoại, "Thêm vào MH chính" được
- [x] T002 Dexie schema + repo CRUD — AC: test với fake-indexeddb pass
- [x] T003 i18n vi + lint chặn chuỗi hard-code
- [x] T004 Hoàn thiện `scripts/fetch_who_lms.py`, sinh 10 file LMS — **dữ liệu tải thật từ WHO** (expanded z-score tables, 5 chỉ số × 2 giới), mỗi JSON có `source_url` + `source_sha256`; `verified: false` chờ review y khoa (T005)
- [x] T004b Test z-score engine — 45 test (`zFromLMS`/`classify`/`correctedAgeDays`), đối chiếu 4 bộ LMS với cột SD trong `.xlsx` WHO (sai lệch max 0.00269 z); 2 điểm ghi ở `QUESTIONS.md` — Q2 `zFromLMS` với `L = 0` đã sửa (2026-11-08, +3 test), Q1 (`classify` mốc ±3) chờ T005
- [ ] T005 Review y khoa `knowledge/*` → `verified: true` (NGƯỜI làm)
- [x] T006 `core/platform` (notify, share, storage.persist) + Backup/Restore JSON — AC: notify/share/storage an toàn khi thiếu API, backup export/import `merge`/`replace` có validate chặt, 41 test pass

## M1 – Ghi nhận
- [x] T010 Onboarding hồ sơ bé (≤ 4 trường), tuổi hiệu chỉnh — AC: form 4 trường validate inline, lưu `createBaby` + `setBaby` rồi về `/`, preview tuổi hiệu chỉnh ngay khi nhập (32 tuần/100 ngày → 44 ngày)
- [x] T011 Home lưới 6 nút, 1 chạm log + undo 5s — 6 ô lớn, tap ghi ngay với default lần trước, giữ 450ms mở sheet ≤ 2 trường, undo 5s; 14 test logic
- [x] T012 Timer bú/ngủ lưu startAt trong DB (đúng sau khi reload) — timer = LogEntry chưa `endAt` + payload `{timer:'running'}`; khôi phục từ IndexedDB sau reload, stop set `endAt`; 21 test
- [x] T013 Timeline ngày, sửa/xóa — điều hướng ngày, sửa giờ bắt đầu/ghi chú/giờ kết thúc, xoá có confirm inline; 13 test
- [x] T014 Dashboard 24h so với `feeding_sleep_reference.md` — parse bảng tham khảo từ knowledge lúc build (`?raw`), metrics 24h, `verified:false` → nhãn "Đang chờ xác minh" + không cảnh báo màu; 36 test

## M2 – Chuẩn & tiêm
- [x] T020 Nhập số đo + z-score + band màu — form 3 ô (bỏ trống được), z qua `zForMeasurement` (tuổi hiệu chỉnh), band pill + badge; `verified:false` → tone trung tính, không đỏ; 23 test
- [x] T021 Biểu đồ Recharts: đường SD -3..+3 + điểm của bé — 7 đường LMS downsample 7 ngày, scatter điểm + tooltip z, domain theo bảng; 15 test
- [x] T022 Cảnh báo tốc độ (giảm > 0.67 SD) — `assessVelocity` theo cặp liền kề, `verified:false` → trạng thái `unverified` (không cảnh báo đỏ); 12 test
- [x] T023 Sinh lịch tiêm, đánh dấu đã tiêm, **xuất .ics**, Notification nếu được cấp quyền — 16 mũi TCMR từ `vn_schedule.json` (kể cả `afterPrevDays`), merge không trùng, .ics RFC5545 + VALARM −3d/−1d, notify qua `core/platform`; 41 test
- [x] T024 Nhãn "Đang chờ xác minh" khi `verified:false` — component `ui/UnverifiedBadge` dùng ở Tăng trưởng, biểu đồ, tốc độ, Tiêm chủng và mục chờ xác minh; tone cảnh báo bị khoá khi chưa duyệt

## M3 – AI
- [ ] T030 `api/ai.ts` Vercel Function: lọc PII, rate limit, key ở env
- [ ] T031 Red-flag engine rule cứng chạy ở client trước request
- [ ] T032 RAG trên knowledge, trả `sources`
- [ ] T033 Phân tích tuần → JSON schema + UI kế hoạch 7 ngày
- [ ] T034 Parse câu tự do → log
- [ ] T035 Bộ test an toàn ≥ 50 câu — AC: 100% chặn/điều hướng đúng

## M4 – Mở rộng
- [x] T040 Mốc phát triển — 8 mốc đọc từ `knowledge/milestones`, ngưỡng red-flag lấy từ `red_flags_redFlagIfNotBy`, mark/undo qua `setMilestoneCheck`/`clearMilestoneCheck`; unverified → tone honey, không đỏ; 13 test
- [x] T041 Nhắc việc — bảng `reminders` (Dexie v2) + repo CRUD, backup v2 (đọc được v1), lặp daily/weekly, nhắc trong 24h khi đã cấp quyền; 27 test
- [ ] T042 Supabase sync gia đình — **BLOCKED**: cần Supabase project + URL/anon key + RLS theo hộ gia đình; chưa có nên chưa thể xác minh sync thật (xem `tasks/QUESTIONS.md`)
- [x] T043 PDF báo cáo đi khám (window.print CSS) — trang `/report` in được (ẩn nav, trắng/đen, `@page` 14mm), gồm hồ sơ/tăng trưởng/tiêm chủng/48h; 28 test
- [x] T044 Nhật ký ốm — 14 ngày, ghi nhiệt độ/triệu chứng/thuốc (không chẩn đoán, không liều), tóm tắt nhiệt độ cao nhất; 24 test
- [x] T045 Consent & xóa dữ liệu — consent local, xuất/nhập backup (merge/replace), `storage.persist`, xoá toàn bộ khi gõ `XOA` rồi về onboarding; 15 test

## M5 – Bọc WebView (khi cần)
- [ ] T050 Capacitor Android/iOS, thay `core/platform` bằng plugin native
- [ ] T051 Local notifications, splash, icon · T052 Phát hành store
