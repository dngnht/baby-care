# Product Plan

## 1. Mục tiêu
- Bố mẹ Việt Nam ghi nhận tình trạng bé **trong ≤ 5 giây/lần**.
- So sánh ngay với chuẩn (WHO Child Growth Standards – Bộ Y tế VN đang áp dụng) và mốc phát triển.
- AI đưa lời khuyên + **kế hoạch điều chỉnh** (ăn, ngủ, vận động) để bé về vùng lý tưởng.
- Không bỏ lỡ mũi tiêm (TCMR + dịch vụ).

## 2. Persona
| Persona | Nhu cầu | Đau điểm |
|---|---|---|
| Mẹ sau sinh (bận, thiếu ngủ) | Ghi nhanh cữ bú, tã, ngủ | Nhập nhiều bước, quên |
| Bố/ông bà cùng chăm | Xem chung, biết ai đã cho bé ăn | Thông tin rời rạc |
| Phụ huynh đi khám | Báo cáo gọn cho bác sĩ | Không nhớ số liệu |

## 3. Tính năng
### MVP (M1–M3)
| # | Tính năng | Mô tả |
|---|---|---|
| F1 | Hồ sơ bé | Tên, giới, ngày sinh, tuần thai (tính **tuổi hiệu chỉnh** nếu sinh non <37 tuần), cân/dài lúc sinh |
| F2 | Quick Log 1 chạm | Bú (mẹ trái/phải, bình ml), ăn dặm, tã (ướt/bẩn), ngủ (start/stop), nhiệt độ, thuốc, ghi chú/ảnh |
| F3 | Tăng trưởng | Cân nặng, chiều dài, vòng đầu → z-score/percentile WHO; biểu đồ đường chuẩn (-3,-2,0,+2,+3 SD) |
| F4 | Lịch tiêm | Tự sinh lịch từ ngày sinh theo TCMR Bộ Y tế + vắc xin dịch vụ; đánh dấu đã tiêm, nhắc trước 3 ngày & 1 ngày |
| F5 | Dashboard hôm nay | Tổng bú/ngủ/tã 24h so với khoảng tham khảo theo tuổi; trạng thái màu xanh/vàng/đỏ |
| F6 | AI tư vấn | Chat + "Phân tích tuần": nhận xét, kế hoạch điều chỉnh 7 ngày, dấu hiệu cần đi khám |
### V1 (M4–M5)
| F7 | Mốc phát triển | Checklist vận động/ngôn ngữ/xã hội theo tháng; cảnh báo chậm (red flag) |
| F8 | Nhắc việc | Cữ bú, uống vitamin D, tái khám, tiêm |
| F9 | Chia sẻ gia đình | Nhiều người chăm cùng 1 bé (sync) |
| F10 | Báo cáo đi khám | PDF 1 trang: biểu đồ, tiêm chủng, triệu chứng gần đây |
| F11 | Nhật ký ốm | Sốt, ho, tiêu chảy… timeline + trợ lý triage an toàn |
### V2
| F12 | Ăn dặm | Thực đơn theo tháng, theo dõi dị ứng thực phẩm mới (quy tắc 3 ngày) |
| F13 | Răng, giấc ngủ nâng cao, album kỷ niệm "mốc đầu đời" |
| F14 | Nhập bằng giọng nói tiếng Việt ("bé bú 120 ml lúc 3 giờ") → AI parse thành log |
| F15 | Bọc Capacitor → lên store, local notification, widget |

## 4. Roadmap (gợi ý, 1 dev + AI agent)
| Milestone | Thời gian | Nội dung |
|---|---|---|
| M0 | Tuần 1 | Setup repo, CI, i18n, DB schema, nạp knowledge |
| M1 | Tuần 2–3 | F1, F2, F5 |
| M2 | Tuần 4–5 | F3 (z-score engine + chart), F4 |
| M3 | Tuần 6–7 | F6 AI + guardrails, test an toàn |
| M4 | Tuần 8–10 | F7–F10, beta với 10–20 gia đình |
| M5 | Tuần 11–12 | F11, hardening, phát hành store |

## 5. KPI
- Thời gian nhập 1 log trung vị ≤ 5s; ≥ 70% user log ≥ 4 ngày/tuần
- 100% mũi tiêm có nhắc; 0 sự cố AI đưa liều thuốc

## 6. Rủi ro
| Rủi ro | Giảm thiểu |
|---|---|
| AI tư vấn sai → hại bé | Guardrails, RAG chỉ trên knowledge đã verify, disclaimer, red-flag rule cứng (không qua LLM) |
| Lịch tiêm thay đổi theo năm | `knowledge/vaccines` có `version`, `source`, `effective_date`; cập nhật OTA |
| Pháp lý dữ liệu sức khỏe (Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân) | Consent rõ ràng, local-first, mã hóa, cho phép xóa toàn bộ |
| IndexedDB bị trình duyệt xóa | persist() + backup JSON + sync M4 |
| Không phải thiết bị y tế | Ghi rõ "tham khảo, không thay thế bác sĩ" |
