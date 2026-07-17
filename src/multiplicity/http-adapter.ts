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
}

function endpoint(baseUrl: string): string {
  const url = new URL(baseUrl)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Multiplicity service URL must use HTTP or HTTPS')
  }
  url.pathname = `${url.pathname.replace(/\/$/, '')}/v1/multiplicity/batch`
  url.search = ''
  url.hash = ''
  return url.toString()
}

export function createHttpMultiplicityAdapter({
  baseUrl,
  fetch: fetchOption,
}: HttpMultiplicityAdapterOptions): MultiplicityAdapter {
  const url = endpoint(baseUrl)
  const fetchRequest = fetchOption ?? globalThis.fetch

  return {
    async getBatch(
      request: MultiplicityBatchRequest,
    ): Promise<MultiplicityBatchResponse> {
      const response = await fetchRequest(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
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
