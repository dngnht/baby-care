# Progress

- **T001** — Scaffold `apps/web`: Vite + React 18 + TS strict, Tailwind v4, React Router, i18n `t(key)`, ESLint flat config, Vitest (jsdom), `vite-plugin-pwa` (manifest VI, icon PNG thật, autoUpdate).
- Thêm `vercel.json` (SPA rewrite, cache header) và `.github/workflows/ci.yml` (Node 20: npm ci → lint → tsc → test → build).
- Màn hình chào `/` tối giản tiếng Việt, toàn bộ copy lấy từ `vi.json`; màu/typography khai báo bằng `@theme`.
- Đã pass `npm run lint`, `npx tsc --noEmit`, `npm test -- --run`, `npm run build`.
- Chưa deploy Vercel thật (không có credentials) — chỉ cấu hình sẵn, cần nối repo với Vercel để có preview URL test trên điện thoại.
- **T002** — `core/db/schema.ts`: Dexie `version(1)` cho `babies`, `logs`, `measurements`, `vaccineDoses`, `milestoneChecks`; index compound `[babyId+startAt]`, `[babyId+date]`, `[babyId+dueDate]`; `MilestoneCheck` dùng khoá `[babyId+milestoneId]`.
- `core/db/repo.ts`: `createRepo(dbName)` cho DB độc lập (test) + các hàm mặc định dùng DB `beyeu`; CRUD Baby/Log/Measurement/VaccineDose/Milestone, `updateLog` cho sửa/undo, `destroy()` để dọn test.
- Thời gian lưu dạng ISO 8601 UTC (`Date#toISOString`), input nhận `Date`; id sinh bằng `crypto.randomUUID()`; `listLogs` lọc inclusive và trả mới nhất trước.
- Test `repo.test.ts` (8 case, `fake-indexeddb/auto`, mỗi test một DB riêng) pass cùng `npx tsc --noEmit` và `npm run lint`.
- **T003** — `core/i18n`: key type-safe từ `vi.json`, `t(key, { name })` nội suy `{name}`, fallback trả key + `console.warn` khi thiếu (DEV); `dictionaries` dạng `Record<Locale, Messages>` nhưng chỉ ship `vi`.
- `vi.json` nhóm lại theo `app.*`, `common.*`, `welcome.*`, `home.*`, `band.*` + `disclaimer`; giữ nguyên toàn bộ key/giá trị cũ, thêm nhóm `common.*` (gồm `common.unverified` cho T024).
- Rule ESLint nội bộ `eslint-rules/no-hardcoded-string.js`: chặn JSXText có chữ cái, literal ở attribute UI (`placeholder`, `title`, `alt`, `aria-*`, `label`), literal render trực tiếp trong JSX, và chuỗi tiếng Việt trong `alert/confirm/prompt`; miễn trừ `src/core/i18n/**` + test.
- Rule bật mức `error` qua plugin local `beyeu` trong `eslint.config.js`; test `RuleTester` (10 valid + 10 invalid) chạy trong Vitest.
- Pass `npm run lint`, `npx tsc --noEmit`, `npm test -- --run` (36 test), `npm run build`.

- **T004** — `scripts/fetch_who_lms.py` viết lại: tải 10 workbook "expanded tables" (z-score) thật từ CDN WHO, cache `scripts/.cache/who/` (đã gitignore), parse sheet đầu bằng `openpyxl`, tự nhận header `Day`/`Length`/`Height` + `L/M/S`.
- Sinh `knowledge/growth/who_lms_<indicator>_<sex>.json` (wfa/lhfa/hcfa: 732 dòng day 0–731; wfl 651 dòng 45–110 cm; wfh 551 dòng 65–120 cm), kèm `source_url`, `source_sha256`, `downloaded_at`, `verified: false`.
- Script tự kiểm chứng: `SD0 ≈ M` và `z(SD±2) = ±2` từ chính cột SD trong file WHO (sai số ≤ 0,0028 z); exit ≠ 0 khi thiếu cột, M/S ≤ 0, NaN, dimension trùng/không liền mạch.
- Kiểm tra chéo độc lập 4 file với `.xlsx` gốc: 0 dòng lệch; mốc wfa boys day 0/365/730 đã ghi trong `knowledge/growth/README.md`.
- Ghi chú cho T005: lhfa day 731 là chuẩn *height* (giảm 0,67 cm so với day 730) do WHO đổi cách đo ở 24 tháng; toàn bộ dữ liệu vẫn `verified: false` chờ review y khoa.

