# Câu hỏi cần người quyết định

## T004b — hai điểm cần chốt trong `core/standards/zscore.ts`

Engine chỉ được sửa **một chỗ** là Q2 (duyệt + sửa ngày 2026-11-08). Phần còn
chưa chốt (Q1) vẫn khoá bằng `it.todo` nên CI xanh; mọi phát hiện đều có test
tương ứng trong `src/core/standards/__tests__/zscore.test.ts`.

### Q1. `classify` xếp z = ±3.00 vào `low` / `high`, chỉ `|z| > 3` mới `severe`

Hành vi hiện tại:

| z | band |
|---|---|
| `z < -3` | `severe_low` |
| `-3 ≤ z < -2` | `low` |
| `-2 ≤ z ≤ 2` | `normal` |
| `2 < z ≤ 3` | `high` |
| `z > 3` | `severe_high` |

Tức trẻ đúng **-3.00 SD** đang bị xếp `low`, đúng **+3.00 SD** xếp `high`; mức
"severe" chỉ khi vượt qua ±3. Cách này đối xứng và khớp mốc ±3 SD của restricted
adjustment, nhưng một số bảng phân loại lâm sàng tô `≤ -3` / `≥ +3` là nặng.

**Cần T005 (review y khoa) chốt:** giữ `|z| > 3` hay đổi thành `z ≤ -3` / `z ≥ +3`.
Test tương ứng: `classify > T005: confirm whether the severe band should include the cut-off` (đang `it.todo`).

### Q2. `zFromLMS` trả `NaN` khi `L = 0` và `|z| > 3` — **ĐÃ SỬA 2026-11-08**

Người dùng đã duyệt sửa; engine đã sửa **chỉ trong hàm `zFromLMS`**
(`apps/web/src/core/standards/zscore.ts`) và hành vi mới được khoá bằng test thật
(không còn `it.fails`).

Trước khi sửa: vùng ngoài ±3 SD dùng `sd(k) = M * (1 + L*S*k) ** (1 / L)`. Với `L = 0`,
`1 / L = Infinity` và `Math.pow(1, Infinity) = NaN`, nên mọi giá trị |z| > 3 trả `NaN`.
Ví dụ: `zFromLMS(10 * Math.exp(0.4), { L: 0, M: 10, S: 0.1 })` → `NaN`.

Đã sửa: khi `L === 0`, dùng giới hạn toán học WHO `sd(k) = M * exp(S * k)` thay cho
`Math.pow(1, Infinity)`; nhánh `L ≠ 0` giữ nguyên. z ngoài ±3 SD vẫn tuyến tính theo WHO:
`z > 3 → 3 + (x - sd(3)) / (sd(3) - sd(2))`, `z < -3 → -3 + (x - sd(-3)) / (sd(-2) - sd(-3))`.
Không đổi chữ ký hàm, không đổi `classify` / `correctedAgeDays`.
Lưu ý: vì WHO ngoại suy tuyến tính từ SD2/SD3, điểm `sd(4)` của đường log-normal map thành
≈ 4.105 (với `M = 10, S = 0.1`) chứ không đúng bằng 4; test so với chính công thức WHO
(sai số ≤ 0.01) và kiểm tra thêm tính hữu hạn + đơn điệu.

- **Ảnh hưởng dữ liệu hiện tại: không.** Không dòng nào trong 10 file `knowledge/growth/*.json`
  có `L` đúng bằng 0; gần nhất là `wfa_boys` day 654 với `L = 0.0001` và engine vẫn cho kết quả
  đúng (SD4neg → -4.0005, SD4 → +3.9997). Sửa này chuẩn bị cho chỉ số có `L = 0`
  (ví dụ BMI-for-age).
- Test tương ứng: `zFromLMS > L = 0 beyond ±3 SD` — 3 test (ngoài ±3 SD hữu hạn; biên SD3,
  SD4, SD-3, SD-4; nhánh log trong ±3 SD không đổi).

