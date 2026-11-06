# Luật cho AI agent khi implement

1. **Ngôn ngữ UI: tiếng Việt** (key i18n trong `apps/web/src/core/i18n/vi.json`). Code/comment: tiếng Anh.
2. **Không tự bịa số liệu y tế.** Mọi ngưỡng chuẩn (cân nặng, chiều dài, vòng đầu, lịch tiêm, mốc phát triển) PHẢI đọc từ `knowledge/`. Thiếu dữ liệu → tạo TODO, không hard-code.
3. Dữ liệu có `"verified": false` → hiển thị nhãn "Đang chờ xác minh" và không dùng để cảnh báo đỏ.
4. **AI không chẩn đoán, không kê đơn thuốc/liều lượng.** Luôn tuân `docs/03_AI_ADVISOR.md` §Guardrails. Dấu hiệu nguy hiểm → hướng dẫn đi khám/gọi 115 ngay.
5. Local-first (IndexedDB): chạy offline đầy đủ, trừ AI chat. API nền tảng đi qua src/core/platform.
6. Mỗi task: viết test (Vitest) cho logic tính toán (z-score, tuổi hiệu chỉnh, lịch tiêm).
7. Làm theo thứ tự `tasks/BACKLOG.md`; mỗi PR = 1 task ID; cập nhật checkbox.
8. Bảo mật: dữ liệu bé là dữ liệu sức khỏe nhạy cảm → mã hóa local, không gửi PII (tên, ngày sinh chính xác) lên LLM; chỉ gửi tuổi theo ngày + số đo.
