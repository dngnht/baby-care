# Architecture — Web-first (PWA) → bọc WebView sau

## Chiến lược
1. **Giai đoạn 1 – PWA**: React SPA, deploy static + serverless lên Vercel. Mở bằng link, "Thêm vào màn hình chính" để dùng như app. Không cần store, không cần build native.
2. **Giai đoạn 2 – WebView**: bọc cùng code bằng **Capacitor** → APK/IPA khi cần lên store / cần notification ổn định. Không viết lại UI.

## Tech stack
| Lớp | Chọn | Lý do |
|---|---|---|
| Framework | Vite + React 18 + TypeScript | Build nhanh, SPA tĩnh, AI agent viết tốt |
| UI | Tailwind CSS + shadcn/ui, mobile-first (thiết kế cho màn 360–430px) | |
| Routing | React Router | |
| State | Zustand | Đơn giản |
| DB local | **IndexedDB qua Dexie.js** (+ `dexie-react-hooks`) | Offline, chạy được cả trong WebView |
| PWA | `vite-plugin-pwa` (Workbox) | Offline, cài lên màn hình chính |
| Chart | Recharts | Vẽ đường chuẩn SD |
| Serverless | Vercel Functions trong `apps/web/api/` | AI proxy, giữ API key |
| Sync (tùy chọn, M4) | Supabase (Auth + Postgres + RLS) | Chia sẻ gia đình |
| Test | Vitest + fake-indexeddb; Playwright (E2E, viewport mobile) | |
| Wrap native (GĐ2) | Capacitor + @capacitor/local-notifications | |

> Không thêm thư viện ngoài bảng này nếu chưa được đồng ý.

## Luồng
```
[Quick Log UI] → [Dexie/IndexedDB] → [Standards Engine (knowledge/)] → [Dashboard/Recharts]
                                   ↓ summary (không PII)
          fetch /api/ai → [Red-flag rule] → [LLM + RAG] → [Guardrails post] → UI
```

## Cấu trúc
```
apps/web/
  index.html, vite.config.ts
  public/            icons, manifest
  api/               ai.ts (Vercel Function)
  src/
    core/db          Dexie schema + repo
    core/standards   z-score, tuổi hiệu chỉnh, lịch tiêm (TS thuần, có test)
    core/i18n        vi.json
    core/platform    notify.ts, share.ts — lớp trừu tượng Web ↔ Capacitor
    features/*       mỗi feature 1 thư mục
    ui/              component dùng chung
knowledge/           import trực tiếp JSON vào bundle (offline)
```

## Data model
```ts
Baby { id, name, sex: 'M'|'F', birthDate, gestationalWeeks, birthWeightG, birthLengthCm }
LogEntry { id, babyId, type, startAt, endAt?, payload, createdBy }
  // type: feed_breast|feed_bottle|solid|diaper|sleep|temp|med|symptom|note
Measurement { id, babyId, date, weightG?, lengthCm?, headCm? }
VaccineDose { id, babyId, vaccineCode, doseNo, dueDate, givenDate?, lot?, place? }
MilestoneCheck { babyId, milestoneId, achievedAt? }
```

## Nhắc lịch (giới hạn của web)
| Môi trường | Cách nhắc |
|---|---|
| PWA Android/desktop | Web Push / Notification API |
| PWA iOS | Chỉ có push khi đã "Thêm vào MH chính" (iOS 16.4+) → **mặc định xuất file .ics** để thêm lịch tiêm vào Lịch điện thoại |
| Capacitor (GĐ2) | Local notifications |
Mọi chỗ gọi nhắc đi qua `core/platform/notify.ts` để GĐ2 chỉ thay implementation.

## Lưu ý dữ liệu
- IndexedDB có thể bị trình duyệt xóa (nhất là Safari không dùng lâu) → gọi `navigator.storage.persist()`, có **Xuất/Nhập file backup JSON**, nhắc backup hằng tuần; Supabase sync ở M4.

## Standards Engine
- `correctedAgeDays()`, `zFromLMS()` (công thức LMS WHO), `classify()`, `velocity()` (giảm > 0.67 SD), `generateVaccineSchedule()`.

## Deploy
- Vercel: root `apps/web`, build `npm run build`, output `dist`, env `LLM_API_KEY`. Mỗi PR có preview URL để test trên điện thoại.
