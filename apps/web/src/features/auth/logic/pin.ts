/**
 * PIN hashing for the on-device caregiver login.
 *
 * This is a *local* lock, not a server account: the hash never leaves the
 * device and there is no recovery beyond deleting the app data. PBKDF2-SHA256
 * with a per-caregiver salt keeps a stolen localStorage dump from revealing
 * the PIN in plain text.
 */
const ITERATIONS = 120_000
const KEY_BITS = 256

export const PIN_MIN_LENGTH = 4
export const PIN_MAX_LENGTH = 6

export interface PinHash {
  salt: string
  hash: string
  iterations: number
}

function subtle(): SubtleCrypto {
  const api = globalThis.crypto?.subtle
  if (api === undefined) {
    throw new Error('WebCrypto is not available in this environment')
  }
  return api
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_MIN_LENGTH},${PIN_MAX_LENGTH}}$`).test(pin)
}

export function randomSalt(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return toBase64(bytes)
}

async function derive(pin: string, salt: string, iterations: number): Promise<string> {
  const key = await subtle().importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', salt: fromBase64(salt), iterations, hash: 'SHA-256' },
    key,
    KEY_BITS,
  )
  return toBase64(new Uint8Array(bits))
}

export async function hashPin(
  pin: string,
  salt: string = randomSalt(),
  iterations: number = ITERATIONS,
): Promise<PinHash> {
  if (!isValidPin(pin)) throw new TypeError('PIN must be 4-6 digits')
  return { salt, hash: await derive(pin, salt, iterations), iterations }
}

export async function verifyPin(pin: string, stored: PinHash): Promise<boolean> {
  if (!isValidPin(pin)) return false
  try {
    const candidate = await derive(pin, stored.salt, stored.iterations)
    // Length-independent compare; the values are fixed-size hashes.
    if (candidate.length !== stored.hash.length) return false
    let diff = 0
    for (let index = 0; index < candidate.length; index += 1) {
      diff |= candidate.charCodeAt(index) ^ stored.hash.charCodeAt(index)
    }
    return diff === 0
  } catch {
    return false
  }
}
