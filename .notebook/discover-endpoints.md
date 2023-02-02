# Discover Endpoints

[`download`](https://macchiato.dev/download)

```json
{}
```

For IndieAuth to allow you to sign in with your own website, it needs to make a request to a place specified by your website.

It uses a `Link` header or a `<link rel=>` html element. Sending it in the header is preferred.

From the Profile URL, it first tries to get the `indieauth-metadata` URL. This can be the same page as the Profile URL. If it doesn't find the `indieauth-metadata` it uses the Profile URL as the `indieauth-metadata` page.

It then gets the `indieauth-metadata` page and it uses that page to get the `authorization_endpoint` and the `token_endpoint`.

## Dependencies

To get endpoints from the headers, it uses `http-link-header`. To get endpoints from the HTML, it uses `parse5-sax-parser`. This is the example `package.json`. These dependencies will be included in the `package.json` for the library.

## Discovering endpoints from headers

[`examples/discover-endpoints/package.json`](https://macchiato.dev/code)

```json
{
  "name": "discover-endpoints",
  "version": "1.0.0",
  "private": true,
  "module": true,
  "description": "Discover endpoints for IndieAuth",
  "scripts": {
    "start": "tsx app.ts"
  },
  "license": "MIT",
  "devDependencies": {
    "tsx": "^3.12.1"
  },
  "dependencies": {
    "http-link-header": "^1.1.0",
    "parse5-sax-parser": "^7.0.0"
  }
}
```

The `authorization_endpoint` `link` `rel` needs to be retrieved from the HTTP
headers or from the HTML at the location provided in the form. This function will also support getting other keys besides "authorization_endpoint".

To attempt to get it from the HTTP headers, a HEAD request will be made. These are
third-party web servers, so a User Agent will need to be sent, since some
will reject requests without a User Agent. Not only that, some will reject all
that aren't coming from the browser, so using the same User Agent a browser would
use is something to consider. This will default to `NodeIndieAuthClient` as the user agent and allow it to be overridden.

The header will be read using [http-link-header](https://github.com/jhermsmeier/node-http-link-header).

If it can't get the links from the headers, a request will be made to the GET endpoint, and both the headers and the response body will be checked for the links. It will only check the response body if it is HTML.

[`src/get-header-links.ts`](https://macchiato.dev/code)

```ts
import LinkHeader from 'http-link-header'

export function linksFromHeaders(
  headers: Headers,
): {[key: string]: string} {
  const link = headers.get('link')
  if (link) {
    return LinkHeader.parse(link)
  }
}

export async function getHeaderLinks(
  url: string,
  rel: string,
  userAgent = 'NodeIndieAuthClient'
): Promise<string | undefined> {
  const resp = await fetch(url, {
    method: 'HEAD',
    headers: {
      'User-Agent': userAgent,
    },
  })
  if (resp.ok) {
    return linksFromHeaders(resp.headers, rel)
  }
}
```

[`examples/discover-endpoints/header-links-example.ts`](https://macchiato.dev/code)

```ts
import { getHeaderLinks } from '../../src/get-header-links.ts'

async function run() {
  let url = process.argv[2]
  try {
    new URL(url)
  } catch {
    throw new Error('Usage: $0 <url>')    
  }
  const result = await getLinksFromHeaders(url, rel)
  console.log(result)
}

run().catch(e => console.error(e))
```

To run:

```
pnpm tsx header-links-example.ts <url>
```

## Discovering endpoints from HTML

To read link tags from HTML, we'll use htmlparser2, and look at open tags for link elements.

[`src/get-html-links.ts`](https://macchiato.dev/code)

```ts
import { SAXParser } from 'parse5-sax-parser'

export function getHtmlLinks(
  html: string,
  rel: string[]
): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    let done = false
    const onopentag = (tag: string, attrs: {[key: string]: any}) => {
      if (!done && tag === 'link' && attrs['rel'] === rel) {
        done = true
        resolve(typeof attrs['href'] === 'string' ? attrs['href'] : undefined)
      }
    }
    const onend = () => {
      if (!done) resolve(undefined)
    }
    const parser = new SAXParser()
    parser.on
    parser.write(html)
    parser.end()
  })
}
```

[`examples/discover-endpoints/html-links-example.ts`](https://macchiato.dev/code)

```ts
import getLinkFromHtml from './get_link_from_html'

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

async function example() {
  const result = await getLinkFromHtml(html, 'authorization_endpoint')
  assertEquals(result, 'https://example.com/wp-json/indieauth/1.0/auth')
})

example().catch(e => console.error(e))
```

To run:

```
pnpm tsx html-links-example.ts <url>
```

