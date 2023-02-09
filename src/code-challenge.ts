import { Buffer } from 'node:buffer'

const chars = [
  ...(
    Array.from(Array(26))
    .map((_, i) => i + 'A'.charCodeAt(0))
  ),
  ...(
    Array.from(Array(26))
    .map((_, i) => i + 'a'.charCodeAt(0))
  ),
  ...(
    Array.from(Array(10))
    .map((_, i) => i + '0'.charCodeAt(0))
  ),
  ...(['-', '.', '_', '~']).map(s => s.charCodeAt(0)),
]

// code_challenge_methods_supported from indieauth metadata
export function generateCodeVerifier(length: number = 64): string {
  return new TextDecoder().decode(Uint8Array.from(
    crypto.getRandomValues(new Uint32Array(length))
    .map(i => chars[i % chars.length])
  ))
}

export async function getCodeChallenge(codeVerifier: string): Promise<string> {
  return Buffer.from(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
  ).toString('base64url')
}

// code_challenge_methods_supported from indieauth metadata
export function codeChallengeIsSupported(value: string) {
  return (
    Array.isArray(challenge) && challenge.find(s => s.toUpperCase() === 'S256')
  )
}
