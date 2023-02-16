import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cookieParser from 'cookie-parser'
import {
  importKey,
  makeCsrfToken,
  verifyCsrfToken,
  signText,
  verifyText,
  discoverEndpoints,
  generateCodeVerifier,
  getCodeChallenge,
  randomToken,
  buildLoginUrl,
  checkParameters,
  redeemCode
} from '../../'

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
