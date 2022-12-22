import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import asyncHandler from 'express-async-handler'

const secretKey = process.env.SECRET_KEY as string
const __dirname = dirname(fileURLToPath(import.meta.url))

async function sign(key: CryptoKey, text: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    {name: "HMAC"},
    key,
    new TextEncoder().encode(text)
  )
  const encodedSignature = Buffer.from(new Uint8Array(signature)).toString('base64url')
  return `${text}|${encodedSignature}`
}

async function verify(key: CryptoKey, signedText: string): Promise<string> {
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

async function makeCsrfToken(key: CryptoKey): Promise<string> {
  return await sign(key, `csrf:${new Date().valueOf()}`)
}

async function verifyCsrfToken(key: CryptoKey, csrfToken: string): Promise<boolean> {
  const token = await verify(key, csrfToken)
  const parts = token.split(':')
  if (parts.length === 2 && parts[0] === 'csrf') {
    const ts = parseInt(parts[1])
    if (Number.isInteger(ts)) {
      const tenMinutesAgo = new Date().valueOf() - (10 * 60 * 1000)
      return ts >= tenMinutesAgo
    }
  }
  return false
}

async function run() {
  const app = express()
  const port = process.env.PORT || 3000
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secretKey),
    {name: 'HMAC', hash: 'SHA-256'},
    false,
    ['sign', 'verify']
  )
  const loginFile = resolve(__dirname, 'login.html')
  const loginHtml = await readFile(loginFile, 'utf8')

  app.use(express.urlencoded({ extended: true }))

  app.get('/auth/indieauth', asyncHandler(async(req, res) => {
    const csrfToken = await makeCsrfToken(key)
    const html = loginHtml.replace('{csrfToken}', csrfToken)
    res.set('content-type', 'text/html')
    res.send(html)
  }))

  app.post('/auth/indieauth', asyncHandler(async (req, res) => {
    const csrfToken = req.body.csrf_token
    if (typeof csrfToken !== 'string') {
      throw new Error('Missing CSRF token')
    }
    const result = await verifyCsrfToken(key, csrfToken)
    res.set('content-type', 'text/html')
    res.send(result ? 'Ready to redirect' : 'error')
  }))

  app.listen(port, () => {
    console.log(`Listening on port ${port}...`)
  })
}

run().catch(err => {
  console.error(err)
})