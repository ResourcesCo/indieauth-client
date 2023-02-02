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
