import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRepo, type Repo } from '../repo'
import {
  BACKUP_FORMAT_VERSION,
  BackupValidationError,
  downloadBackup,
  exportBackup,
  importBackup,
  parseBackup,
  serializeBackup,
  suggestBackupFilename,
  type BackupFile,
} from '../backup'

const BIRTH_DATE = new Date('2025-01-15T00:00:00.000Z')
const DAY_START = new Date('2026-03-01T00:00:00.000Z')
const DAY_END = new Date('2026-03-02T00:00:00.000Z')

let repos: Repo[] = []
let dbName: string

function openRepo(name: string): Repo {
  const repo = createRepo(name)
  repos.push(repo)
  return repo
}

async function seed(repo: Repo): Promise<{ babyId: string; logIds: string[] }> {
  const baby = await repo.createBaby({
    name: 'Bé An',
    sex: 'F',
    birthDate: BIRTH_DATE,
    gestationalWeeks: 39,
    birthWeightG: 3200,
    birthLengthCm: 50,
  })

  const earlier = await repo.addLog({
    babyId: baby.id,
    type: 'feed_breast',
    startAt: new Date('2026-03-01T06:00:00.000Z'),
    payload: { side: 'L' },
    createdBy: 'me',
  })
  const later = await repo.addLog({
    babyId: baby.id,
    type: 'feed_bottle',
    startAt: new Date('2026-03-01T08:00:00.000Z'),
    endAt: new Date('2026-03-01T08:20:00.000Z'),
    payload: { ml: 90 },
    createdBy: 'me',
  })

  await repo.addMeasurement({
    babyId: baby.id,
    date: new Date('2026-03-01T00:00:00.000Z'),
    weightG: 7800,
    lengthCm: 68.5,
    headCm: 43,
  })
  await repo.addVaccineDose({
    babyId: baby.id,
    vaccineCode: 'BCG',
    doseNo: 1,
    dueDate: new Date('2025-01-15T00:00:00.000Z'),
    givenDate: new Date('2025-01-16T00:00:00.000Z'),
    lot: 'LOT-1',
    place: 'Clinic',
  })
  await repo.setMilestoneCheck({
    babyId: baby.id,
    milestoneId: 'head_up',
    achievedAt: new Date('2025-03-01T00:00:00.000Z'),
  })

  return { babyId: baby.id, logIds: [earlier.id, later.id] }
}

function first<T>(rows: readonly T[]): T {
  const value = rows[0]
  if (value === undefined) throw new Error('expected at least one row')
  return value
}

beforeEach(() => {
  dbName = `beyeu_backup_${crypto.randomUUID()}`
  repos = []
})

afterEach(async () => {
  while (repos.length > 0) {
    const repo = repos.pop()
    if (repo === undefined) break
    try {
      await repo.destroy()
    } catch {
      // The replace test deletes the database explicitly; deleting twice is fine.
    }
  }
})

