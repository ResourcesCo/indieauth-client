export async function buildLoginUrl({
  clientId,
  authorizationEndpoint,
  redirectUrl,
  state,
  codeChallenge,
  me,
  scope,
}: {
  clientId: string,
  authorizationEndpoint: string,
  redirectUrl: string,
  state: string,
  codeChallenge: string,
  me?: string,
  scope?: string,
}): {[key: string]: string} {
  const url = new URL(authorizationEndpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUrl)
  url.searchParams.set('state', state)
  if (codeChallenge !== undefined) {
    url.searchParams.set('code_challenge', codeChallenge)
    url.searchParams.set('code_challenge_method', 'S256')
  }
  if (scope !== undefined) {
    url.searchParams.set('scope', scope)
  }
  if (me !== undefined) {
    url.searchParams.set('me', me)
  }
  return url.href
}
