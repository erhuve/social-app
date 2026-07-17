import {
  type ActorMultiplicityState,
  type MultiplicityActionState,
  type MultiplicityBatchRequest,
  type MultiplicityBatchResponse,
  type PostMultiplicityState,
} from './types'

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function cloneActionState(
  value: unknown,
  label: string,
): MultiplicityActionState {
  const state = object(value, label)
  if (!Number.isSafeInteger(state.count) || (state.count as number) < 0) {
    throw new Error('Multiplicity count must be a non-negative safe integer')
  }
  if (
    !Array.isArray(state.viewerRecordUris) ||
    state.viewerRecordUris.some(uri => typeof uri !== 'string')
  ) {
    throw new Error('Viewer record URIs must be an array of strings')
  }
  if (new Set(state.viewerRecordUris).size !== state.viewerRecordUris.length) {
    throw new Error('Viewer record URIs must be unique')
  }
  if (state.viewerRecordUris.length > (state.count as number)) {
    throw new Error('Viewer record count cannot exceed aggregate count')
  }
  return {
    count: state.count as number,
    viewerRecordUris: [...state.viewerRecordUris] as string[],
  }
}

function clonePostState(value: unknown, label: string): PostMultiplicityState {
  const state = object(value, label)
  return {
    like: cloneActionState(state.like, `${label}.like`),
    repost: cloneActionState(state.repost, `${label}.repost`),
  }
}

function cloneActorState(
  value: unknown,
  label: string,
): ActorMultiplicityState {
  const state = object(value, label)
  return {follow: cloneActionState(state.follow, `${label}.follow`)}
}

export function validateBatchResponse(
  value: unknown,
  request: MultiplicityBatchRequest,
): MultiplicityBatchResponse {
  const response = object(value, 'Multiplicity response')
  const posts = object(response.posts, 'Multiplicity response posts')
  const actors = object(response.actors, 'Multiplicity response actors')

  return {
    posts: Object.fromEntries(
      request.postUris.flatMap(uri =>
        posts[uri] === undefined
          ? []
          : [[uri, clonePostState(posts[uri], `Post ${uri}`)]],
      ),
    ),
    actors: Object.fromEntries(
      request.actorDids.flatMap(did =>
        actors[did] === undefined
          ? []
          : [[did, cloneActorState(actors[did], `Actor ${did}`)]],
      ),
    ),
  }
}
