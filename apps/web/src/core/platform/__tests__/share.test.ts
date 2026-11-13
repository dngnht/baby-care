import { afterEach, describe, expect, it, vi } from 'vitest'
import { canShare, downloadFile, shareFile, shareText } from '../share'

const originalShare = Object.getOwnPropertyDescriptor(navigator, 'share')
const originalCanShare = Object.getOwnPropertyDescriptor(navigator, 'canShare')

function stubMethod(name: 'share' | 'canShare', value: unknown): void {
  Object.defineProperty(navigator, name, { configurable: true, writable: true, value })
}

function restoreMethod(name: 'share' | 'canShare', original: PropertyDescriptor | undefined): void {
  if (original === undefined) {
    Reflect.deleteProperty(navigator, name)
  } else {
    Object.defineProperty(navigator, name, original)
  }
}

function abortError(): Error {
  const error = new Error('Share cancelled by the user')
  error.name = 'AbortError'
  return error
}

function makeFile(): File {
  return new File(['{"ok":true}'], 'backup.json', { type: 'application/json' })
}

interface DownloadedAnchor {
  download: string
  href: string
}

/** Mock `URL.createObjectURL` / `revokeObjectURL` and capture anchor clicks. */
function mockDownloadEnvironment() {
  const created: DownloadedAnchor[] = []
  let createdFile: Blob | undefined

  const createObjectURL = vi.fn((file: Blob): string => {
    createdFile = file
    return 'blob:beyeu-test'
  })
  const revokeObjectURL = vi.fn()

  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: createObjectURL,
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: revokeObjectURL,
  })

  const click = vi.spyOn(HTMLElement.prototype, 'click').mockImplementation(function (
    this: HTMLElement,
  ) {
    const anchor = this as HTMLAnchorElement
    created.push({ download: anchor.download, href: anchor.href })
  })

  return {
    createObjectURL,
    created,
    createdFile: () => createdFile,
    restore() {
      click.mockRestore()
      Reflect.deleteProperty(URL, 'createObjectURL')
      Reflect.deleteProperty(URL, 'revokeObjectURL')
    },
  }
}

afterEach(() => {
  restoreMethod('share', originalShare)
  restoreMethod('canShare', originalCanShare)
})

describe('canShare', () => {
  it('returns false when navigator.share is missing', () => {
    expect(canShare()).toBe(false)
    expect(canShare([makeFile()])).toBe(false)
  })

  it('allows text sharing when only navigator.share exists', () => {
    stubMethod('share', vi.fn(async () => undefined))
    expect(canShare()).toBe(true)
  })

  it('requires navigator.canShare to accept files', () => {
    stubMethod('share', vi.fn(async () => undefined))
    expect(canShare([makeFile()])).toBe(false)

    stubMethod('canShare', vi.fn(() => true))
    expect(canShare([makeFile()])).toBe(true)

    stubMethod('canShare', vi.fn(() => false))
    expect(canShare([makeFile()])).toBe(false)
  })

  it('treats a throwing canShare as unsupported', () => {
    stubMethod('share', vi.fn(async () => undefined))
    stubMethod(
      'canShare',
      vi.fn(() => {
        throw new Error('bad payload')
      }),
    )
    expect(canShare([makeFile()])).toBe(false)
  })
})

describe('shareText', () => {
  it('returns unsupported when the Web Share API is missing', async () => {
    await expect(shareText({ title: 'Backup', text: 'Done' })).resolves.toBe('unsupported')
  })

  it('shares text and includes the optional url', async () => {
    const share = vi.fn(async (_data: ShareData) => undefined)
    stubMethod('share', share)

    await expect(
      shareText({ title: 'Backup', text: 'Done', url: 'https://example.test' }),
    ).resolves.toBe('shared')

    expect(share).toHaveBeenCalledWith({
      title: 'Backup',
      text: 'Done',
      url: 'https://example.test',
    })
  })

  it('maps AbortError to cancelled', async () => {
    stubMethod('share', vi.fn(async () => Promise.reject(abortError())))
    await expect(shareText({ title: 'Backup', text: 'Done' })).resolves.toBe('cancelled')
  })

  it('maps other failures to error', async () => {
    stubMethod('share', vi.fn(async () => Promise.reject(new Error('NotAllowedError'))))
    await expect(shareText({ title: 'Backup', text: 'Done' })).resolves.toBe('error')
  })
})

describe('shareFile', () => {
  it('shares the file with title and text when supported', async () => {
    const share = vi.fn(async (_data: ShareData) => undefined)
    stubMethod('share', share)
    stubMethod('canShare', vi.fn(() => true))

    const file = makeFile()
    await expect(shareFile(file, { title: 'Backup', text: 'Keep safe' })).resolves.toBe('shared')

    expect(share).toHaveBeenCalledWith({ files: [file], title: 'Backup', text: 'Keep safe' })
  })

  it('maps AbortError to cancelled without downloading', async () => {
    stubMethod('share', vi.fn(async () => Promise.reject(abortError())))
    stubMethod('canShare', vi.fn(() => true))
    const env = mockDownloadEnvironment()

    try {
      await expect(shareFile(makeFile())).resolves.toBe('cancelled')
      expect(env.createObjectURL).not.toHaveBeenCalled()
    } finally {
      env.restore()
    }
  })

  it('downloads the file and reports unsupported when sharing is unavailable', async () => {
    const env = mockDownloadEnvironment()

    try {
      await expect(shareFile(makeFile())).resolves.toBe('unsupported')
      expect(env.createObjectURL).toHaveBeenCalledTimes(1)
      expect(env.created).toEqual([{ download: 'backup.json', href: 'blob:beyeu-test' }])
      expect(env.createdFile()).toBeInstanceOf(File)
    } finally {
      env.restore()
    }
  })
})

describe('downloadFile', () => {
  it('creates an object URL, clicks a hidden anchor and cleans up the node', () => {
    const env = mockDownloadEnvironment()

    try {
      downloadFile(makeFile())

      expect(env.createObjectURL).toHaveBeenCalledTimes(1)
      expect(env.created).toEqual([{ download: 'backup.json', href: 'blob:beyeu-test' }])
      expect(document.querySelector('a[download]')).toBeNull()
    } finally {
      env.restore()
    }
  })

  it('does nothing when the download APIs are unavailable', () => {
    Reflect.deleteProperty(URL, 'createObjectURL')
    expect(() => downloadFile(makeFile())).not.toThrow()
  })
})
