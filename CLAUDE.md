# CLAUDE.md — đọc file này đầu tiên mỗi phiên

## Dự án
Web app (PWA, mobile-first) theo dõi bé 0–24 tháng, UI tiếng Việt. Sau này bọc Capacitor thành app.
Stack: Vite + React + TS + Tailwind + Dexie (IndexedDB) + Recharts + Vitest. Chi tiết: docs/02_ARCHITECTURE.md

## Lệnh (chạy trong apps/web)
- Cài: `npm ci` | Dev: `npm run dev` | Build: `npm run build`
- Test: `npm test` (Vitest) | E2E: `npx playwright test` | Lint: `npm run lint` | Type: `npx tsc --noEmit`

## Quy trình mỗi task (BẮT BUỘC)
1. Đọc `tasks/cards/<ID>.md`. CHỈ đọc thêm file trong "Context files".
2. Viết test trước → code → chạy test + lint + tsc đến khi pass.
3. Chỉ sửa file trong "Files to touch". Cần sửa file khác → DỪNG, ghi `tasks/QUESTIONS.md`.
4. Tick `tasks/BACKLOG.md`, ghi 3–5 dòng vào `tasks/PROGRESS.md`.
5. Commit: `<ID>: <mô tả ngắn>`.

## Luật cứng
- Không hard-code số liệu y tế; đọc từ `knowledge/`. Không bịa URL/nguồn.
- Text UI qua `t('key')`, key thêm vào `src/core/i18n/vi.json`.
- Không dùng API native/trình duyệt đặc thù trực tiếp trong feature — đi qua `src/core/platform/*`.
- Không thêm thư viện ngoài bảng trong docs/02. Không refactor ngoài phạm vi.
- Không gọi LLM từ client; chỉ qua `/api/ai`. Không gửi tên/ảnh bé.
- Không chắc → hỏi (QUESTIONS.md), không đoán.

## Quy ước code
- Feature: `src/features/<name>/{pages,components,hooks,logic}/`; logic thuần trong `logic/` và có test.
- Mobile-first: kiểm tra ở viewport 390x844. Không `any`. Tên tiếng Anh.
