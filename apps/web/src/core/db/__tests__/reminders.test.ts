import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { BACKUP_FORMAT_VERSION, exportBackup, importBackup, parseBackup, serializeBackup } from '../backup'
import { createRepo, type Repo } from '../repo'

const openRepos: Repo[] = []

function openRepo(name: string): Repo {
  const repo = createRepo(name)
  openRepos.push(repo)
  return repo
}

const BABY = {
  name: 'Bơ',
  sex: 'F' as const,
  birthDate: new Date('2026-07-31T00:00:00Z'),
  gestationalWeeks: 40,
}

afterEach(async () => {
  while (openRepos.length > 0) {
    const repo = openRepos.pop()
    if (repo === undefined) break
    await repo.destroy().catch(() => undefined)
  }
})

describe('reminder repository', () => {
  it('creates, lists (soonest first), updates and deletes reminders', async () => {
    const repo = openRepo(`beyeu_reminders_${crypto.randomUUID()}`)
    const baby = await repo.createBaby(BABY)

    const later = await repo.addReminder({
      babyId: baby.id,
      title: '  Tái khám  ',
      at: new Date('2026-12-01T02:00:00Z'),
      repeat: 'none',
    })
    const sooner = await repo.addReminder({
      babyId: baby.id,
      title: 'Uống vitamin D',
      at: new Date('2026-11-10T01:00:00Z'),
      repeat: 'daily',
      note: 'sau ăn sáng',
    })

    expect(later.title).toBe('Tái khám')
    expect(later.repeat).toBe('none')
    expect(later.createdAt).toMatch(/Z$/)

    const listed = await repo.listReminders(baby.id)
    expect(listed.map((row) => row.title)).toEqual(['Uống vitamin D', 'Tái khám'])

    const updated = await repo.updateReminder(sooner.id, {
      title: 'Vitamin D3',
      doneAt: new Date('2026-11-10T02:00:00Z'),
    })
    expect(updated.title).toBe('Vitamin D3')
    expect(updated.doneAt).toBe('2026-11-10T02:00:00.000Z')

    await repo.deleteReminder(later.id)
    expect((await repo.listReminders(baby.id)).map((row) => row.id)).toEqual([sooner.id])
  })

  it('rejects empty titles and unknown ids', async () => {
    const repo = openRepo(`beyeu_reminders_${crypto.randomUUID()}`)
    const baby = await repo.createBaby(BABY)

    await expect(
      repo.addReminder({ babyId: baby.id, title: '   ', at: new Date() }),
    ).rejects.toThrow(/title/)

    await expect(repo.updateReminder('missing', { title: 'x' })).rejects.toThrow(/not found/)
  })
})

describe('backup v2 with reminders', () => {
  it('round-trips reminders and survives replace restore', async () => {
    const name = `beyeu_backup_rem_${crypto.randomUUID()}`
    const repo = openRepo(name)
    const baby = await repo.createBaby(BABY)
    await repo.addReminder({
      babyId: baby.id,
      title: 'Tiêm nhắc',
      at: new Date('2026-12-20T03:00:00Z'),
      note: 'mang sổ',
    })

    const file = await exportBackup(repo.db)
    expect(file.formatVersion).toBe(BACKUP_FORMAT_VERSION)
    expect(file.counts.reminders).toBe(1)

    const text = serializeBackup(file)
    const parsed = parseBackup(text)
    expect(parsed.tables.reminders[0]?.title).toBe('Tiêm nhắc')

    await repo.db.reminders.clear()
    const summary = await importBackup(text, { mode: 'replace', db: repo.db })
    expect(summary.imported.reminders).toBe(1)

    const restored = await repo.listReminders(baby.id)
    expect(restored).toHaveLength(1)
    expect(restored[0]?.note).toBe('mang sổ')
  })

  it('still accepts a v1 file (no reminders table)', async () => {
    const file = {
      formatVersion: 1,
      app: 'beyeu',
      exportedAt: '2026-11-08T00:00:00.000Z',
      dbVersion: 1,
      counts: { babies: 0, logs: 0, measurements: 0, vaccineDoses: 0, milestoneChecks: 0 },
      tables: {
        babies: [],
        logs: [],
        measurements: [],
        vaccineDoses: [],
        milestoneChecks: [],
      },
    }

    const parsed = parseBackup(JSON.stringify(file))
    expect(parsed.tables.reminders).toEqual([])
    expect(parsed.formatVersion).toBe(BACKUP_FORMAT_VERSION)
  })

  it('rejects an unknown format version', () => {
    const broken = JSON.stringify({ app: 'beyeu', formatVersion: 99, exportedAt: '2026-11-08T00:00:00.000Z', dbVersion: 2, tables: {} })
    expect(() => parseBackup(broken)).toThrow(/formatVersion/)
  })
})
