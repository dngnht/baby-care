# Chuẩn tăng trưởng (WHO Child Growth Standards)

Nguồn: **WHO Child Growth Standards (2006)** — bảng *expanded tables* dạng z-score (LMS),
một dòng cho mỗi ngày tuổi (chỉ số theo tuổi) hoặc mỗi 0,1 cm (weight-for-length/height).
Bộ Y tế VN áp dụng cùng bộ chuẩn này cho trẻ 0–24 tháng.

Toàn bộ số liệu trong thư mục này được **tải tự động** từ WHO bằng
`scripts/fetch_who_lms.py` — **KHÔNG nhập tay, KHÔNG nội suy, KHÔNG tự sinh số**.
Mỗi file JSON ghi lại `source_url` và `source_sha256` (băm của đúng file `.xlsx` đã parse)
để truy vết.

> ⚠️ **`verified: false`** — dữ liệu đã tải thật nhưng **chưa được bác sĩ review** (task **T005**,
> việc của NGƯỜI). Theo `AGENTS.md`, mọi UI đọc dữ liệu này phải hiển thị nhãn
> "Đang chờ xác minh" và **không dùng để cảnh báo đỏ** (T024). Script không bao giờ tự đặt
> `verified: true`.

## Danh sách file (10 file = 5 chỉ số × 2 giới)

| File | Indicator | Giới | `dimension` | Đơn vị | Số dòng | Khoảng | `source_sha256` (12 ký tự) |
|---|---|---|---|---|---|---|---|
| `who_lms_wfa_boys.json` | `wfa` weight-for-age | boys | `day` | kg | 732 | 0–731 ngày | `b5b4748c6bfa` |
| `who_lms_wfa_girls.json` | `wfa` weight-for-age | girls | `day` | kg | 732 | 0–731 ngày | `ee3ae12cb96c` |
| `who_lms_lhfa_boys.json` | `lhfa` length/height-for-age | boys | `day` | cm | 732 | 0–731 ngày | `c4b1c9029ab9` |
| `who_lms_lhfa_girls.json` | `lhfa` length/height-for-age | girls | `day` | cm | 732 | 0–731 ngày | `6aa287631944` |
| `who_lms_hcfa_boys.json` | `hcfa` head-circumference-for-age | boys | `day` | cm | 732 | 0–731 ngày | `89a657bc466e` |
| `who_lms_hcfa_girls.json` | `hcfa` head-circumference-for-age | girls | `day` | cm | 732 | 0–731 ngày | `8eec3770d102` |
| `who_lms_wfl_boys.json` | `wfl` weight-for-length | boys | `length_cm` | kg | 651 | 45,0–110,0 cm | `1a6e9a002d26` |
| `who_lms_wfl_girls.json` | `wfl` weight-for-length | girls | `length_cm` | kg | 651 | 45,0–110,0 cm | `ec116b8e618a` |
| `who_lms_wfh_boys.json` | `wfh` weight-for-height | boys | `height_cm` | kg | 551 | 65,0–120,0 cm | `ed3b590f9c65` |
| `who_lms_wfh_girls.json` | `wfh` weight-for-height | girls | `height_cm` | kg | 551 | 65,0–120,0 cm | `fca340d5f04a` |

Chưa có **BMI-for-age** (ngoài phạm vi T004) — nếu cần thì bổ sung sau theo cùng script.

## Định dạng JSON

```json
{
  "indicator": "wfa",
  "indicator_name": "weight-for-age",
  "sex": "boys",
  "dimension": "day",
  "unit": "kg",
  "age_max_days": 731,
  "source_url": "https://cdn.who.int/.../wfa-boys-zscore-expanded-tables.xlsx?sfvrsn=65cce121_10",
  "source_sha256": "b5b4748c6bfa…",
  "downloaded_at": "2026-11-06",
  "verified": false,
  "data": [{ "day": 0, "L": 0.3487, "M": 3.3464, "S": 0.14602 }]
}
```

- `dimension`: `day` (wfa/lhfa/hcfa) — key bản ghi là `day` (0…731, đủ 24 tháng);
  `length_cm` (wfl) — key `lengthCm`; `height_cm` (wfh) — key `heightCm`.
