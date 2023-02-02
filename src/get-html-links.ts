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
