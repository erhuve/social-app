import {type AppBskyFeedDefs, type AtpAgent} from '@atproto/api'
import {type QueryClient, useQuery} from '@tanstack/react-query'

import {getServiceAuthAudFromUrl} from '#/lib/strings/url-helpers'
import {STALE} from '#/state/queries'
import {useAgent, useSession} from '#/state/session'
import {MULTIPLICITY_SERVICE_DID, MULTIPLICITY_SERVICE_URL} from '#/env'
import {
  type ActorMultiplicityState,
  applyMultiplicityOverlay,
  createBatchedMultiplicityAdapter,
  createFallbackAction,
  createHttpMultiplicityAdapter,
  MULTIPLICITY_BATCH_LXM,
  type MultiplicityAdapter,
  multiplicityReconciliationKey,
  type PostMultiplicityState,
  reconcileMultiplicityAction,
  requireMultiplicityCapabilities,
} from '#/multiplicity'
import type * as bsky from '#/types/bsky'

const serviceAuthAudience = MULTIPLICITY_SERVICE_URL
  ? (MULTIPLICITY_SERVICE_DID ??
    getServiceAuthAudFromUrl(MULTIPLICITY_SERVICE_URL))
  : null
if (MULTIPLICITY_SERVICE_URL) requireMultiplicityCapabilities()
const adapters = new WeakMap<AtpAgent, MultiplicityAdapter>()

function getMultiplicityAdapter(
  agent: AtpAgent,
  viewerDid: string,
): MultiplicityAdapter | undefined {
  if (
    !MULTIPLICITY_SERVICE_URL ||
    !serviceAuthAudience ||
    !viewerDid.startsWith('did:plc:')
  ) {
    return undefined
  }
  const existing = adapters.get(agent)
  if (existing) return existing

  const adapter = createBatchedMultiplicityAdapter(
    createHttpMultiplicityAdapter({
      baseUrl: MULTIPLICITY_SERVICE_URL,
      getServiceAuthToken: async () => {
        const {data} = await agent.com.atproto.server.getServiceAuth({
          aud: serviceAuthAudience,
          lxm: MULTIPLICITY_BATCH_LXM,
        })
        return data.token
      },
    }),
  )
  adapters.set(agent, adapter)
  return adapter
}

export const POST_MULTIPLICITY_RQKEY = (viewerDid: string, postUri: string) => [
  'multiplicity',
  viewerDid,
  'post',
  postUri,
]

export const ACTOR_MULTIPLICITY_RQKEY = (
  viewerDid: string,
  actorDid: string,
) => ['multiplicity', viewerDid, 'actor', actorDid]

export function usePostMultiplicity(
  post: AppBskyFeedDefs.PostView,
): PostMultiplicityState {
  const agent = useAgent()
  const {currentAccount} = useSession()
  const viewerDid = currentAccount?.did ?? ''
  const adapter = getMultiplicityAdapter(agent, viewerDid)
  const fallback = {
    like: createFallbackAction(post.likeCount, post.viewer?.like),
    repost: createFallbackAction(post.repostCount, post.viewer?.repost),
  }
  const query = useQuery({
    queryKey: POST_MULTIPLICITY_RQKEY(viewerDid, post.uri),
    queryFn: async () => {
      const response = await adapter!.getBatch({
        viewerDid,
        postUris: [post.uri],
        actorDids: [],
      })
      const state = response.posts[post.uri]
      if (!state) throw new Error('Multiplicity response omitted the post')
      return {
        like: reconcileMultiplicityAction(
          multiplicityReconciliationKey(viewerDid, 'post', post.uri, 'like'),
          state.like,
          fallback.like,
        ),
        repost: reconcileMultiplicityAction(
          multiplicityReconciliationKey(viewerDid, 'post', post.uri, 'repost'),
          state.repost,
          fallback.repost,
        ),
      }
    },
    enabled: Boolean(adapter && viewerDid),
    staleTime: STALE.SECONDS.FIFTEEN,
    refetchInterval: STALE.SECONDS.THIRTY,
    retry: 1,
  })

  if (!query.data) return fallback
  return {
    like: applyMultiplicityOverlay(
      multiplicityReconciliationKey(viewerDid, 'post', post.uri, 'like'),
      query.data.like,
      fallback.like,
    ),
    repost: applyMultiplicityOverlay(
      multiplicityReconciliationKey(viewerDid, 'post', post.uri, 'repost'),
      query.data.repost,
      fallback.repost,
    ),
  }
}

export function useActorMultiplicity(
  profile: bsky.profile.AnyProfileView,
): ActorMultiplicityState {
  const agent = useAgent()
  const {currentAccount} = useSession()
  const viewerDid = currentAccount?.did ?? ''
  const adapter = getMultiplicityAdapter(agent, viewerDid)
  const fallback = {
    follow: createFallbackAction(
      profile.viewer?.following ? 1 : 0,
      profile.viewer?.following,
    ),
  }
  const query = useQuery({
    queryKey: ACTOR_MULTIPLICITY_RQKEY(viewerDid, profile.did),
    queryFn: async () => {
      const response = await adapter!.getBatch({
        viewerDid,
        postUris: [],
        actorDids: [profile.did],
      })
      const state = response.actors[profile.did]
      if (!state) throw new Error('Multiplicity response omitted the actor')
      return {
        follow: reconcileMultiplicityAction(
          multiplicityReconciliationKey(
            viewerDid,
            'actor',
            profile.did,
            'follow',
          ),
          state.follow,
          fallback.follow,
        ),
      }
    },
    enabled: Boolean(adapter && viewerDid),
    staleTime: STALE.SECONDS.FIFTEEN,
    refetchInterval: STALE.SECONDS.THIRTY,
    retry: 1,
  })

  if (!query.data) return fallback
  return {
    follow: applyMultiplicityOverlay(
      multiplicityReconciliationKey(viewerDid, 'actor', profile.did, 'follow'),
      query.data.follow,
      fallback.follow,
    ),
  }
}

export function updatePostMultiplicity(
  queryClient: QueryClient,
  viewerDid: string,
  postUri: string,
  fallback: PostMultiplicityState,
  update: (state: PostMultiplicityState) => PostMultiplicityState,
) {
  queryClient.setQueryData<PostMultiplicityState>(
    POST_MULTIPLICITY_RQKEY(viewerDid, postUri),
    current => update(current ?? fallback),
  )
}

export function updateActorMultiplicity(
  queryClient: QueryClient,
  viewerDid: string,
  actorDid: string,
  fallback: ActorMultiplicityState,
  update: (state: ActorMultiplicityState) => ActorMultiplicityState,
) {
  queryClient.setQueryData<ActorMultiplicityState>(
    ACTOR_MULTIPLICITY_RQKEY(viewerDid, actorDid),
    current => update(current ?? fallback),
  )
}
