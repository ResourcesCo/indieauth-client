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

  async function handleCallback(req, res) {
    console.log({
      code: req.query.code,
      state: req.query.state,
      iss: req.query.iss,
    })
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