- **T004b** — `src/core/standards/__tests__/zscore.test.ts` (45 test + 1 todo): `zFromLMS` trả 0 khi x = M trên toàn bộ 6.796 dòng của 10 bộ LMS, log branch khi L = 0, biên `classify` (-3.01/-3/-2/2/3/3.01) và `correctedAgeDays` (32w→44, 38w/40w/37w không hiệu chỉnh, clamp 0).
- Đối chiếu bảng SD WHO: đọc trực tiếp `scripts/.cache/who/*.xlsx` bằng `xlsx` (devDependency mới) — 4 bộ `wfa_boys`/`lhfa_boys`/`wfl_girls`/`wfh_boys` × 3 mốc × 7 cột SD (`SD4neg…SD4`) khớp trong 0.01 z (max 0.00269); đọc JSON bằng `node:fs` + `node:path` để không phụ thuộc absolute path và không bị Vite rewrite.
- Vùng ngoài ±3 SD: `SD4 → ∓4`, trung điểm SD3–SD4 → ±3.5 (liên tục, tuyến tính) và z đơn điệu tăng qua cả 7 cột; khối này `describe.skipIf` khi máy sạch không có cache `.xlsx` (ở đây chạy thật, 24 test pass).
- Pass `npm test -- --run` (80 test, 1 todo), `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- Ghi `tasks/QUESTIONS.md`: (Q1) `classify` coi z = ±3 là `low`/`high`, cần T005 chốt ngưỡng "severe" bao gồm hay loại trừ mốc; (Q2) `zFromLMS` trả `NaN` khi L = 0 và |z| > 3 (không dữ liệu WHO nào có L = 0 nên chưa ảnh hưởng) — engine không sửa, khoá bằng `it.fails`/`it.todo`.
- **T004b (hardening)** — Commit fixture `knowledge/growth/who_sd_anchors.json` (12 anchor: wfa_boys/lhfa_boys day 0/365/730, wfl_girls 45/65/110 cm, wfh_boys 65/90/120 cm; đủ `L/M/S` + 9 cột SD), sinh bằng `python3 scripts/fetch_who_lms.py --anchors` từ chính `.xlsx` WHO; script đọc lại workbook và assert từng ô trước khi ghi, dùng cache nếu có và không đụng 10 file `who_lms_*.json`.
- `zscore.test.ts`: khối đối chiếu SD giờ đọc fixture đã commit và **luôn chạy** (thiếu file ⇒ FAIL, không skip); khối so `.xlsx` chuyển thành extra, chỉ skip khi thiếu cache. Không đổi `zscore.ts`, giữ ngưỡng 0.01.
- Đã chạy lại test khi **không có** cache: 45 pass | 12 skip (toàn bộ là khối extra `.xlsx`) | 1 todo — 25 test SD anchors vẫn pass; có cache: 57 pass | 1 todo. Pass `npm test -- --run`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

- **T006** — `core/platform`: `notify.ts` (permission + `show()` ưu tiên ServiceWorker `showNotification`, fallback `new Notification`, không throw khi thiếu API/bị chặn), `share.ts` (`canShare`/`shareText`/`shareFile`, `AbortError → cancelled`, fallback `downloadFile` qua Blob + `<a download>`), `storage.ts` (`persist`/`persisted`/`estimate`, thiếu API → `false`/`null`); barrel `platform/index.ts`.
- `core/db/backup.ts`: `exportBackup` đọc 5 bảng, sắp xếp ổn định (id / startAt / date / dueDate / babyId+milestoneId), `counts` tính lại; `parseBackup` validate chặt (`app`, `formatVersion`, đủ 5 mảng, khoá bắt buộc, ISO 8601 + chặn ngày không tồn tại như 2026-02-30) → `BackupValidationError` message tiếng Anh.
- `importBackup` chạy trong 1 Dexie transaction 5 bảng: `replace` clear rồi ghi, `merge` `bulkPut` (upsert) không xoá dữ liệu cũ; `skipped` = bản ghi trùng khoá *trong chính file* (giữ bản cuối); `downloadBackup` + `suggestBackupFilename` (`beyeu-backup-YYYY-MM-DD.json`, UTC).
- Test mới: `platform/__tests__/{notify,share,storage}.test.ts` (30 test, mock `Notification`/`navigator.share|canShare|storage`/`URL.createObjectURL` + anchor click) và `db/__tests__/backup.test.ts` (11 test, DB uuid riêng + `destroy` sau mỗi test, export → xoá DB → import replace, merge/upsert/skip, reject JSON sai, round-trip).
- Pass `npm test -- --run` (97 test + 24 skip + 1 todo), `npx tsc --noEmit`, `npm run lint`, `npm run build`; backup hiện là **plaintext** (TODO mã hoá ở T045) — đã ghi `tasks/QUESTIONS.md` Q3.

- **Fix Q2** — `zFromLMS` (`core/standards/zscore.ts`): ngoài ±3 SD dùng giới hạn WHO `sd(k) = M * exp(S * k)` khi `L === 0` (trước đó `Math.pow(1, Infinity)` → `NaN`); nhánh `L ≠ 0`, z trong ±3 SD, `classify`, `correctedAgeDays` giữ nguyên, chữ ký hàm không đổi.
- `zscore.test.ts`: bỏ `it.fails`, thêm 3 test thật (`L = 0 beyond ±3 SD`): z ngoài ±3 SD hữu hạn ≈ công thức tuyến tính WHO; biên `sd(3)`/`sd(-3)` = ±3 và `sd(4)`/`sd(-4)` đúng công thức ngoại suy (sai số ≤ 0.01, vì WHO ngoại suy tuyến tính nên `sd(4)` ≈ 4.105 với M=10, S=0.1); nhánh log trong ±3 SD không đổi.
- Anchor `knowledge/growth/who_sd_anchors.json` vẫn chạy đủ, không skip; `tasks/QUESTIONS.md` Q2 → ĐÃ SỬA (2026-11-08), Q1 vẫn chờ T005.

- **T010** — `features/profile/logic/age.ts`: `parseBirthDate` (YYYY-MM-DD → Date local 00:00, loại rỗng/sai/ngày không tồn tại/tương lai), `validateGestationalWeeks` (số nguyên 22–42), `describeAge` → `{ days, correctedDays, isPremature }` dùng `correctedAgeDays` của `core/standards/zscore` (không chép lại công thức/ngưỡng 37; `isPremature` đọc từ chính hàm đó). Test `logic/__tests__/age.test.ts`: 18 case.
- `pages/OnboardingPage.tsx`: form mobile-first 390×844 (Screen/Button/Card, font display, tông night/honey) 4 trường — tên (maxLength 30), giới tính (2 nút `aria-pressed`), ngày sinh (`max` = hôm nay), tuần thai (22–42, mặc định 40 + hint); lỗi inline qua `onboarding.error.*`, footer `onboarding.privacy`, nút disable khi đang lưu.
- Submit `getRepo().createBaby({ name: name.trim(), sex, birthDate, gestationalWeeks })` → `useActiveBaby.setBaby` → `navigate('/', { replace: true })`; có hồ sơ sẵn (`status === 'ready'`) thì `<Navigate to="/" replace />`. Card preview `AgePreview` hiện "Bé … ngày tuổi" + "Tuổi hiệu chỉnh: … ngày" + `profile.prematureNote` khi non tháng.
- Thêm key `onboarding.error.sex` (namespace có sẵn); xoá `features/home/pages/WelcomePage.tsx` (dead code, key `welcome.*` giữ nguyên). Kiểm chứng: 150 test pass (12 skip, 1 todo), `tsc --noEmit`, `lint`, `build` sạch; preview 390×844 xác nhận redirect `/` → `/onboarding`, không tràn ngang, submit ghi đúng bản ghi IndexedDB.

## M1 — Ghi nhận
- T011: `features/home` — lưới 6 ô (Bú/Ăn/Tã/Ngủ/Nhiệt/Khác), tap = `buildQuickLog` + `addLog`, giữ 450ms mở sheet 2 trường, toast undo 5s (`deleteLog`); logic thuần + 14 test.
- T012: `features/timer` — timer nằm hoàn toàn trong DB (LogEntry chưa `endAt` + payload `{timer:'running'}`), `loadRunningTimer` khôi phục sau reload, stop ghi `endAt`; hook `useTimer` + `TimerStrip`; 21 test.
- T013: `features/timeline` — timeline theo ngày (local), `applyTimeChange` giữ ngày & chỉnh endAt hợp lệ, sheet sửa/xoá có confirm inline; 13 test.
- T014: `features/dashboard` — parser bảng `knowledge/care/feeding_sleep_reference.md` (`?raw`, không copy số), metrics 24h; `verified:false` → badge "Đang chờ xác minh", không tô màu cảnh báo; 36 test.
- Tích hợp: `TimerStrip` gắn vào HomePage (refresh khi start/stop); `vite.config.ts` cho dev server đọc `knowledge/**`; Docker preview đổi build context = repo root để đóng gói knowledge.
- Kiểm chứng: 243 unit test pass (12 skip chỉ là khối so `.xlsx` cache), tsc/lint/build sạch; E2E Playwright 390×844: 22/22 (onboarding → home → 1 chạm → undo → timer reload → timeline sửa/xoá → dashboard).

## M2 — Chuẩn & tiêm
- Dùng chung: `core/standards/lms.ts` (8 bảng WHO, tra theo ngày/chiều dài) + `core/standards/growth.ts` (`zForMeasurement`, `zForWeightForLength` với tuổi hiệu chỉnh), `ui/UnverifiedBadge`, route lazy `/growth` `/vaccines`, bottom nav 5 tab.
- T020: form số đo (ngày/cân/dài/đầu, bỏ trống được), band pill + z, lịch sử 20 lần; `bandPresentation` trả neutral khi `verified:false` nên không bao giờ tô đỏ trước T005.
- T021: 7 đường SD −3…+3 (LMS downsample 7 ngày, xử lý L=0), scatter điểm của bé + tooltip z; sửa lỗi trục Y bị cắt số (margin trái) phát hiện khi review ảnh.
- T022: `assessVelocity` xét cặp liền kề, ngưỡng 0.67 SD đặt tên + TODO chuyển vào knowledge; unverified → không cảnh báo.
- T023: lịch 16 mũi TCMR sinh từ ngày sinh (ageDays/ageMonths lịch/afterPrevDays), merge giữ `givenDate`, đánh dấu đã tiêm, xuất .ics (RFC 5545, VALARM −3d/−1d), nhắc qua `core/platform`; dịch vụ + mục chờ xác minh chỉ hiển thị, không tự sinh ngày.
- T024: badge "Đang chờ xác minh" phủ growth/chart/velocity/vaccines.
- Kiểm chứng: 344 unit test pass, tsc/lint/build sạch; E2E Playwright 390×844 23/23 (thêm số đo → z/band/chart/velocity, đổi chỉ số, lịch tiêm, đánh dấu đã tiêm, tải .ics, nhắc lịch an toàn).

## M4 — Mở rộng
- Nền chung: Dexie **v2** thêm bảng `reminders` (`id, babyId, at, [babyId+at]`), repo CRUD; backup **v2** gồm reminders nhưng vẫn đọc file v1; route `/more` + 5 trang lazy; nút "Khác" ở header Home.
- Đồng bộ dữ liệu lịch tiêm: `knowledge/vaccines/vn_schedule.json` đã đổi (TT52/2025, 18 mũi, ROTA trong TCMR, `afterPrevDaysMin`, `maxAge*`, `optional_service` dạng object) → cập nhật `schedule.ts` + page + 5 test kỳ vọng.
- T040: `features/milestones` — trạng thái achieved/not_yet/red_flag, ngưỡng từ file, mark/undo.
- T041: `features/reminders` — nhóm quá hạn/hôm nay/sắp tới/đã xong, lặp daily/weekly, sheet thêm, xoá có xác nhận, thông báo khi đã granted.
- T043: `features/report` — `buildReportData` (hồ sơ, tăng trưởng + z, tiêm chủng, 48h), `report.css` cho `window.print`.
- T044: `features/illness` — lọc 14 ngày, payload nhiệt độ 34–42 °C, tóm tắt, disclaimer trung tính.
- T045: `features/privacy` — consent, export/import backup, persist, xoá sạch DB + về `/onboarding`.
- Sửa lỗi phát sinh khi thêm optional birthWeight: `parseBaby` trong backup dùng `optionalNumber` (trước đó export/import hồ sơ onboarding bị chặn).
- Kiểm chứng: 456 unit test pass, tsc/lint/build sạch; E2E Playwright 390×844 **28/28** (more → milestones mark/undo → reminders add/done → illness temp → report → privacy consent/export/wipe).

## Bổ sung — So sánh 7 ngày (Dashboard)
- `dashboard/logic/dailyTotals.ts`: tổng theo từng ngày local (sữa bình ml, cữ bú mẹ/bình, tã tổng/ướt/bẩn, phút ngủ, ăn dặm). Giấc ngủ **chia theo nửa đêm** (22:00→02:00 = 120' mỗi ngày) để so sánh công bằng; ngày trống vẫn có hàng 0.
- `dashboard/components/DailyComparison.tsx`: 3 tab chỉ số (Sữa bình/Giấc ngủ/Tã), bar chart 7 ngày + đường trung bình 6 ngày hoàn tất, giá trị hôm nay, delta so với hôm qua, danh sách 7 ngày kèm delta từng ngày.
- `DashboardPage` tải 7 ngày (card 24h vẫn lọc đúng 24h); empty state dựa trên cả tuần thay vì riêng hôm nay.
- Không dùng ngưỡng y tế nào trong mục này; sữa mẹ không quy đổi ml (chỉ đếm cữ) để không bịa số.
- Kiểm chứng: 11 test logic + 2 test render SSR (tổng dashboard 49 test, toàn bộ 469 pass), tsc/lint/build sạch; E2E Playwright chưa chạy được trong phiên này vì tải Chromium bị ECONNRESET.

## Điều chỉnh Home — Bú bình lên phím chính
- Lưới 6 nút đổi thành: Bú mẹ · **Bú bình** · Tã / Ngủ · Ăn · Khác; "Nhiệt độ" chuyển vào sheet "Khác" (vốn đã cần sheet để nhập số).
- 1 chạm Bú bình ghi ngay với `amountMl` của lần bú bình gần nhất; nếu chưa có lần nào thì mở sheet hỏi lượng (`shouldAskAmount`) thay vì ghi log rỗng.
- Giữ nguyên giữ-450ms để sửa lượng; `MORE_TYPES` giờ là Nhiệt độ/Thuốc/Triệu chứng/Ghi chú.
- Kiểm chứng: 17 test home (thêm 3 test `shouldAskAmount`), toàn bộ 472 pass, tsc/lint/build sạch; bundle phục vụ có "Bú bình" và "Nhiệt độ".

## Home — Ghi bù + Nhắc cữ
- **Ghi bù** (`home/logic/backfill.ts`, `components/BackfillSheet.tsx`): sheet điền sẵn giờ (2 giờ trước, làm tròn 5 phút) và lượng bú bình lần trước; chọn Bú mẹ/Bú bình/Tã/Ngủ, sửa giờ, lượng, bên bú, loại tã, thời lượng ngủ. Không cho chọn giờ tương lai; ngủ suy ra `endAt` từ thời lượng. Không có lịch sử bình thì để trống lượng (không bịa 0).
- **Nhắc cữ** (`home/logic/reminderSettings.ts`, `components/ReminderSettingsCard.tsx`): 2 công tắc bật/tắt (cữ bú, thay tả) + nhịp 2/3/4/5 giờ, lưu localStorage `beyeu.reminderSettings.v1`, mặc định TẮT. Khi quá nhịp so với log cuối → banner "Đến giờ rồi" kèm "Ghi ngay"; nếu đã cấp quyền thông báo thì bắn 1 notification mỗi chu kỳ (không tự xin quyền). Copy ghi rõ "nhắc theo nhịp bạn đặt, không phải lịch y tế".
- Kiểm chứng: 13 test reminderSettings + 12 test backfill + 4 test render SSR (tổng home 46, toàn bộ **501 pass**), tsc/lint/build sạch; bundle phục vụ có "Ghi bù"/"Nhắc cữ"/"Đến giờ rồi".

## Đăng nhập người chăm sóc (local)
- `features/auth`: roster nhiều người chăm sóc trên cùng thiết bị, PIN 4–6 số hash PBKDF2-SHA256 (120k vòng, salt riêng mỗi người, lưu localStorage `beyeu.caregivers.v1`), session 30 ngày nếu bật "giữ đăng nhập".
- `/welcome` tạo người đầu tiên; `AppLayout` chặn theo thứ tự: chưa có người → `/welcome`, chưa mở khoá → LockScreen (danh sách người + PIN), rồi mới tới hồ sơ bé và các tab.
- `/caregivers` (trong Khác): thêm/xoá người (không xoá người cuối), bật/tắt giữ đăng nhập, khoá ngay.
- `createdBy` của log giờ là tên người đang đăng nhập (home quick log, ghi bù, timer, nhật ký ốm); chưa đăng nhập thì `parent`.
- Giới hạn đã biết: đây là khoá cục bộ, không phải tài khoản máy chủ; dữ liệu vẫn theo từng máy; chưa có giới hạn số lần nhập sai; muốn đồng bộ nhiều máy cần T042 Supabase Auth.
- Kiểm chứng: 5 test hash PIN + 9 test roster/session + 8 test store (tổng 523 test pass), tsc/lint/build sạch.
