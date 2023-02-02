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
