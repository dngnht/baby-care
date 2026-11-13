# apps/web — BéYêu PWA

React 18 + TypeScript (strict) + Vite + Tailwind CSS v4 + React Router + `vite-plugin-pwa`, kiểm thử bằng Vitest, lint bằng ESLint flat config.

## Lệnh

```bash
npm ci            # cài dependency (dùng lockfile)
npm run dev       # dev server
npm run lint      # ESLint
npm run typecheck # tsc --noEmit
npm test          # Vitest (watch) — CI dùng: npm test -- --run
npm run build     # typecheck + build tĩnh ra dist/
npm run preview   # xem bản build
```

## Cấu trúc

```
index.html            mobile-first, lang="vi", theme-color
public/icons/         icon 192/512 + maskable + apple-touch (sinh bằng Pillow)
src/core/i18n/        vi.json + t(key) — mọi chuỗi UI đi qua đây
src/core/standards/   z-score engine (thuần TS)
src/features/<name>/  pages · components · hooks · logic
src/index.css         Tailwind v4 @theme (token màu/typography)
vite.config.ts        Vite + Tailwind + PWA manifest + cấu hình Vitest
vercel.json           build apps/web, SPA rewrite về index.html
```

## PWA

`registerType: 'autoUpdate'` — bản mới tự cập nhật khi mở lại app. Manifest tiếng Việt
(`name`/`short_name` = "BéYêu", `display: standalone`, `start_url: "/"`), có shortcut
"Bú" và "Tã". Service worker chỉ bật ở bản build, không bật ở `npm run dev`.

## Quy ước

- Không hard-code chuỗi tiếng Việt trong JSX: thêm key vào `src/core/i18n/vi.json` rồi `t('key')`.
- Không dùng `any`. Logic tính toán đặt trong `logic/` và phải có test Vitest.
