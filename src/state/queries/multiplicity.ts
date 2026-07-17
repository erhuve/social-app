import {type AppBskyFeedDefs} from '@atproto/api'
import {useQuery} from '@tanstack/react-query'

import {STALE} from '#/state/queries'
import {useSession} from '#/state/session'
import {MULTIPLICITY_SERVICE_URL} from '#/env'
import {
  type ActorMultiplicityState,
  createBatchedMultiplicityAdapter,
  createFallbackAction,
  createHttpMultiplicityAdapter,
  type PostMultiplicityState,
} from '#/multiplicity'
import type * as bsky from '#/types/bsky'

const adapter = MULTIPLICITY_SERVICE_URL
  ? createBatchedMultiplicityAdapter(
      createHttpMultiplicityAdapter({baseUrl: MULTIPLICITY_SERVICE_URL}),
    )
  : undefined

const POST_RQKEY = (viewerDid: string, postUri: string) => [
  'multiplicity',
  viewerDid,
  'post',
  postUri,
]

const ACTOR_RQKEY = (viewerDid: string, actorDid: string) => [
  'multiplicity',
  viewerDid,
  'actor',
  actorDid,
]

export function usePostMultiplicity(
  post: AppBskyFeedDefs.PostView,
): PostMultiplicityState {
  const {currentAccount} = useSession()
  const viewerDid = currentAccount?.did ?? ''
  const query = useQuery({
    queryKey: POST_RQKEY(viewerDid, post.uri),
    queryFn: async () => {
      const response = await adapter!.getBatch({
        viewerDid,
        postUris: [post.uri],
        actorDids: [],
      })
      const state = response.posts[post.uri]
      if (!state) throw new Error('Multiplicity response omitted the post')
      return state
    },
    enabled: Boolean(adapter && viewerDid),
    staleTime: STALE.SECONDS.FIFTEEN,
    retry: 1,
  })

  return (
    query.data ?? {
      like: createFallbackAction(post.likeCount, post.viewer?.like),
      repost: createFallbackAction(post.repostCount, post.viewer?.repost),
    }
  )
}

export function useActorMultiplicity(
  profile: bsky.profile.AnyProfileView,
): ActorMultiplicityState {
  const {currentAccount} = useSession()
  const viewerDid = currentAccount?.did ?? ''
  const query = useQuery({
    queryKey: ACTOR_RQKEY(viewerDid, profile.did),
    queryFn: async () => {
      const response = await adapter!.getBatch({
        viewerDid,
        postUris: [],
        actorDids: [profile.did],
      })
      const state = response.actors[profile.did]
      if (!state) throw new Error('Multiplicity response omitted the actor')
      return state
    },
    enabled: Boolean(adapter && viewerDid),
    staleTime: STALE.SECONDS.FIFTEEN,
    retry: 1,
  })

  return (
    query.data ?? {
      follow: createFallbackAction(
        profile.viewer?.following ? 1 : 0,
        profile.viewer?.following,
      ),
    }
  )
}
