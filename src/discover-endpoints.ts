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