- Với wfl/wfh, WHO phân theo chiều dài/chiều cao chứ **không theo tuổi** →
  `age_max_days` là `null`.
- `L`, `M`, `S` giữ **nguyên độ chính xác** của file nguồn (không làm tròn thêm).
- Đơn vị: cân nặng `kg`, chiều dài/chiều cao/vòng đầu `cm`.

## URL nguồn (WHO, mở được 200)

Trang chỉ số (chứa link tải): <https://www.who.int/tools/child-growth-standards/standards>

| Chỉ số | File nguồn (expanded, z-score) |
|---|---|
| wfa | `.../indicators/weight-for-age/expanded-tables/wfa-{boys,girls}-zscore-expanded-tables.xlsx` |
| lhfa | `.../indicators/length-height-for-age/expandable-tables/lhfa-{boys,girls}-zscore-expanded-tables.xlsx` |
| hcfa | `.../indicators/head-circumference-for-age/expanded-tables/hcfa-{boys,girls}-zscore-expanded-tables.xlsx` |
| wfl | `.../indicators/weight-for-length-height/expanded-tables/wfl-{boys,girls}-zscore-expanded-table.xlsx` |
| wfh | `.../indicators/weight-for-length-height/expanded-tables/wfh-{boys,girls}-zscore-expanded-tables.xlsx` |

(tiền tố đầy đủ: `https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators`,
kèm tham số `?sfvrsn=…` — xem `source_url` trong từng file JSON. Lưu ý lhfa dùng thư mục
`expandable-tables` và wfl dùng tên `…-expanded-table.xlsx` (số ít) — đây là đường dẫn thật của WHO.)

## Chạy lại

```bash
python3 scripts/fetch_who_lms.py                    # tải đủ 10 file vào knowledge/growth
python3 scripts/fetch_who_lms.py --only wfa_boys    # một file (nhận danh sách phân cách phẩy)
python3 scripts/fetch_who_lms.py --force            # bỏ cache, tải lại
python3 scripts/fetch_who_lms.py --out knowledge/growth --cache scripts/.cache/who
python3 scripts/fetch_who_lms.py --anchors          # sinh lại fixture SD anchors (mục dưới)
```

- Cần `requests` + `openpyxl` (`pip install requests openpyxl`).
- File `.xlsx` tải về nằm trong `scripts/.cache/who/` — **đã gitignore** (`.gitignore` dòng `.cache/`),
  không commit; chỉ JSON đã convert nằm trong `knowledge/`.
- Script **exit ≠ 0** nếu: thiếu file, thiếu cột `L/M/S`, `M ≤ 0`, `S ≤ 0`, có NaN,
  giá trị dimension trùng/không liền mạch/không đúng khoảng chuẩn, hoặc LMS không tái tạo được
  chính các cột SD trong file nguồn (dung sai 0.01 z).

## Fixture `who_sd_anchors.json` (commit được, cho test luôn chạy)

`scripts/.cache/who/*.xlsx` nằm trong `.gitignore`, nên trên CI/máy sạch không có file gốc WHO.
Để Acceptance Criteria "so với bảng SD WHO, sai số ≤ 0.01" **luôn được kiểm chứng**, repo commit
thêm `knowledge/growth/who_sd_anchors.json`: một fixture nhỏ chứa **nguyên văn** cột SD của WHO
cho 12 dòng mốc, trích từ chính các `.xlsx` đã tải — **không nhập tay, không nội suy**.

| Bộ (`key`) | `dimension` | Mốc | Số anchor |
|---|---|---|---|
| `wfa_boys` | `day` | 0, 365, 730 | 3 |
| `lhfa_boys` | `day` | 0, 365, 730 | 3 |
| `wfl_girls` | `length_cm` | 45,0 / 65,0 / 110,0 cm | 3 |
| `wfh_boys` | `height_cm` | 65,0 / 90,0 / 120,0 cm | 3 |

Mỗi anchor gồm `key`, `indicator`, `sex`, `dimension`, giá trị dimension (`day` / `lengthCm` /
`heightCm`), `L`, `M`, `S` và đủ 9 cột SD: `sd4neg, sd3neg, sd2neg, sd1neg, sd0, sd1, sd2, sd3, sd4`.

