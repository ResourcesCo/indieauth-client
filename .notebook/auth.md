# Auth

## Client constructs auth URL & sends redirect

[Spec](https://indieauth.spec.indieweb.org/#authorization-request)

The authorization request is constructed from information retrieved in Discover.

As part of this, it needs to generate a code verifier for the PKCE Code Challenge, as well as a code challenge. It uses the code challenge in the initial redirect, and sends the code challenge when requesting a token. There is also a method here for checking if the code challenge is supported.

[`src/code-challenge.ts`](https://macchiato.dev/code)

```ts
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
```

The login URL is constructed from the provided fields.

[`src/login-redirect.ts`](https://macchiato.dev/code)

```ts
import { } from './'

export function buildLoginUrl({
  clientId,
  authorizationEndpoint,
  redirectUrl,
  state,
  challengeVerifier,
  me,
  scope,
}: {
  clientId: string,
  authorizationEndpoint: string,
  redirectUrl: string,
  state: string,
  challengeVerifier: string,
  me?: string,
  scope?: string,
}): {[key: string]: string} {
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId)
  if 
  const url = new URL(authorizationEndpoint)
  const state = 'tmp' // generate random state, following code challenge
  return {url: url.valueOf(), state}
}
```

## Browser redirects to authorization_endpoint

## Authorization endpoint fetches client info

