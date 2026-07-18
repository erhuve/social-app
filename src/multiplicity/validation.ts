import {AtUri} from '@atproto/api'

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
  viewerDid: string,
  collection: string,
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
  for (const uri of state.viewerRecordUris as string[]) {
    let parsed: AtUri
    try {
      parsed = new AtUri(uri)
    } catch {
      throw new Error('Viewer record URI must be a valid AT URI')
    }
    if (parsed.host !== viewerDid || parsed.collection !== collection) {
      throw new Error('Viewer record URI must belong to the requested viewer')
    }
  }
  if (state.viewerRecordUris.length > (state.count as number)) {
    throw new Error('Viewer record count cannot exceed aggregate count')
  }
  return {
    count: state.count as number,
    viewerRecordUris: [...state.viewerRecordUris] as string[],
  }
}

function clonePostState(
  value: unknown,
  label: string,
  viewerDid: string,
): PostMultiplicityState {
  const state = object(value, label)
  return {
    like: cloneActionState(
      state.like,
      `${label}.like`,
      viewerDid,
      'app.bsky.feed.like',
    ),
    repost: cloneActionState(
      state.repost,
      `${label}.repost`,
      viewerDid,
      'app.bsky.feed.repost',
    ),
  }
}

function cloneActorState(
  value: unknown,
  label: string,
  viewerDid: string,
): ActorMultiplicityState {
  const state = object(value, label)
  return {
    follow: cloneActionState(
      state.follow,
      `${label}.follow`,
      viewerDid,
      'app.bsky.graph.follow',
    ),
  }
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
          : [
              [
                uri,
                clonePostState(posts[uri], `Post ${uri}`, request.viewerDid),
              ],
            ],
      ),
    ),
    actors: Object.fromEntries(
      request.actorDids.flatMap(did =>
        actors[did] === undefined
          ? []
          : [
              [
                did,
                cloneActorState(actors[did], `Actor ${did}`, request.viewerDid),
              ],
            ],
      ),
    ),
  }
}
