# Discover Endpoints

[`download`](https://macchiato.dev/download)

```json
{}
```

For IndieAuth to allow you to sign in with your own website, it needs to make a request to a place specified by your website.

It uses a `Link` header or a `<link rel=>` html element. Sending it in the header is preferred.

From the Profile URL, it first tries to get the `indieauth-metadata` URL. This can be the same page as the Profile URL. If it doesn't find the `indieauth-metadata` it gets `authorization_endpoint` and `token_endpoint` from the profile's header or HTML.

If it does find the `indieauth-metadata` URL, it downloads JSON from it and gets the the `authorization_endpoint` and the `token_endpoint` as top-level values from the JSON - or rather, just returns them directly.

## Dependencies

To get endpoints from the headers, it uses `http-link-header`. To get endpoints from the HTML, it uses `parse5-sax-parser`. This is the example `package.json`. These dependencies will be included in the `package.json` for the library.

[`examples/discover-endpoints/package.json`](https://macchiato.dev/code)

```json
{
  "name": "discover-endpoints",
  "version": "1.0.0",
  "private": true,
  "type": "module",
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

## Discovering endpoints from headers

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
    const results = LinkHeader.parse(link).refs
    const links: {[key: string]: string} = {}
    for (const result of results) {
      if (!(result.rel in links)) {
        links[result.rel] = result.uri
      }
    }
    return links
  }
}

export async function getHeaderLinks(
  url: string,
  userAgent = 'NodeIndieAuthClient'
): Promise<string | undefined> {
  const res = await fetch(url, {
    method: 'HEAD',
    headers: {
      'User-Agent': userAgent,
    },
    redirect: 'follow',
  })
  if (res.ok) {
    return linksFromHeaders(res.headers)
  }
}
```

[`examples/discover-endpoints/header-links-example.ts`](https://macchiato.dev/code)

```ts
import { getHeaderLinks } from '../../src/get-header-links'

async function run() {
  let url = process.argv[2]
  try {
    new URL(url)
  } catch {
    throw new Error('Usage: $0 <url>')
  }
  const result = await getHeaderLinks(url)
  console.log(result)
}

run().catch(e => console.error(e))
```

To run:

```
pnpm tsx header-links-example.ts <url>
```

## Discovering endpoints from HTML

NOTE: This is not yet working/tested

TODO: Get this working and add an example of an IndieAuth server that doesn't have the links in the header.

To read link tags from HTML, we'll use [parse5-sax-parser](https://www.npmjs.com/package/parse5-sax-parser), and look at open tags for link elements. The first one found is used and the rest are ignored.

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

## Discover Endpoints function

This is the overall discover function that uses the components to return the `authorization_endpoint`, `token_endpoint`, and `code_challenge_methods_supported`, as well as any others found.

[`src/discover-endpoints.ts`](https://macchiato.dev/code)

```ts
import { getHeaderLinks } from './get-header-links'

export async function discoverEndpoints(
  url: string,
  userAgent = 'NodeIndieAuthClient'
): Promise<string | undefined> {
  const links = await getHeaderLinks(url, userAgent)
  if (typeof links === 'object' && links !== null) {
    if ('indieauth-metadata' in links) {
      const res = await fetch(links['indieauth-metadata'], {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': userAgent,
        },
        redirect: 'follow',
      })
      if (res.ok) {
        return await res.json()
      }
    } else {
      return links
    }
  }
}
```

[`examples/discover-endpoints/discover-endpoints-example.ts`](https://macchiato.dev/code)

```ts
import { discoverEndpoints } from '../../src/discover-endpoints'

async function run() {
  let url = process.argv[2]
  try {
    new URL(url)
  } catch {
    throw new Error('Usage: $0 <url>')
  }
  const result = await discoverEndpoints(url)
  console.log(result)
}

run().catch(e => console.error(e))
```

To run:

```
pnpm tsx discover-endpoints-example.ts <url>
```