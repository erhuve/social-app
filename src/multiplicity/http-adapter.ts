import {
  requireMultiplicityCapabilities,
  setMultiplicityCapabilities,
} from './capabilities'
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

export type PublicHttpMultiplicityAdapterOptions = Pick<
  HttpMultiplicityAdapterOptions,
  'baseUrl' | 'fetch'
>

export const MULTIPLICITY_BATCH_LXM = 'computer.zo.multiplicity.getBatch'

function endpoint(
  baseUrl: string,
  path: '/v1/multiplicity/batch' | '/v1/multiplicity/public-batch',
  authenticated: boolean,
): string {
  const url = new URL(baseUrl)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Multiplicity service URL must use HTTP or HTTPS')
  }
  if (authenticated && url.protocol !== 'https:') {
    throw new Error('Authenticated multiplicity requests require HTTPS')
  }
  url.pathname = `${url.pathname.replace(/\/$/, '')}${path}`
  url.search = ''
  url.hash = ''
  return url.toString()
}

export function createHttpMultiplicityAdapter({
  baseUrl,
  fetch: fetchOption,
  getServiceAuthToken,
}: HttpMultiplicityAdapterOptions): MultiplicityAdapter {
  const url = endpoint(
    baseUrl,
    '/v1/multiplicity/batch',
    Boolean(getServiceAuthToken),
  )
  requireMultiplicityCapabilities()
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
      const result = validateBatchResponse(await response.json(), request)
      setMultiplicityCapabilities(result.capabilities)
      return result
    },
  }
}

export function createPublicHttpMultiplicityAdapter({
  baseUrl,
  fetch: fetchOption,
}: PublicHttpMultiplicityAdapterOptions): MultiplicityAdapter {
  const url = endpoint(baseUrl, '/v1/multiplicity/public-batch', false)
  requireMultiplicityCapabilities()
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
        body: JSON.stringify({
          postUris: request.postUris,
          actorDids: request.actorDids,
        }),
      })
      if (!response.ok) {
        throw new Error(
          `Multiplicity service request failed with status ${response.status}`,
        )
      }
      const result = validateBatchResponse(await response.json(), {
        ...request,
        viewerDid: '',
      })
      setMultiplicityCapabilities(result.capabilities)
      return result
    },
  }
}
