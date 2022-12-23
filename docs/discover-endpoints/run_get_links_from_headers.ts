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