### Ghi chú kiểm chứng (không phải câu hỏi)

Đối chiếu 4 bộ dữ liệu (`wfa_boys`, `lhfa_boys`, `wfl_girls`, `wfh_boys`) × 3 mốc mỗi bộ,
7 cột SD (`SD4neg … SD4`) đọc trực tiếp từ `scripts/.cache/who/*.xlsx`: sai lệch lớn nhất
**0.00269 z** (wfl_girls, lengthCm = 45, cột SD2neg), nằm trong ngưỡng 0.01 — engine khớp bảng WHO.

## T006 — Backup JSON đang là plaintext

`core/db/backup.ts` xuất **toàn bộ** dữ liệu bé ra một file JSON không mã hoá
(`beyeu-backup-YYYY-MM-DD.json`): tên bé, ngày sinh, cân nặng/chiều dài/vòng đầu,
lịch tiêm, log bú/ngủ/tã. Đây là dữ liệu sức khỏe trẻ em + PII, nên file backup
rời khỏi thiết bị là rủi ro thật (email, Zalo, Drive, máy tính dùng chung...).

T006 **không mã hoá** (chưa có key management) và đã ghi TODO ngay đầu file trỏ
tới M4/T045. Ba điểm cần người quyết định trước khi làm UI Xuất/Nhập:

1. **Có cho ship UI backup trước T045 không?** Nếu có, UI bắt buộc hiển thị cảnh
   báo "file chứa dữ liệu sức khỏe, hãy lưu nơi an toàn" + không tự upload.
   Nếu không, UI backup phải chờ mã hoá — nghĩa là giai đoạn M1–M3 không có cách
   sao lưu nào ngoài "đừng xoá dữ liệu trình duyệt" (`storage.persist()`).
2. **Khoá mã hoá lấy từ đâu?** Mật khẩu người dùng (PBKDF2/Argon2 → AES-GCM,
   file dùng được trên máy mới nhưng phải nhớ mật khẩu) hay khoá sinh trên thiết
   bị (WebCrypto non-extractable, không chuyển máy được → vô nghĩa với backup)?
   Đề xuất: mật khẩu người dùng, tối thiểu 8 ký tự, có nút "quên mật khẩu = mất file".
3. **Định dạng file khi mã hoá:** giữ nguyên 5 bảng và bọc phần `tables` bằng
   ciphertext (thêm `encrypted: true`, `kdf`, `iv`) rồi bump `BACKUP_FORMAT_VERSION = 2`;
   `parseBackup` vẫn đọc được file v1 để không mất backup cũ. Cần chốt trước khi
   có người dùng thật, vì đổi format sau đó phải hỗ trợ 2 phiên bản.

Ngoài ra (không cần quyết định, chỉ để biết): `suggestBackupFilename()` dùng ngày
**UTC** để tên file ổn định và test được; UI có thể hiển thị ngày local bên cạnh.

## T042 — Supabase sync gia đình (đang chặn)
Cần người cung cấp trước khi làm thật:
1. Supabase project (URL + `anon key`), hoặc quyết định tự host.
2. Bảng + RLS theo hộ gia đình (docs/02 mới có định hướng, chưa có DDL).
3. Cơ chế mời thành viên (mã mời? email?) và xung đột khi 2 người sửa cùng log.

Hiện app vẫn local-first; mục "Đồng bộ gia đình" trong `/more` chỉ hiển thị trạng thái chưa cấu hình.

## Ghi chú dữ liệu lịch tiêm (2026-11-09)
`knowledge/vaccines/vn_schedule.json` đã được cập nhật sang TT52/2025 (18 mũi TCMR, ROTA trong TCMR, `afterPrevDaysMin`, `maxAge*`) và đặt `verified: true`; `optional_service` vẫn `verified: false`. App đọc đúng cờ này — nếu cần giữ nhãn "Đang chờ xác minh" cho TCMR thì hạ `verified` về `false`.
