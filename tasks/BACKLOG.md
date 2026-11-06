# Backlog (AI agent làm tuần tự)

## M0 – Nền tảng
- [ ] T001 Init Vite React TS + Tailwind + Vitest + ESLint + vite-plugin-pwa, deploy Vercel, CI — AC: link Vercel mở được trên điện thoại, "Thêm vào MH chính" được
- [ ] T002 Dexie schema + repo CRUD — AC: test với fake-indexeddb pass
- [ ] T003 i18n vi + lint chặn chuỗi hard-code
- [ ] T004 Hoàn thiện `scripts/fetch_who_lms.py`, sinh 10 file LMS (NGƯỜI làm)
- [ ] T004b Test z-score engine
- [ ] T005 Review y khoa `knowledge/*` → `verified: true` (NGƯỜI làm)
- [ ] T006 `core/platform` (notify, share, storage.persist) + Backup/Restore JSON

## M1 – Ghi nhận
- [ ] T010 Onboarding hồ sơ bé (≤ 4 trường), tuổi hiệu chỉnh
- [ ] T011 Home lưới 6 nút, 1 chạm log + undo 5s
- [ ] T012 Timer bú/ngủ lưu startAt trong DB (đúng sau khi reload)
- [ ] T013 Timeline ngày, sửa/xóa
- [ ] T014 Dashboard 24h so với `feeding_sleep_reference.md`

## M2 – Chuẩn & tiêm
- [ ] T020 Nhập số đo + z-score + band màu
- [ ] T021 Biểu đồ Recharts: đường SD -3..+3 + điểm của bé
- [ ] T022 Cảnh báo tốc độ (giảm > 0.67 SD)
- [ ] T023 Sinh lịch tiêm, đánh dấu đã tiêm, **xuất .ics**, Notification nếu được cấp quyền
- [ ] T024 Nhãn "Đang chờ xác minh" khi `verified:false`

## M3 – AI
- [ ] T030 `api/ai.ts` Vercel Function: lọc PII, rate limit, key ở env
- [ ] T031 Red-flag engine rule cứng chạy ở client trước request
- [ ] T032 RAG trên knowledge, trả `sources`
- [ ] T033 Phân tích tuần → JSON schema + UI kế hoạch 7 ngày
- [ ] T034 Parse câu tự do → log
- [ ] T035 Bộ test an toàn ≥ 50 câu — AC: 100% chặn/điều hướng đúng

## M4 – Mở rộng
- [ ] T040 Mốc phát triển · T041 Nhắc việc · T042 Supabase sync gia đình
- [ ] T043 PDF báo cáo đi khám (window.print CSS) · T044 Nhật ký ốm · T045 Consent & xóa dữ liệu

## M5 – Bọc WebView (khi cần)
- [ ] T050 Capacitor Android/iOS, thay `core/platform` bằng plugin native
- [ ] T051 Local notifications, splash, icon · T052 Phát hành store
