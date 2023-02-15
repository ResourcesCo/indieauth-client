# Session

[`download`](https://macchiato.dev/download)

```json
{}
```

In this step we'll request a token, store it, show profile information when logged in, and provide a logout button. This will also be the first full example, called `express`.

## Callback

The callback will accept the redirect from the authorization server, authenticate it, and redirect to the app to create the session.

## Example

This example starts is based on code from the `start.md` page.

In `beginAuth` before the redirect it will set a signed cookie for the profile URL and the state. It will then use these to authenticate the callback. Upon receiving the callback it will acquire and set the token and redirect with a new cookie to store the token. In an app with a database it may store a session key and store the token in the database.

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

[`examples/express/login.html`](https://macchiato.dev/code)

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
  app.use(cookieParser())

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
    const cookieOpts = { expires: new Date(Date.now() + 300000), httpOnly: true }
    res.cookie('indieauth-me', await signText(key, url), cookieOpts)
    res.cookie('indieauth-state', await signText(key, state), cookieOpts)
    res.cookie('indieauth-code-verifier', await signText(key, codeVerifier), cookieOpts)
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
    const profileUrl = await verifyText(key, req.cookies['indieauth-me'])
    const state = await verifyText(key, req.cookies['indieauth-state'])
    const codeVerifier = await verifyText(key, req.cookies['indieauth-code-verifier'])
    console.log({
      code: req.query.code,
      state: req.query.state,
      iss: req.query.iss,
      cookieState: state,
      profileUrl,
      codeVerifier,
    })
    if (state !== req.query.state) {
      throw new Error('state parameter must match')
    }
    // get the token
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