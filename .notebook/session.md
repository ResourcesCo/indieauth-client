# Session

[`download`](https://macchiato.dev/download)

```json
{}
```

In this step we'll request a token, store it, show profile information when logged in, and provide a logout button. This will also be the first full example, called `express`.

## Callback

The callback will accept the redirect from the authorization server, authenticate it, and redirect to the app to create the session.

### Check State and Issuer Parameters

The IndieAuth client needs to compare the issuer and the state parameter. This just compares two strings; however this includes a convenience function that throws descriptive errors if they don't match. This is called `checkParameters`.

### Redeem the Authorization Code for a token

It also needs to make a [request with the Authorization Code to get the token](https://indieauth.spec.indieweb.org/#redeeming-the-authorization-code). This is a POST request to the `token_endpoint`.

### Implementation

These take the callback's query parameters and the metadata from the discover directly. The configuration and other data from the session are passed individually. A possible improvement would be to pass these as JSON objects.

[`src/redeem-code.ts`](https://macchiato.dev/code)

```ts
interface CallbackQuery {
  iss: string
  state: string
  code: string
}

interface Metadata {
  token_endpoint: string
  issuer: string | undefined | null
}

export function checkParameters(
  query: CallbackQuery, metadata: Metadata, state: string
): void {
  if (state !== query.state) {
    throw new Error('state parameter must match')
  }
  const issuer = metadata.issuer
  if ((issuer || '').length > 0 && query.iss !== issuer) {
    throw new Error('issuer must match')
  }
}

interface GetTokenParams {
  query: CallbackQuery
  metadata: Metadata
  clientId: string
  redirectUrl: string
  codeVerifier?: string
}

export async function redeemCode(
  {query, metadata, clientId, redirectUrl, codeVerifier}: GetTokenParams
): Promise<any> {
  const formData = new FormData()
  formData.append('grant_type', 'authorization_code')
  formData.append('code', query.code)
  formData.append('client_id', clientId)
  formData.append('redirect_uri', redirectUrl)
  if (typeof codeVerifier === 'string') {
    formData.append('code_verifier', codeVerifier)
  }
  const resp = await fetch(metadata.token_endpoint, {
    method: 'POST',
    body: formData,
    headers: {
      accept: 'application/json',
    },
  })
  return await resp.json()
}
```

## Example

This example starts is based on code from the `start.md` page.

The package adds the `cookie-parser` middleware because it will need to store cookies.

[`examples/express/package.json`](https://macchiato.dev/code)

```json
{
  "name": "example-express",
  "version": "1.0.0",
  "private": true,
  "module": true,
  "description": "Example IndieAuth login w/ Express",
  "scripts": {
    "start": "tsx app.ts"
  },
  "license": "MIT",
  "devDependencies": {
    "tsx": "^3.12.1"
  },
  "dependencies": {
    "cookie-parser": "^1.4.6",
    "express": "^4.18.2"
  }
}
```

The HTML page has a placeholder for `bodyClass` and `me` as well as separate things it shows for logged in and logged out, and CSS to hide it based on `bodyClass`.

[`examples/express/login.html`](https://macchiato.dev/code)

```html
<!doctype html>
<html charset="en">
  <head>
    <title>IndieAuth sign-in example</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/water.css@2/out/water.css">
    <style type="text/css">
      body.loggedIn .login { display: none; }
      body.loggedOut .info { display: none; }
    </style>
  </head>
  <body class="{bodyClass}">
    <div class="h-app">
      <img src="/logo.png" class="u-logo">
      <a href="/" class="u-url p-name">IndieAuth Client Example</a>
    </div>
    <main>
      <form class="login" action="/auth/indieauth" method="post">
        <label for="url"></label>
        <input type="text" name="url" id="url">
        <input type="submit" value="Sign In">
        <input type="hidden" name="csrf_token" value="{csrfToken}">
      </form>
      <div class="info">
        Logged in as: {me}
      </div>
    </main>
  </body>
</html>
```

[`examples/express/app.ts`](https://macchiato.dev/code)

```ts
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cookieParser from 'cookie-parser'
import {
  importKey, makeCsrfToken, verifyCsrfToken, signText, verifyText
} from '../../src/sign'
import { discoverEndpoints } from '../../src/discover-endpoints.ts'
import { generateCodeVerifier, getCodeChallenge } from '../../src/code-challenge'
import { randomToken } from '../../src/random-token'
import { buildLoginUrl } from '../../src/login-redirect-url'
import { checkParameters, redeemCode } from '../../src/redeem-code'

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
  const clientId = `${baseUrl}/`
  const redirectUrl = `${baseUrl}/auth/callback`
  const scope = process.env.SCOPE

  const key = await importKey(secretKey)
  const expiresIn = 5 * 60 * 1000

  app.use(express.urlencoded({ extended: true }))
  app.use(cookieParser())

  async function getCookieData(req) {
    const cookie = req.cookies['session-data']
    if (typeof cookie === 'string') {
      const data = JSON.parse(await verifyText(key, cookie))
      return {loggedIn: true, ...data}
    } else {
      return {loggedIn: false}
    }
  }

  async function home(req, res) {
    const csrfToken = await makeCsrfToken(key)
    const {loggedIn, me} = await getCookieData(req)
    const html = (
      loginHtml
      .replace('{csrfToken}', csrfToken)
      .replace('{bodyClass}', loggedIn ? 'loggedIn' : 'loggedOut')
      .replace('{me}', me)
    )
    res.set('content-type', 'text/html')
    res.send(html)
  }

  app.get('/', async (req, res, next) => {
    try {
      await home(req, res)
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
      clientId,
      authorizationEndpoint: metadata.authorization_endpoint,
      redirectUrl,
      state,
      codeChallenge,
      me: url,
      ...(scope ? {scope} : {}),
    })
    const cookieOpts = { expires: new Date(Date.now() + 300000), httpOnly: true }
    const iss = metadata['iss']
    const data = JSON.stringify({me: url, state, codeVerifier, metadata})
    res.cookie('indieauth-data', await signText(key, data), cookieOpts)
    res.redirect(loginUrl)
  }

  app.post('/auth/indieauth', async (req, res, next) => {
    try {
      await beginAuth(req, res)
    } catch (e) {
      next(e)
    }
  })

  async function handleCallback(req, res) {
    const data = JSON.parse(await verifyText(key, req.cookies['indieauth-data']))
    checkParameters(req.query, data.metadata, data.state)
    const codeVerifier = data.codeVerifier
    const sessionData = await redeemCode({
      query: req.query, metadata: data.metadata, clientId, redirectUrl, codeVerifier
    })
    const cookieOpts = { expires: new Date(Date.now() + 300000), httpOnly: true }
    console.log(JSON.stringify(sessionData, null, 2))
    res.cookie('session-data', await signText(key, JSON.stringify(sessionData)))
    res.redirect('/')
  }

  app.get('/auth/callback', async (req, res, next) => {
    try {
      await handleCallback(req, res)
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