import {
  type ActorMultiplicityState,
  type MultiplicityActionState,
  type MultiplicityAdapter,
  type MultiplicityBatchRequest,
  type MultiplicityBatchResponse,
  type PostMultiplicityState,
} from './types'

export type FakeMultiplicitySeed = MultiplicityBatchResponse & {
  viewerDid: string
}

function cloneActionState(
  state: MultiplicityActionState,
): MultiplicityActionState {
  if (!Number.isSafeInteger(state.count) || state.count < 0) {
    throw new Error('Multiplicity count must be a non-negative safe integer')
  }
  if (new Set(state.viewerRecordUris).size !== state.viewerRecordUris.length) {
    throw new Error('Viewer record URIs must be unique')
  }
  if (state.viewerRecordUris.length > state.count) {
    throw new Error('Viewer record count cannot exceed aggregate count')
  }
  return {
    count: state.count,
    viewerRecordUris: [...state.viewerRecordUris],
  }
}

function clonePostState(state: PostMultiplicityState): PostMultiplicityState {
  return {
    like: cloneActionState(state.like),
    repost: cloneActionState(state.repost),
  }
}

function cloneActorState(
  state: ActorMultiplicityState,
): ActorMultiplicityState {
  return {follow: cloneActionState(state.follow)}
}

export function createFakeMultiplicityAdapter(
  seed: FakeMultiplicitySeed,
): MultiplicityAdapter {
  const posts = Object.fromEntries(
    Object.entries(seed.posts).map(([uri, state]) => [
      uri,
      clonePostState(state),
    ]),
  )
  const actors = Object.fromEntries(
    Object.entries(seed.actors).map(([did, state]) => [
      did,
      cloneActorState(state),
    ]),
  )

  return {
    getBatch(request: MultiplicityBatchRequest) {
      if (request.viewerDid !== seed.viewerDid) {
        return Promise.reject(
          new Error(
            'Fake multiplicity seed does not match the requested viewer',
          ),
        )
      }
      return Promise.resolve({
        posts: Object.fromEntries(
          request.postUris.flatMap(uri => {
            const state = posts[uri]
            return state ? [[uri, clonePostState(state)]] : []
          }),
        ),
        actors: Object.fromEntries(
          request.actorDids.flatMap(did => {
            const state = actors[did]
            return state ? [[did, cloneActorState(state)]] : []
          }),
        ),
      })
    },
  }
}
