# Auth

## Client constructs auth URL & sends redirect

[Spec](https://indieauth.spec.indieweb.org/#authorization-request)

The authorization request is constructed from information retrieved in Discovery.

[`src/login-redirect.ts`](https://macchiato.dev/code)

```ts
export function buildLoginUrl({
  clientId: string,
  authorizationEndpoint: string,
  challenge
}): {[key: string]: string} {
  const url = new URL(authorizationEndpoint)
  url.searchParams.set('client_id', clientId)
  const state = 'tmp' // generate random state, following code challenge
  return {url: url.valueOf(), state}
}
```

## Browser redirects to authorization_endpoint

## Authorization endpoint fetches client info

