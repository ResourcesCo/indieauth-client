# Start: User Submits ProfileUrl

[`download`](https://macchiato.dev/download)

```json
{}
```

To initiate sign-in, the user submits the profile URL to the client.

All that's needed here is a simple form where the user submits a profile URL that is submitted from the web page to the client's API endpoint.

However, for security, this is guarded with a CSRF token. This is used to prevent web apps from initiating a sign-in flow without the user's consent.

## CSRF Token

There are packages for handling CSRF tokens on npm, but many of them are tied to specific Server APIs. This will be framework-agnostic, with functions for generating a CSRF token and verifying it.

Also, a signing function will be needed for the challenge.

This will use the Web Crypto API with a CryptoKey.

Here are the functions:

- `importKey` - imports a key from a string or a Uint8Array
- `signText` - signs text using a key and returns the text w/ the signature appended
- `verifyText` - verifies text using the key
- `makeCsrfToken` - creates a token with an expiration timestamp
- `verifyCsrfToken` - verifies a token, checking the timestamp against the current time

The CSRF token will be hashed and verified using HMAC from WebCrypto, and will expire after a given time (default 10 minutes).

Here is the implementation:

[`src/sign.ts`](https://macchiato.dev/code)

```ts
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
```

## Example

Here is an example with just submitting the form and showing that it's verified.

The timeout is set to only 10 seconds so you can easily make it fail by waiting.

The sign-in form has a field for the URL and a hidden
[CSRF token](https://laravel.com/docs/8.x/csrf).

[`example/submit-profile-url/package.json`](https://macchiato.dev/code)

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

[`example/submit-profile-url/login.html`](https://macchiato.dev/code)

```html
<!doctype html>
<html charset="en">
  <head>
    <title>IndieAuth sign-in example</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/water.css@2/out/water.css">
  </head>
  <body>
    <h1>IndieAuth sign-in example</h1>
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

[`examples/submit-profile-url/app.ts`](https://macchiato.dev/code)

```ts
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { importKey, makeCsrfToken, verifyCsrfToken } from '../../src/sign'

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

  const key = await importKey(secretKey)
  const expiresIn = 5 * 1000

  app.use(express.urlencoded({ extended: true }))

  app.get('/auth/indieauth', async (req, res, next) => {
    try {
      const csrfToken = await makeCsrfToken(key)
      const html = loginHtml.replace('{csrfToken}', csrfToken)
      res.set('content-type', 'text/html')
      res.send(html)
    } catch (e) {
      next(e)
    }
  })

  app.post('/auth/indieauth', async (req, res, next) => {
    try {
      const csrfToken = req.body.csrf_token
      if (typeof csrfToken !== 'string') {
        throw new Error('Missing CSRF token')
      }
      const result = await verifyCsrfToken(key, csrfToken, expiresIn)
      res.set('content-type', 'text/html')
      res.send(result ? 'Ready to redirect' : 'error')
    } catch (e) {
      next(e)
    }
  })

  app.listen(port, () => {
    console.log(`Listening on port ${port}...`)
  })
}

run().catch(err => {
  console.error(err)
})
```

Run the example (set `SECRET_KEY` to a random string):

[`server`](https://macchiato.dev/server)

```bash
pnpm start
```

If you go to `http://localhost:3000/auth/indieauth`, it will show a form, and you can enter anything into the input and submit it, and if it's been less than ten seconds since you loaded the page, it should say "Ready to redirect".