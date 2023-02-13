# Auth

[`download`](https://macchiato.dev/download)

```json
{}
```

In this part of the IndieAuth client, functions are provided for the client challenge and generating the URL, and at the end there is an example app that initiates sign-in.

The next example will get the token.

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

[`src/login-redirect-url.ts`](https://macchiato.dev/code)

```ts
export async function buildLoginUrl({
  clientId,
  authorizationEndpoint,
  redirectUrl,
  state,
  codeChallenge,
  me,
  scope,
}: {
  clientId: string,
  authorizationEndpoint: string,
  redirectUrl: string,
  state: string,
  codeChallenge: string,
  me?: string,
  scope?: string,
}): {[key: string]: string} {
  const url = new URL(authorizationEndpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUrl)
  url.searchParams.set('state', state)
  if (codeChallenge !== undefined) {
    url.searchParams.set('code_challenge', codeChallenge)
    url.searchParams.set('code_challenge_method', 'S256')
  }
  if (scope !== undefined) {
    url.searchParams.set('scope', scope)
  }
  if (me !== undefined) {
    url.searchParams.set('me', me)
  }
  return url.href
}
```

The clientId is a URL which will be fetched by the IndieAuth server to get the client info.

A state token will need to be generated and a redirect will need to be sent that saves the state token so it can be checked later on. This will also be provided by the library here. It's similar to how this provides the CSRF token. It will re-use the codeVerifier method but get a shorter one by default.

[`src/random-token.ts`](https://macchiato.dev/code)

```ts
import { generateCodeVerifier } from './code-challenge'

export function randomToken(length = 32): string {
  return generateCodeVerifier(length)
}
```

This step ends with sending a 302 redirect, as well as storing the state. In the example we'll store the state, the profile URL, and the token_endpoint, using a cookie. These will be signed using the `signText` method in `sign.ts`.

## Browser redirects to authorization_endpoint

Upon receiving the 302, the browser redirect to the authorization endpoint and the authorization endpoint will use the data in the URL to start the authorization flow.

## Authorization endpoint fetches client info

The authorization endpoint will fetch the client info. This needs to be provided in the page that's sent as the client_id. In this example there will be two pages, the home page and the sign in page, and the home page will have the microformat containing the information about the client: the name and a logo.

The logo in this example will be [png of a robot](https://robohash.org/1337.png?size=128x128) from an avatar generator site called [RoboHash](https://robohash.org/). It will be served at `/logo.png` and fetched and loaded into memory on the first request.

```html
<div class="h-app">
  <img src="/logo.png" class="u-logo">
  <a href="/" class="u-url p-name">IndieAuth Client Example</a>
</div>
```

This will only be accessible if it is running on a publicly accessible location. The URL will be passed in with the BASE_URL environment variable and default to `https://localhost/${PORT}`.

## Example

This example starts is based on code from the `start.md` page.

[`examples/auth-redirect/package.json`](https://macchiato.dev/code)

```json
{
  "name": "example-submit-profile-url",
  "version": "1.0.0",
  "private": true,
  "module": true,
  "description": "Example login form",
  "scripts": {
    "start": "tsx app.ts"
  },
  "license": "MIT",
  "devDependencies": {
    "tsx": "^3.12.1"
  },
  "dependencies": {
    "express": "^4.18.2"
  }
}
```

[`examples/auth-redirect/login.html`](https://macchiato.dev/code)

```html
<!doctype html>
<html charset="en">
  <head>
    <title>IndieAuth sign-in example</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/water.css@2/out/water.css">
  </head>
  <body>
    <div class="h-app">
      <img src="/logo.png" class="u-logo">
      <a href="/" class="u-url p-name">IndieAuth Client Example</a>
    </div>
    <main>
      <form action="/auth/indieauth" method="post">
        <label for="url"></label>
        <input type="text" name="url" id="url">
        <input type="submit" value="Sign In">
        <input type="hidden" name="csrf_token" value="{csrfToken}">
      </form>
    </main>
  </body>
</html>
```

[`examples/auth-redirect/app.ts`](https://macchiato.dev/code)

```ts
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { importKey, makeCsrfToken, verifyCsrfToken } from '../../src/sign'
import { discoverEndpoints } from '../../src/discover-endpoints.ts'
import { generateCodeVerifier, getCodeChallenge } from '../../src/code-challenge'
import { randomToken } from '../../src/random-token'
import { buildLoginUrl } from '../../src/login-redirect-url'

const secretKey = process.env.SECRET_KEY as string
const __dirname = dirname(fileURLToPath(import.meta.url))

if ((secretKey || '').length < 16) {
  throw new Error('SECRET_KEY must be given and at least 16 characters long')
}

async function run() {
  const app = express()
  const port = process.env.PORT || 3000
  const loginFile = resolve(__dirname, 'login.html')
  const loginHtml = await readFile(loginFile, 'utf8')
  const baseUrl = process.env.BASE_URL || `http://localhost:${port}`

  const key = await importKey(secretKey)
  const expiresIn = 5 * 60 * 1000

  app.use(express.urlencoded({ extended: true }))

  app.get('/', async (req, res, next) => {
    try {
      const csrfToken = await makeCsrfToken(key)
      const html = loginHtml.replace('{csrfToken}', csrfToken)
      res.set('content-type', 'text/html')
      res.send(html)
    } catch (e) {
      next(e)
    }
  })

  async function beginAuth(req, res) {
    const csrfToken = req.body.csrf_token
    if (typeof csrfToken !== 'string') {
      throw new Error('Missing CSRF token')
    }
    const verified = await verifyCsrfToken(key, csrfToken, expiresIn)
    res.set('content-type', 'text/html')
    if (!verified) {
      res.send('The request failed. Please try again.')
      return
    }
    const url = req.body.url
    const metadata = await discoverEndpoints(url)
    if (!(
      typeof metadata === 'object' && metadata !== null &&
      'authorization_endpoint' in metadata
    )) {
      res.send('Unable to find IndieAuth server')
      return
    }
    const state = randomToken()
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = await getCodeChallenge(codeVerifier)
    const loginUrl = await buildLoginUrl({
      clientId: baseUrl,
      authorizationEndpoint: metadata.authorization_endpoint,
      redirectUrl: `${baseUrl}/auth/callback`,
      state,
      codeChallenge,
      me: url,
    })
    res.redirect(loginUrl)
  }

  app.post('/auth/indieauth', async (req, res, next) => {
    try {
      await beginAuth(req, res)
    } catch (e) {
      next(e)
    }
  })

  //app.get('/logo.png', async (req, res, next) => {
  //  const image = 
  //})

  app.listen(port, () => {
    console.log(`Listening on port ${port}...`)
  })
}

run().catch(err => {
  console.error(err)
})
```