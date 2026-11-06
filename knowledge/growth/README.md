# Chuẩn tăng trưởng
Nguồn: WHO Child Growth Standards (2006) – bảng LMS 0–24 tháng (theo ngày), Bộ Y tế VN áp dụng.
Chỉ số: weight-for-age, length-for-age, weight-for-length, BMI-for-age, head-circumference-for-age; theo giới.

**KHÔNG nhập tay số liệu.** Chạy `python scripts/fetch_who_lms.py` để tải bảng LMS chính thức từ trang WHO
(https://www.who.int/tools/child-growth-standards/standards), convert sang `who_lms_<indicator>_<sex>.json`:
`[{ "day": 0, "L": ..., "M": ..., "S": ... }, ...]` và ghi `source_url`, `downloaded_at`.
