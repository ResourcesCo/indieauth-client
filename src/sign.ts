import { Buffer } from 'node:buffer'

export async function importKey(key: string | Uint8Array): CryptoKey {
  return await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? new TextEncoder().encode(key) : key,
    {name: 'HMAC', hash: 'SHA-256'},
    false,
    ['sign', 'verify']
  )
}

export async function signText(key: CryptoKey, text: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    {name: "HMAC"},
    key,
    new TextEncoder().encode(text)
  )
  const encodedSignature = Buffer.from(new Uint8Array(signature)).toString('base64url')
  return `${text}|${encodedSignature}`
}

export async function verifyText(key: CryptoKey, signedText: string): Promise<string> {
  const index = signedText.lastIndexOf('|')
  if (index === -1) {
    throw new Error('Verification failed: signature not found')
  }
  const signature = Buffer.from(signedText.substr(index + 1), 'base64url')
  const text = signedText.substr(0, index)
  const verified = await crypto.subtle.verify(
    {name: "HMAC"},
    key,
    signature,
    new TextEncoder().encode(text)
  )
  if (verified) {
    return text
  } else {
    throw new Error('Verification failed: crypto.subtle.verify() returned false')
  }
}

export async function makeCsrfToken(key: CryptoKey): Promise<string> {
  return await signText(key, `csrf:${new Date().valueOf()}`)
}

export async function verifyCsrfToken(
  key: CryptoKey, csrfToken: string, expiresIn: Number = (10 * 60 * 1000)
): Promise<boolean> {
  const token = await verifyText(key, csrfToken)
  const parts = token.split(':')
  if (parts.length === 2 && parts[0] === 'csrf') {
    const ts = parseInt(parts[1])
    if (Number.isInteger(ts)) {
      const tenMinutesAgo = new Date().valueOf() - expiresIn
      return ts >= tenMinutesAgo
    }
  }
  return false
}
