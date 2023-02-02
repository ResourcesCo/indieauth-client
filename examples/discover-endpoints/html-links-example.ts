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
