# BéYêu – App theo dõi chăm sóc bé 0–24 tháng (Vietnamese-first)

Repo khung (scaffold) để AI agent (Copilot/Claude/Cursor…) implement theo từng task.

## Đọc theo thứ tự
1. `AGENTS.md` – luật làm việc cho AI agent (BẮT BUỘC)
2. `docs/01_PRODUCT_PLAN.md` – mục tiêu, persona, tính năng, roadmap
3. `docs/02_ARCHITECTURE.md` – kiến trúc, tech stack, data model
4. `docs/03_AI_ADVISOR.md` – thiết kế AI tư vấn + guardrails y tế
5. `docs/04_UX_QUICK_INPUT.md` – nguyên tắc nhập liệu tối giản
6. `knowledge/` – kiến thức nền (chuẩn tăng trưởng WHO, lịch tiêm, mốc phát triển, chăm sóc)
7. `tasks/BACKLOG.md` – danh sách task theo milestone, mỗi task có Acceptance Criteria

## Cấu trúc
```
apps/web/               Vite + React + TS (PWA); api/ = Vercel Functions
  src/core/             db (Dexie/IndexedDB), models, i18n (vi), standards (z-score engine)
  src/features/         mỗi feature 1 thư mục
packages/ai/            prompts, RAG trên knowledge/, guardrails
knowledge/              dữ liệu chuẩn (JSON/MD) – nguồn sự thật của app
scripts/                script tải/convert dữ liệu WHO
tasks/                  backlog cho AI implement
```
