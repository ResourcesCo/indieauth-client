# Step 2: Discover Endpoints

For IndieAuth to allow you to sign in with your own website, it needs to make a request to a place specified by your website. This can be sent in the header or in the HTML as a meta tag. Sending it in the header is preferred.

## Discovering endpoints from headers

[`docs/discover-endpoints/package.json`](https://macchiato.dev/code)

```json
{
  "name": "discover-endpoints",
  "version": "1.0.0",
  "private": true,
  "module": true,
  "description": "Discover endpoints for IndieAuth",
  "license": "MIT",
  "devDependencies": {
    "tsx": "^3.12.1"
  },
  "dependencies": {
    "htmlparser2": "^8.0.1",
    "http-link-header": "^1.1.0"
  }
}
```

The `authorization_endpoint` `link` `rel` needs to be retrieved from the HTTP
headers or from the HTML at the location provided in the form. This function will also support getting other keys besides "authorization_endpoint".

To attempt to get it from the HTTP headers, a HEAD request will be made. These are
third-party web servers, so a User Agent will need to be sent, since some
will reject requests without a User Agent. Not only that, some will reject all
that aren't coming from the browser, so using the same User Agent a browser would
use is something to consider. This will default to NodeIndieAuthClient as the user agent
and allow it to be overridden.

The header will be read using [http-link-header](https://github.com/jhermsmeier/node-http-link-header).

If it can't get the links from the headers, a request will be made to the GET endpoint, and both the headers and the response body will be checked for the links. It will only check the response body if it is HTML.

[`docs/discover-endpoints/get_links_from_headers.ts`](https://macchiato.dev/code)

```ts
import LinkHeader from 'http-link-header'

const linkRegexp = /^<([^>]*)>(.*)$/

export function linksFromHeaders(
  headers: Headers,
): {[key: string]: string} {
  const link = headers.get('link')
  if (link) {
    return LinkHeader.parse(link)
  }
}

export default async function getLinkFromHeader(
  url: string,
  rel: string,
  userAgent = 'NodeIndieAuthClient'
): Promise<string | undefined> {
  const resp = await fetch(url, {
    method: 'HEAD',
    headers: {
      'User-Agent': userAgent,
    }
  })
  if (resp.ok) {
    return linksFromHeaders(resp.headers, rel)
  }
}
```

[`docs/discover-endpoints/run_get_links_from_headers.ts`](https://macchiato.dev/code)

```ts
import getLinksFromHeaders from './get_links_from_headers'

async function run() {
  const [url, rel] = process.argv.slice(2)
  if (![url, rel].every(a => typeof a === 'string' && a.length > 0)) {
    throw new Error('Usage: $0 <url> <rel>')
  }
  const result = await getLinksFromHeaders(url, rel)
  console.log(result)
}

run().catch(e => console.error(e))
```

To run:

```
pnpm tsx run_get_links_from_headers.ts
```

## Discovering endpoints from HTML

To read link tags from HTML, we'll use htmlparser2, and look at open tags for link elements.

[`docs/step2/get_link_from_html.ts`](https://macchiato.dev/code)

```ts
import { Parser } from 'htmlparser2'

export default function getLinkFromHtml(
  html: string,
  rel: string
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
    const parser = new Parser({onopentag, onend})
    parser.write(html)
    parser.end()
  })
}
```

[`docs/step2/get_link_from_html_example.ts`](https://macchiato.dev/code)

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

