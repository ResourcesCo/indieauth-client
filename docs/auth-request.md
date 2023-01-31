# Make Authorization Request

To redirect, we need the authorization endpoint from the previous step, along with some other things. These are on the [Authorization Request](https://indieauth.spec.indieweb.org/20200926/#authorization-request) section of the [IndieAuth spec](https://indieauth.spec.indieweb.org/20200926/). One of these things is a [PKCE Code Challenge](https://tonyxu-io.github.io/pkce-generator/).

PKCE uses a code challenge method to ensure that the client requesting an
authorization code and the client using the authorization code are the
same. The code challenge method is HMAC with SHA-256. WebCrypto has support for this.

### Signing and verifying

The signer and verifier takes a secret key, which is stored in a private
variable of a class. It signs and verifies using HMAC. The algorithm and
the key are supplied by the server. Unlike jwt, it doesn't provide an
option for the client to supply their own algorithm, which [on some
badly-configured installations could include "none"](https://auth0.com/blog/critical-vulnerabilities-in-json-web-token-libraries/).

This only supports one key per signer instance, but a caller can try
verifying a key with more than one signer instance in order to support
gradually moving to a new key without signing everyone out.

[`/sign.ts`](https://macchiato.dev/code)

```ts
export async function createSigner(key: string): Promise<Signer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    {name: 'HMAC', hash: 'SHA-256'},
    false,
    ['sign', 'verify']
  )
  return new Signer(cryptoKey)
}

class Signer {
  #key: CryptoKey

  constructor(key: CryptoKey) {
    this.#key = key
  }

  async sign(text: string): Promise<string> {
    const signature = await crypto.subtle.sign(
      {name: "HMAC"},
      this.#key,
      new TextEncoder().encode(text)
    )
    const encodedSignature = encode(new Uint8Array(signature))
    return `${text}|${encodedSignature}`
  }

  async verify(signedText: string): Promise<string> {
    const index = signedText.lastIndexOf('|')
    if (index === -1) {
      throw new Error('Verification failed: signature not found')
    }
    const signature = decode(signedText.substr(index + 1))
    const text = signedText.substr(0, index)
    const verified = await crypto.subtle.verify(
      {name: "HMAC"},
      this.#key,
      signature,
      new TextEncoder().encode(text)
    )
    if (verified) {
      return text
    } else {
      throw new Error('Verification failed: crypto.subtle.verify() returned false')
    }
  }
}
```

[`src/sign.spec.ts`](https://macchiato.dev/code)

```ts
import { createSigner } from "./sign"

Deno.test('signs and verifies successfully', async () => {
  const input = 'hello'
  const signer = await createSigner('abcweaerewjnlnwej9302432n423ajfwnenwjewjajjfajwl')
  const signed = await signer.sign(input)
  assertStringIncludes(signed, '|')
  const verified = await signer.verify(signed)
  assertEquals(input, verified)
})

Deno.test("verification fails with missing or wrong signature", async () => {
  const input = 'hello'
  const signer = await createSigner('abcweaerewjnlnwej9302432n423ajfwnenwjewjajjfajwl')
  const signed = await signer.sign(input)
  await assertRejects(() => signer.verify(input))
  const signed2 = await signer.sign('world')
  const switched = `${signed.split('|')[0]}|${signed2.split('|')[1]}`
  await assertRejects(() => signer.verify(switched))
})
```

### HTML Links

##### `get_html_links.ts`

```ts
import { Parser } from 'htmlparser2'

export default async function getHtmlLinks(
  response: Response,
  rels: string[]
): Promise<{[key: string]: string}> {
  const html = await response.text()
  return await new Promise((resolve, reject) => {
    let done = false
    const links: {[key: string]: string} = {}
    const checkAndResolve = (force = false) => {
      if (force || rels.every(rel => links[rel] !== undefined)) {
        done = true
        resolve(links)
      }
    }
    const onopentag = (tag: string, attrs: {[key: string]: any}) => {
      if (
        !done &&
        tag === 'link' &&
        rels.includes(attrs['rel']) &&
        links[attrs['rel']] === undefined
      ) {
        links[attrs['rel']] = attrs['href'] ?? ''
        checkAndResolve()
      }
    }
    const onend = () => {
      if (!done) checkAndResolve(true)
    }
    const parser = new Parser({onopentag, onend})
    parser.write(html)
    parser.end()
  })
}
```

##### `get_html_links_test.ts`

```ts
import { assertEquals } from "https://deno.land/std@0.110.0/testing/asserts.ts"
import getHtmlLinks from './get_html_links.ts'

const html = `<!doctype html>
<html>
  <head>
    <title>Test</title>
    <link rel="authorization_endpoint" href="https://example.com/wp-json/indieauth/1.0/auth">
  </head>
  <body>
    <h1>Test</h1>
  </body>
</html>`

Deno.test('read html link', async () => {
  const links = await getHtmlLinks(new Response(html), ['authorization_endpoint'])
  assertEquals(
    links['authorization_endpoint'],
    'https://example.com/wp-json/indieauth/1.0/auth'
  )
})
```

### Links from headers or HTML

This gets link values from the headers or the HTML.

##### `get_links.ts`

```ts
import getHtmlLinks from './get_html_links.ts'

const linkRegexp = /^<([^>]*)>(.*)$/

export function getHeaderLinks(
  headers: Headers,
  rels: string[]
): {[key: string]: string} {
  const result: {[key: string]: string} = {}
  for (const linkText of (headers.get('link') ?? '').split(',')) {
    const [href, remainingText] = (linkText.trim().match(linkRegexp) ?? []).slice(1)
    if (href !== undefined && remainingText !== undefined) {
      for (const s of remainingText.split('')) {
        const equalsIndex = s.indexOf('=')
        const key = s.substr(0, equalsIndex).trim()
        const value = s.substr(equalsIndex + 1).trim()
        if (key === 'rel') {
          for (const rel of rels) {
            if (result[rel] === undefined && [`"${rel}"`, rel].includes(value)) {
              result[rel] = href
              if (rels.every(rel => result[rel] !== undefined)) {
                return result
              }
            }
          }
          break
        }
      }
    }
  }
  return result
}

// Client for customizing request and helping with testing
type Client = (request: Request) => Promise<Response>

function makeDefaultClient(userAgent: string): Client {
  return (request) => {
    const newReq = request.clone()
    if (!newReq.headers.get('User-Agent')) {
      newReq.headers.set('User-Agent', userAgent)
    }
    return fetch(newReq)
  }
}

type LinkReader = (
  response: Response,
  rels: string[]
) => Promise<{[key: string]: string}>

type GetLinksOptions = {
  userAgent?: string,
  makeHeadRequest?: boolean,
  client?: Client
}
export default async function getLinks(
  url: string,
  rels: string[],
  {
    userAgent = 'DenoIndieAuth',
    makeHeadRequest = true,
    client: clientOption
  }: GetLinksOptions,
): Promise<{[key: string]: string}> {
  const client = clientOption ?? makeDefaultClient(userAgent)
  const linkResults: {[key: string]: string}[] = []
  const getResult = (partial: boolean = false) => {
    const result = linkResults.reduceRight(
      (acc, v) => ({...acc, ...v}), {}
    )
    if (partial || rels.every(rel => result[rel])) {
      return result
    }
  }
  if (makeHeadRequest) {
    const resp = await client(new Request(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': userAgent,
      }
    }))
    if (resp.ok) {
      linkResults.push(getHeaderLinks(resp.headers, rels))
      if (Object.keys(linkResults.at(-1) ?? {}).length > 0) {
        const result = getResult()
        if (result !== undefined) {
          return result
        }
      }
    }
  }
  const resp = await client(new Request(url, {
    headers: {
      'Accept': 'text/html',
      'User-Agent': userAgent,
    },
  }))
  if (resp.ok) {
    linkResults.push(getHeaderLinks(resp.headers, rels))
    if (Object.keys(linkResults.at(-1) ?? {}).length > 0) {
      const result = getResult()
      if (result !== undefined) {
        return result
      }
    }
    try {
      const links = await getHtmlLinks(resp, rels)
    } catch (err) {
      // do nothing
    }
  }
  return getResult(true) ?? {}
}
```

##### `get_links_test.ts`

```ts
import { assertEquals } from "https://deno.land/std@0.110.0/testing/asserts.ts"
import getLinks from './get_links.ts'

Deno.test('from head', async () => {
  const client: (request: Request) => Promise<Response> = async (request) => {
    const link = '<https://example.com/auth> rel="authorization_endpoint"'
    if (request.method.toUpperCase() === 'HEAD') {
      return new Response(undefined, { headers: {'Link': link} })
    } else {
      return new Response(undefined, { status: 500 })
    }
  }
  const links = await getLinks(
    'https://example.com/testuser',
    ['authorization_endpoint', 'misc'],
    {client, getHtmlLinks}
  )
  assertEquals(links['authorization_endpoint'], 'https://example.com/auth')
})

Deno.test('from html', async () => {
  const client: (request: Request) => Promise<Response> = async (request) => {
    const link = '<https://example.com/auth> rel="authorization_endpoint"'
    if (request.method.toUpperCase() === 'HEAD') {
      return new Response(undefined, { headers: {'Link': link} })
    } else {
      return new Response(undefined, { status: 500 })
    }
  }
  const links = await getLinks(
    'https://example.com/testuser',
    ['authorization_endpoint', 'misc'],
    {client, getHtmlLinks}
  )
  assertEquals(links['authorization_endpoint'], 'https://example.com/auth')
})

Deno.test('from both', async () => {
  const client: (request: Request) => Promise<Response> = async (request) => {
    const link = '<https://example.com/auth> rel="authorization_endpoint"'
    if (request.method.toUpperCase() === 'HEAD') {
      return new Response(undefined, { headers: {'Link': link} })
    } else {
      return new Response(undefined, { status: 500 })
    }
  }
  const links = await getLinks(
    'https://example.com/testuser',
    ['authorization_endpoint', 'misc'],
    {client, getHtmlLinks}
  )
  assertEquals(links['authorization_endpoint'], 'https://example.com/auth')
})

Deno.test('from head', async () => {
  const client: (request: Request) => Promise<Response> = async (request) => {
    const link = '<https://example.com/auth> rel="authorization_endpoint"'
    if (request.method.toUpperCase() === 'HEAD') {
      return new Response(undefined, { headers: {'Link': link} })
    } else {
      return new Response(undefined, { status: 500 })
    }
  }
  const links = await getLinks(
    'https://example.com/testuser',
    ['authorization_endpoint', 'misc'],
    {client, getHtmlLinks}
  )
  assertEquals(links['authorization_endpoint'], 'https://example.com/auth')
})
```

### Constructing the redirect URL

### Redirecting with cookies for the state and code challenge