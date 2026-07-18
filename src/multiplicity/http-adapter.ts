import {
  type MultiplicityAdapter,
  type MultiplicityBatchRequest,
  type MultiplicityBatchResponse,
} from './types'
import {validateBatchResponse} from './validation'

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type HttpMultiplicityAdapterOptions = {
  baseUrl: string
  fetch?: Fetch
  getServiceAuthToken?: () => Promise<string>
}

export const MULTIPLICITY_BATCH_LXM = 'computer.zo.multiplicity.getBatch'

function endpoint(baseUrl: string, authenticated: boolean): string {
  const url = new URL(baseUrl)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Multiplicity service URL must use HTTP or HTTPS')
  }
  if (authenticated && url.protocol !== 'https:') {
    throw new Error('Authenticated multiplicity requests require HTTPS')
  }
  url.pathname = `${url.pathname.replace(/\/$/, '')}/v1/multiplicity/batch`
  url.search = ''
  url.hash = ''
  return url.toString()
}

export function createHttpMultiplicityAdapter({
  baseUrl,
  fetch: fetchOption,
  getServiceAuthToken,
}: HttpMultiplicityAdapterOptions): MultiplicityAdapter {
  const url = endpoint(baseUrl, Boolean(getServiceAuthToken))
  const fetchRequest = fetchOption ?? globalThis.fetch

  return {
    async getBatch(
      request: MultiplicityBatchRequest,
    ): Promise<MultiplicityBatchResponse> {
      const token = await getServiceAuthToken?.()
      const response = await fetchRequest(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          ...(token ? {Authorization: `Bearer ${token}`} : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })
      if (!response.ok) {
        throw new Error(
          `Multiplicity service request failed with status ${response.status}`,
        )
      }
      return validateBatchResponse(await response.json(), request)
    },
  }
}
