import { generateCodeVerifier } from './code-challenge'

export function randomToken(length = 32): string {
  return generateCodeVerifier(length)
}
