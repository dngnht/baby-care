# AI Advisor

## Chức năng
1. **Chat hỏi đáp** (tiếng Việt, giọng ấm áp, ngắn gọn).
2. **Phân tích tuần**: input = tóm tắt 7 ngày (tuổi ngày, z-scores, tổng bú/ngủ/tã TB, triệu chứng, mũi tiêm sắp tới).
   Output JSON:
```json
{ "summary": "...", "status": "green|yellow|red",
  "observations": [{"area":"growth|feeding|sleep|development","text":"...","evidence":"z=-1.8 cân/tuổi"}],
  "adjustment_plan": [{"day_range":"1-7","action":"...","target":"..."}],
  "see_doctor_if": ["..."], "sources": ["knowledge/care/feeding.md#..."] }
```
3. **Parse nhập liệu tự nhiên** ("bé ị 2 lần, bú 90ml") → LogEntry[].

## RAG
- Index `knowledge/**/*.md|json` (chỉ mục `verified: true`). Trả lời phải trích `sources`.

## Guardrails
| Lớp | Quy tắc |
|---|---|
| Pre (rule cứng, không qua LLM) | Từ khóa red flag (sốt ≥38°C ở bé <3 tháng, co giật, tím tái, khó thở, li bì, bỏ bú, nôn vọt, phân có máu, thóp phồng, mất nước) → hiện ngay màn hình "Đưa bé đi khám/gọi 115" |
| System prompt | Không chẩn đoán, không kê thuốc/liều; không khuyến nghị trái WHO/Bộ Y tế (vd. mật ong <12 tháng, nước cho bé <6 tháng bú mẹ hoàn toàn) |
| Post | Regex chặn "mg/kg", tên thuốc + liều; schema validate JSON; thêm disclaimer |
| Privacy | Chỉ gửi tuổi theo ngày, giới, số đo; không tên/ảnh |

## System prompt (bản nháp: `packages/ai/prompts/system_vi.md`)