describe('exportBackup', () => {
  it('exports every table with counts, app id and ISO metadata', async () => {
    const repo = openRepo(dbName)
    const { babyId } = await seed(repo)

    const file = await exportBackup(repo.db)

    expect(file.app).toBe('beyeu')
    expect(file.formatVersion).toBe(BACKUP_FORMAT_VERSION)
    expect(file.dbVersion).toBe(2)
    expect(file.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(file.counts).toEqual({
      babies: 1,
      logs: 2,
      measurements: 1,
      vaccineDoses: 1,
      milestoneChecks: 1,
      reminders: 0,
    })
    expect(file.tables.babies.map((row) => row.id)).toEqual([babyId])
  })

  it('sorts rows deterministically so repeat exports are identical', async () => {
    const repo = openRepo(dbName)
    await seed(repo)

    const firstExport = await exportBackup(repo.db)
    const secondExport = await exportBackup(repo.db)

    expect(firstExport.tables.logs.map((row) => row.startAt)).toEqual([
      '2026-03-01T06:00:00.000Z',
      '2026-03-01T08:00:00.000Z',
    ])
    expect(JSON.stringify(firstExport.tables)).toBe(JSON.stringify(secondExport.tables))
    expect(serializeBackup(firstExport)).toContain('\n  "tables"')
  })
})

describe('parseBackup', () => {
  it('round-trips through serialize -> parse without losing data', async () => {
    const repo = openRepo(dbName)
    await seed(repo)
    const file = await exportBackup(repo.db)

    const parsed = parseBackup(serializeBackup(file))

    expect(parsed).toEqual(file)
  })

  it('rejects malformed backups with a clear BackupValidationError', async () => {
    const repo = openRepo(dbName)
    await seed(repo)
    const valid = await exportBackup(repo.db)
    const baby = first(valid.tables.babies)

    const tablesWithoutLogs: Record<string, unknown> = { ...valid.tables }
    delete tablesWithoutLogs.logs

    const cases: Array<{ label: string; payload: unknown; message: RegExp }> = [
      {
        label: 'wrong app id',
        payload: { ...valid, app: 'someone-else' },
        message: /backup\.app/,
      },
      {
        label: 'unsupported format version',
        payload: { ...valid, formatVersion: 99 },
        message: /formatVersion/,
      },
      {
        label: 'missing table',
        payload: { ...valid, tables: tablesWithoutLogs },
        message: /backup\.tables\.logs/,
      },
      {
        label: 'invalid timestamp',
        payload: {
          ...valid,
          tables: { ...valid.tables, babies: [{ ...baby, birthDate: 'yesterday' }] },
        },
        message: /babies\[0\]\.birthDate/,
      },
      {
        label: 'impossible calendar date',
        payload: {
          ...valid,
          tables: {
            ...valid.tables,
            babies: [{ ...baby, birthDate: '2026-02-30T00:00:00.000Z' }],
          },
        },
        message: /calendar date/,
      },
      {
        label: 'missing primary key',
        payload: { ...valid, tables: { ...valid.tables, babies: [{ ...baby, id: '' }] } },
        message: /babies\[0\]\.id/,
      },
      {
        label: 'unknown log type',
        payload: {
          ...valid,
          tables: {
            ...valid.tables,
            logs: [{ ...first(valid.tables.logs), type: 'teleport' }],
          },
        },
        message: /logs\[0\]\.type/,
      },
    ]

    for (const testCase of cases) {
      const json = JSON.stringify(testCase.payload)
      expect(() => parseBackup(json), testCase.label).toThrow(BackupValidationError)
      expect(() => parseBackup(json), testCase.label).toThrow(testCase.message)
    }

    expect(() => parseBackup('{ not json')).toThrow(BackupValidationError)
    expect(() => parseBackup('{ not json')).toThrow(/valid JSON/)
  })
})

describe('importBackup', () => {
  it('restores an identical database with mode "replace" after the DB is wiped', async () => {
    const repo = openRepo(dbName)
    await seed(repo)
    const original = await exportBackup(repo.db)
    const json = serializeBackup(original)

    // Simulate a wiped IndexedDB (Safari eviction / new device).
    repo.close()
    await repo.db.delete()

    const restored = openRepo(dbName)
    const summary = await importBackup(json, { mode: 'replace', db: restored.db })

    expect(summary.mode).toBe('replace')
    expect(summary.imported).toEqual(original.counts)
    expect(summary.skipped).toBe(0)

    const after = await exportBackup(restored.db)
    expect(after.tables).toEqual(original.tables)
    expect(after.counts).toEqual(original.counts)
  })

  it('replaces existing rows instead of merging them', async () => {
    const repo = openRepo(dbName)
    await seed(repo)
    const file = await exportBackup(repo.db)

    const extra = await repo.createBaby({
      name: 'Bé Bình',
      sex: 'M',
      birthDate: BIRTH_DATE,
      gestationalWeeks: 40,
      birthWeightG: 3500,
      birthLengthCm: 51,
    })

    await importBackup(file, { mode: 'replace', db: repo.db })

    expect(await repo.getBaby(extra.id)).toBeUndefined()
    expect(await repo.listBabies()).toHaveLength(1)
  })

  it('merges by primary key and keeps rows that are not in the backup', async () => {
    const source = openRepo(`beyeu_backup_src_${crypto.randomUUID()}`)
    await seed(source)
    const file = await exportBackup(source.db)

    const sourceBaby = first(file.tables.babies)
    const sourceLog = first(file.tables.logs)

    const target = openRepo(`beyeu_backup_dst_${crypto.randomUUID()}`)
    await target.db.babies.put({ ...sourceBaby, name: 'Old name' })
    await target.db.logs.put({ ...sourceLog, payload: { side: 'R' } })

    const stranger = await target.createBaby({
      name: 'Bé Cường',
      sex: 'M',
      birthDate: BIRTH_DATE,
      gestationalWeeks: 38,
      birthWeightG: 3000,
      birthLengthCm: 49,
    })
    const strangerLog = await target.addLog({
      babyId: stranger.id,
      type: 'note',
      startAt: new Date('2026-03-01T10:00:00.000Z'),
      payload: {},
      createdBy: 'me',
    })

    const merged: BackupFile = {
      ...file,
      tables: { ...file.tables, babies: [{ ...sourceBaby, name: 'New name' }] },
    }
    const summary = await importBackup(merged, { mode: 'merge', db: target.db })

    expect(summary.mode).toBe('merge')
    expect(summary.imported.babies).toBe(1)
    expect((await target.getBaby(sourceBaby.id))?.name).toBe('New name')
    // Existing row with the same primary key is overwritten by the backup.
    expect((await target.db.logs.get(sourceLog.id))?.payload).toEqual({ side: 'L' })
    // Unrelated rows survive.
    expect(await target.getBaby(stranger.id)).toBeDefined()
    expect((await target.listLogs(stranger.id, DAY_START, DAY_END)).map((row) => row.id)).toEqual([
      strangerLog.id,
    ])
  })

  it('collapses duplicate primary keys inside a backup and reports them as skipped', async () => {
    const repo = openRepo(dbName)
    await seed(repo)
    const file = await exportBackup(repo.db)
    const baby = first(file.tables.babies)

    const duplicated: BackupFile = {
      ...file,
      tables: { ...file.tables, babies: [baby, { ...baby, name: 'Duplicate name' }] },
    }
    const summary = await importBackup(duplicated, { mode: 'merge', db: repo.db })

    expect(summary.imported.babies).toBe(1)
    expect(summary.skipped).toBe(1)
    expect((await repo.getBaby(baby.id))?.name).toBe('Duplicate name')
  })

  it('rejects an invalid mode at runtime', async () => {
    const repo = openRepo(dbName)
    await seed(repo)
    const file = await exportBackup(repo.db)

    await expect(
      importBackup(file, { mode: 'append' as 'merge', db: repo.db }),
    ).rejects.toThrow(BackupValidationError)
  })
})

describe('download helpers', () => {
  it('suggests a UTC-dated filename', () => {
    expect(suggestBackupFilename(new Date('2026-03-01T23:30:00.000Z'))).toBe(
      'beyeu-backup-2026-03-01.json',
    )
    expect(() => suggestBackupFilename(new Date('nope'))).toThrow(TypeError)
  })

  it('serialises and downloads the backup through the platform fallback', async () => {
    const repo = openRepo(dbName)
    await seed(repo)
    const file = await exportBackup(repo.db)

    let createdBlob: Blob | undefined
    const createObjectURL = vi.fn((blob: Blob): string => {
      createdBlob = blob
      return 'blob:beyeu-backup'
    })
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectURL,
    })
    const click = vi.spyOn(HTMLElement.prototype, 'click').mockImplementation(() => {})

    try {
      await downloadBackup(file)

      expect(createObjectURL).toHaveBeenCalledTimes(1)
      expect(click).toHaveBeenCalledTimes(1)
      expect(createdBlob).toBeInstanceOf(File)
      if (createdBlob instanceof File) {
        expect(createdBlob.name).toBe(suggestBackupFilename(new Date(file.exportedAt)))
        expect(createdBlob.type).toBe('application/json')
      }
    } finally {
      click.mockRestore()
      Reflect.deleteProperty(URL, 'createObjectURL')
    }
  })
})
