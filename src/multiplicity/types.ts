export const MAX_VIEWER_RECORD_URIS = 1_000

export type MultiplicityActionState = {
  count: number
  viewerRecordUris: readonly string[]
}

export type PostMultiplicityState = {
  like: MultiplicityActionState
  repost: MultiplicityActionState
}

export type ActorMultiplicityState = {
  follow: MultiplicityActionState
}

export type MultiplicityBatchRequest = {
  viewerDid: string
  postUris: readonly string[]
  actorDids: readonly string[]
}

export type MultiplicityBatchResponse = {
  posts: Readonly<Record<string, PostMultiplicityState>>
  actors: Readonly<Record<string, ActorMultiplicityState>>
}

export interface MultiplicityAdapter {
  getBatch(
    request: MultiplicityBatchRequest,
  ): Promise<MultiplicityBatchResponse>
}