```json
{
  "_comment": "SD anchors extracted verbatim from the WHO … workbooks …",
  "source": "WHO Child Growth Standards (2006) expanded tables",
  "generated_by": "scripts/fetch_who_lms.py --anchors",
  "generated_at": "2026-11-06T16:41:32+00:00",
  "verified": false,
  "anchors": [
    {
      "key": "wfa_boys", "indicator": "wfa", "sex": "boys", "dimension": "day",
      "day": 0, "L": 0.3487, "M": 3.3464, "S": 0.14602,
      "sd4neg": 1.701, "sd3neg": 2.08, "sd2neg": 2.459, "sd1neg": 2.881,
      "sd0": 3.346, "sd1": 3.859, "sd2": 4.419, "sd3": 5.031, "sd4": 5.642
    }
  ]
}
```

**Sinh lại:**

```bash
python3 scripts/fetch_who_lms.py --anchors                  # mặc định knowledge/growth/who_sd_anchors.json
python3 scripts/fetch_who_lms.py --anchors /tmp/anchors.json # đích khác
```

- Dùng lại `scripts/.cache/who/*.xlsx` nếu có; chỉ tải khi cache thiếu (hoặc khi `--force`).
  Chỉ 4 workbook của 4 bộ trên được đọc — **không** ghi đè 10 file `who_lms_*.json`.
- Script **đọc lại workbook lần hai** và assert từng ô (`L/M/S` + 9 cột SD) khớp đúng giá trị
  trước khi ghi file; lệch → `exit ≠ 0`, không ghi fixture.
- `generated_at` đổi theo thời điểm chạy (UTC); đây là thay đổi duy nhất khi sinh lại trên cùng
  bộ workbook. `verified` luôn `false` cho tới khi T005 review xong.
- Test `apps/web/src/core/standards/__tests__/zscore.test.ts` **bắt buộc** đọc file này: thiếu file
  ⇒ test FAIL (không skip). Khối so với `.xlsx` chỉ còn là kiểm tra **extra**, tự skip khi thiếu cache.

## Kiểm chứng (T004, dùng tiếp cho T004b)

Mỗi lần chạy, script đối chiếu LMS với cột SD có sẵn trong chính file WHO:
`SD0 ≈ M` (làm tròn 3 chữ số) và `z(SD-2) = -2`, `z(SD+2) = +2` (sai số lớn nhất quan sát được
≤ 0,0028 z trên cả 10 file). Ngoài ra đã kiểm tra chéo độc lập 4 file (wfa_boys, lhfa_boys,
wfl_girls, wfh_boys): **0 dòng lệch** so với ô trong `.xlsx`; 12 anchor trong
`who_sd_anchors.json` khớp từng ô (fixture được sinh và assert bởi `--anchors`).

Mốc tham chiếu `wfa` **boys** (lấy từ JSON): day 0 → `L=0.3487, M=3.3464, S=0.14602`
(SD0 nguồn 3.346 kg); day 365 → `L=0.0645, M=9.6460, S=0.10925` (SD0 9.646 kg);
day 730 → `L=-0.0136, M=12.1482, S=0.11425` (SD0 12.148 kg).

## Lưu ý dữ liệu cho T005 (review y khoa)

1. **lhfa có bước nhảy ở day 731**: WHO chuyển từ *chiều dài nằm* (0–24 tháng) sang
   *chiều cao đứng* (≥ 24 tháng), chênh lệch −0,67 cm (boys: day 730 M=87,8018 →
   day 731 M=87,1303). File JSON lấy đúng `Day ≤ 731` theo phạm vi T004, nên dòng cuối
   (day 731) là chuẩn *height*. Khi hiển thị/so sánh cho trẻ < 24 tháng cần lưu ý điểm này.
2. wfl chỉ có 45–110 cm, wfh chỉ có 65–120 cm — số đo ngoài khoảng này không tính được z-score.
3. Ngưỡng/band màu, cảnh báo đỏ: **chưa** được xác nhận y khoa cho tới khi T005 xong.
