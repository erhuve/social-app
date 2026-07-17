import {
  type MultiplicityAdapter,
  type MultiplicityBatchRequest,
  type MultiplicityBatchResponse,
} from './types'
import {validateBatchResponse} from './validation'

export type FakeMultiplicitySeed = MultiplicityBatchResponse & {
  viewerDid: string
}

export function createFakeMultiplicityAdapter(
  seed: FakeMultiplicitySeed,
): MultiplicityAdapter {
  const validatedSeed = validateBatchResponse(seed, {
    viewerDid: seed.viewerDid,
    postUris: Object.keys(seed.posts),
    actorDids: Object.keys(seed.actors),
  })

  return {
    getBatch(request: MultiplicityBatchRequest) {
      if (request.viewerDid !== seed.viewerDid) {
        return Promise.reject(
          new Error(
            'Fake multiplicity seed does not match the requested viewer',
          ),
        )
      }
      return Promise.resolve(validateBatchResponse(validatedSeed, request))
    },
  }
}
