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
