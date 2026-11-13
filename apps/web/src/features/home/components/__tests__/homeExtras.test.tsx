import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BackfillSheet } from '../BackfillSheet'
import { ReminderSettingsCard } from '../ReminderSettingsCard'

describe('ReminderSettingsCard', () => {
  it('renders both switches off by default', () => {
    const html = renderToStaticMarkup(
      <ReminderSettingsCard
        settings={{
          feed: { enabled: false, intervalMinutes: 180 },
          diaper: { enabled: false, intervalMinutes: 180 },
        }}
        onChange={() => undefined}
      />,
    )
    expect(html).toContain('Nhắc cữ')
    expect(html).toContain('Nhắc cữ bú')
    expect(html).toContain('Nhắc thay tả')
    expect((html.match(/role="switch"/g) ?? []).length).toBe(2)
    expect((html.match(/aria-checked="false"/g) ?? []).length).toBe(2)
    expect(html).not.toContain('<select')
  })

  it('shows the interval picker for an enabled reminder', () => {
    const html = renderToStaticMarkup(
      <ReminderSettingsCard
        settings={{
          feed: { enabled: true, intervalMinutes: 240 },
          diaper: { enabled: false, intervalMinutes: 180 },
        }}
        onChange={() => undefined}
      />,
    )
    expect(html).toContain('role="switch"')
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('<select')
    expect(html).toContain('Mỗi 240 phút')
    expect(html).toContain('Mỗi 120 phút')
  })
})

describe('BackfillSheet', () => {
  it('pre-fills the last bottle volume and offers the four types', () => {
    const html = renderToStaticMarkup(
      <BackfillSheet defaults={{ amountMl: 120 }} onSave={() => undefined} onClose={() => undefined} />,
    )
    expect(html).toContain('Ghi bù cữ đã quên')
    expect(html).toContain('Điền sẵn 2 giờ trước')
    expect(html).toContain('Bú mẹ')
    expect(html).toContain('Bú bình')
    expect(html).toContain('Tã')
    expect(html).toContain('Ngủ')
    expect(html).toContain('value="120"')
    expect(html).toContain('type="datetime-local"')
  })

  it('does not invent a volume when there is no bottle history', () => {
    const html = renderToStaticMarkup(
      <BackfillSheet defaults={{}} onSave={() => undefined} onClose={() => undefined} />,
    )
    expect(html).not.toContain('value="0"')
  })
})
