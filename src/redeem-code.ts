interface CallbackQuery {
  iss: string
  state: string
  code: string
}

interface Metadata {
  token_endpoint: string
  issuer: string | undefined | null
}

export function checkParameters(
  query: CallbackQuery, metadata: Metadata, state: string
): void {
  if (state !== query.state) {
    throw new Error('state parameter must match')
  }
  const issuer = metadata.issuer
  if ((issuer || '').length > 0 && query.iss !== issuer) {
    throw new Error('issuer must match')
  }
}

interface GetTokenParams {
  query: CallbackQuery
  metadata: Metadata
  clientId: string
  redirectUrl: string
  codeVerifier?: string
}

export async function redeemCode(
  {query, metadata, clientId, redirectUrl, codeVerifier}: GetTokenParams
): Promise<any> {
  const formData = new FormData()
  formData.append('grant_type', 'authorization_code')
  formData.append('code', query.code)
  formData.append('client_id', clientId)
  formData.append('redirect_uri', redirectUrl)
  if (typeof codeVerifier === 'string') {
    formData.append('code_verifier', codeVerifier)
  }
  const resp = await fetch(metadata.token_endpoint, {
    method: 'POST',
    body: formData,
    headers: {
      accept: 'application/json',
    },
  })
  return await resp.json()
}
