# Nhập liệu tối giản (mobile web)

- Thiết kế mobile-first; nút ≥ 48px; dùng được 1 tay; bottom navigation.
- **Home = lưới 6 nút lớn**: Bú | Ăn | Tã | Ngủ | Nhiệt | Khác. 1 chạm = log giá trị mặc định (giờ hiện tại, lượng = lần trước).
- Nhấn giữ → bottom sheet chỉnh chi tiết (≤ 2 trường).
- Timer bú/ngủ: lưu `startAt` vào DB (không phụ thuộc tab còn mở), mở lại app vẫn đúng thời gian.
- PWA shortcuts (manifest) cho "Bú", "Tã" thay cho widget.
- Đo tăng trưởng: 1 màn, 3 ô số (`inputmode="decimal"`), cho bỏ trống.
- Nhập văn bản tự do → AI parse → xác nhận 1 chạm (giọng nói: Web Speech API nếu trình duyệt hỗ trợ).
- Undo 5 giây thay vì hộp thoại xác nhận. Chế độ tối ban đêm.
- Màu trạng thái luôn kèm chữ giải thích.
