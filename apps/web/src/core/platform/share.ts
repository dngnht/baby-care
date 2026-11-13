// Platform abstraction for the Web Share API + file download fallback.
//
// Feature code imports from here instead of touching `navigator.share`,
// `navigator.canShare`, `URL.createObjectURL` or anchor elements. Capacitor
// (T050) swaps this file for `@capacitor/share`.

/** Outcome of a share attempt. */
export type ShareResult = 'shared' | 'cancelled' | 'unsupported' | 'error'

export interface ShareTextInput {
  title: string
  text: string
  url?: string
}

export interface ShareFileOptions {
  title?: string
  text?: string
}

/**
 * `navigator.share` bound to `navigator` (browsers throw "Illegal invocation"
 * when the method is called with a different receiver).
 */
function shareFunction(): ((data: ShareData) => Promise<void>) | undefined {
  if (typeof navigator === 'undefined') return undefined
  if (typeof navigator.share !== 'function') return undefined
  return (data: ShareData) => navigator.share(data)
}

/** Feature-detect `navigator.canShare` and ask it about the payload. */
function canShareData(data: ShareData): boolean {
  if (typeof navigator === 'undefined') return false
  if (typeof navigator.canShare !== 'function') return false
  try {
    return navigator.canShare(data)
  } catch {
    return false
  }
}

/**
 * Whether sharing is usable.
 *
 * With files, both `navigator.share` and `navigator.canShare({ files })` must
 * accept the payload - browsers that only share text would otherwise reject
 * the call at runtime.
 */
export function canShare(files?: File[]): boolean {
  if (shareFunction() === undefined) return false
  if (files === undefined || files.length === 0) return true
  return canShareData({ files })
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

/** Share plain text. When unsupported the caller decides (e.g. copy to clipboard). */
export async function shareText(input: ShareTextInput): Promise<ShareResult> {
  const share = shareFunction()
  if (share === undefined) return 'unsupported'

  const data: ShareData = { title: input.title, text: input.text }
  if (input.url !== undefined) data.url = input.url

  try {
    await share(data)
    return 'shared'
  } catch (error) {
    return isAbortError(error) ? 'cancelled' : 'error'
  }
}

/**
 * Share a file (backup export, report PDF, ...).
 *
 * When the platform cannot share files the file is downloaded instead and
 * `'unsupported'` is returned, so the caller can tell the user where it went.
 */
export async function shareFile(file: File, options: ShareFileOptions = {}): Promise<ShareResult> {
  if (!canShare([file])) {
    downloadFile(file)
    return 'unsupported'
  }

  const share = shareFunction()
  if (share === undefined) {
    downloadFile(file)
    return 'unsupported'
  }

  const data: ShareData = { files: [file] }
  if (options.title !== undefined) data.title = options.title
  if (options.text !== undefined) data.text = options.text

  try {
    await share(data)
    return 'shared'
  } catch (error) {
    return isAbortError(error) ? 'cancelled' : 'error'
  }
}

/**
 * Save a file through a temporary object URL and a synthetic `<a download>`.
 *
 * Used both as the share fallback and directly by the backup feature. Safe to
 * call in a non-DOM environment (it simply does nothing).
 */
export function downloadFile(file: File): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return
  if (typeof URL.createObjectURL !== 'function') return

  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name
  anchor.rel = 'noopener'
  anchor.style.display = 'none'

  document.body.append(anchor)
  anchor.click()
  anchor.remove()

  // Keep the object URL alive for a tick: Safari starts the download
  // asynchronously and a synchronous revoke would abort it.
  setTimeout(() => {
    if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url)
  }, 0)
}
