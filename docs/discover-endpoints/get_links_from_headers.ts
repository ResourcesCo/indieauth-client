import LinkHeader from 'http-link-header'

const linkRegexp = /^<([^>]*)>(.*)$/

export function linksFromHeaders(
  headers: Headers,
): {[key: string]: string} {
  const link = headers.get('link')
  console.log(headers)
  console.log(link)
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