import {useCallback, useMemo} from 'react'
import {type AppBskyActorDefs, type AppBskyFeedDefs, AtUri} from '@atproto/api'
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import {useToggleMutationQueue} from '#/lib/hooks/useToggleMutationQueue'
import {updatePostShadow} from '#/state/cache/post-shadow'
import {type Shadow} from '#/state/cache/types'
import {useAgent, useSession} from '#/state/session'
import * as userActionHistory from '#/state/userActionHistory'
import {useAnalytics} from '#/analytics'
import {type Metrics, toClout} from '#/analytics/metrics'
import {
  addPendingRecord,
  confirmPendingRecord,
  createFallbackAction,
  createMultiplicityLike,
  createMultiplicityRepost,
  enqueueSubjectMutation,
  type MultiplicityActionState,
  type PostMultiplicityState,
  removeRecords,
  restoreRecords,
} from '#/multiplicity'
import {useIsThreadMuted, useSetThreadMute} from '../cache/thread-mutes'
import {POST_MULTIPLICITY_RQKEY, updatePostMultiplicity} from './multiplicity'
import {findProfileQueryData} from './profile'

const RQKEY_ROOT = 'post'
export const RQKEY = (postUri: string) => [RQKEY_ROOT, postUri]

export function usePostQuery(uri: string | undefined) {
  const agent = useAgent()
  return useQuery<AppBskyFeedDefs.PostView>({
    queryKey: RQKEY(uri || ''),
    queryFn: async () => {
      if (!uri) throw new Error('[unreachable] No URI provided')

      const urip = new AtUri(uri)

      if (!urip.host.startsWith('did:')) {
        const res = await agent.resolveHandle({
          handle: urip.host,
        })
        // @ts-expect-error TODO new-sdk-migration
        urip.host = res.data.did
      }

      const res = await agent.getPosts({uris: [urip.toString()]})
      if (res.success && res.data.posts[0]) {
        return res.data.posts[0]
      }

      throw new Error('No data')
    },
    enabled: !!uri,
  })
}

export function precachePost(
  queryClient: QueryClient,
  uri: string,
  post: AppBskyFeedDefs.PostView,
) {
  queryClient.setQueryData(RQKEY(uri), post)
}

export function useGetPost() {
  const queryClient = useQueryClient()
  const agent = useAgent()
  return useCallback(
    async ({uri}: {uri: string}) => {
      return queryClient.fetchQuery({
        queryKey: RQKEY(uri || ''),
        async queryFn() {
          const urip = new AtUri(uri)

          if (!urip.host.startsWith('did:')) {
            const res = await agent.resolveHandle({
              handle: urip.host,
            })
            // @ts-expect-error TODO new-sdk-migration
            urip.host = res.data.did
          }

          const res = await agent.getPosts({
            uris: [urip.toString()],
          })

          if (res.success && res.data.posts[0]) {
            return res.data.posts[0]
          }

          throw new Error('useGetPost: post not found')
        },
      })
    },
    [queryClient, agent],
  )
}

export function useGetPosts() {
  const queryClient = useQueryClient()
  const agent = useAgent()
  return useCallback(
    async ({uris}: {uris: string[]}) => {
      return queryClient.fetchQuery({
        queryKey: RQKEY(uris.join(',') || ''),
        async queryFn() {
          const res = await agent.getPosts({
            uris,
          })

          if (res.success) {
            return res.data.posts
          } else {
            throw new Error('useGetPosts failed')
          }
        },
      })
    },
    [queryClient, agent],
  )
}

export function usePostLikeMutationQueue(
  post: Shadow<AppBskyFeedDefs.PostView>,
  viaRepost: {uri: string; cid: string} | undefined,
  feedDescriptor: string | undefined,
  logContext: Metrics['post:like']['logContext'],
) {
  const likeMutation = usePostLikeMutation(feedDescriptor, logContext, post)
  const unlikeMutation = usePostUnlikeMutation(feedDescriptor, logContext, post)
  return usePostMultiplicityMutationQueue({
    post,
    action: 'like',
    createRecord: () =>
      likeMutation.mutateAsync({
        uri: post.uri,
        cid: post.cid,
        via: viaRepost,
      }),
    deleteRecord: uri =>
      unlikeMutation.mutateAsync({postUri: post.uri, likeUri: uri}),
    onCreate: () => userActionHistory.like([post.uri]),
    onDelete: () => userActionHistory.unlike([post.uri]),
  })
}

function usePostLikeMutation(
  feedDescriptor: string | undefined,
  logContext: Metrics['post:like']['logContext'],
  post: Shadow<AppBskyFeedDefs.PostView>,
) {
  const {currentAccount} = useSession()
  const queryClient = useQueryClient()
  const postAuthor = post.author
  const agent = useAgent()
  const ax = useAnalytics()
  return useMutation<
    {uri: string}, // responds with the uri of the like
    Error,
    {uri: string; cid: string; via?: {uri: string; cid: string}} // the post's uri and cid, and the repost uri/cid if present
  >({
    mutationFn: ({uri, cid, via}) => {
      let ownProfile: AppBskyActorDefs.ProfileViewDetailed | undefined
      if (currentAccount) {
        ownProfile = findProfileQueryData(queryClient, currentAccount.did)
      }
      ax.metric('post:like', {
        uri,
        authorDid: postAuthor.did,
        logContext,
        doesPosterFollowLiker: postAuthor.viewer
          ? Boolean(postAuthor.viewer.followedBy)
          : undefined,
        doesLikerFollowPoster: postAuthor.viewer
          ? Boolean(postAuthor.viewer.following)
          : undefined,
        likerClout: toClout(ownProfile?.followersCount),
        postClout:
          post.likeCount != null &&
          post.repostCount != null &&
          post.replyCount != null
            ? toClout(post.likeCount + post.repostCount + post.replyCount)
            : undefined,
        feedDescriptor: feedDescriptor,
      })
      return createMultiplicityLike(agent, {uri, cid}, via)
    },
  })
}

function usePostUnlikeMutation(
  feedDescriptor: string | undefined,
  logContext: Metrics['post:unlike']['logContext'],
  post: Shadow<AppBskyFeedDefs.PostView>,
) {
  const agent = useAgent()
  const ax = useAnalytics()
  return useMutation<void, Error, {postUri: string; likeUri: string}>({
    mutationFn: ({postUri, likeUri}) => {
      ax.metric('post:unlike', {
        uri: postUri,
        authorDid: post.author.did,
        logContext,
        feedDescriptor,
      })
      return agent.deleteLike(likeUri)
    },
  })
}

export function usePostRepostMutationQueue(
  post: Shadow<AppBskyFeedDefs.PostView>,
  viaRepost: {uri: string; cid: string} | undefined,
  feedDescriptor: string | undefined,
  logContext: Metrics['post:repost']['logContext'],
) {
  const repostMutation = usePostRepostMutation(feedDescriptor, logContext, post)
  const unrepostMutation = usePostUnrepostMutation(
    feedDescriptor,
    logContext,
    post,
  )

  return usePostMultiplicityMutationQueue({
    post,
    action: 'repost',
    createRecord: () =>
      repostMutation.mutateAsync({
        uri: post.uri,
        cid: post.cid,
        via: viaRepost,
      }),
    deleteRecord: uri =>
      unrepostMutation.mutateAsync({postUri: post.uri, repostUri: uri}),
  })
}

let nextPendingRecordId = 0

function usePostMultiplicityMutationQueue({
  post,
  action,
  createRecord,
  deleteRecord,
  onCreate,
  onDelete,
}: {
  post: Shadow<AppBskyFeedDefs.PostView>
  action: 'like' | 'repost'
  createRecord: () => Promise<{uri: string}>
  deleteRecord: (uri: string) => Promise<unknown>
  onCreate?: () => void
  onDelete?: () => void
}) {
  const queryClient = useQueryClient()
  const {currentAccount} = useSession()
  const viewerDid = currentAccount?.did ?? ''
  const subjectKey = `${action}:${post.uri}`
  const fallback: PostMultiplicityState = useMemo(
    () => ({
      like: createFallbackAction(post.likeCount, post.viewer?.like),
      repost: createFallbackAction(post.repostCount, post.viewer?.repost),
    }),
    [post.likeCount, post.repostCount, post.viewer?.like, post.viewer?.repost],
  )

  const updateAction = useCallback(
    (update: (state: MultiplicityActionState) => MultiplicityActionState) => {
      updatePostMultiplicity(
        queryClient,
        viewerDid,
        post.uri,
        fallback,
        state => ({...state, [action]: update(state[action])}),
      )
    },
    [action, fallback, post.uri, queryClient, viewerDid],
  )

  const getAction = useCallback(() => {
    const state = queryClient.getQueryData<PostMultiplicityState>(
      POST_MULTIPLICITY_RQKEY(viewerDid, post.uri),
    )
    return state?.[action] ?? fallback[action]
  }, [action, fallback, post.uri, queryClient, viewerDid])

  const queueCreate = useCallback(() => {
    const pendingUri = `pending:${action}:${++nextPendingRecordId}`
    updateAction(state => addPendingRecord(state, pendingUri))
    return enqueueSubjectMutation(subjectKey, async () => {
      try {
        const {uri} = await createRecord()
        updateAction(state => confirmPendingRecord(state, pendingUri, uri))
        onCreate?.()
        return uri
      } catch (error) {
        updateAction(state => removeRecords(state, [pendingUri]))
        throw error
      }
    })
  }, [action, createRecord, onCreate, subjectKey, updateAction])

  const queueRemoveOne = useCallback(
    () =>
      enqueueSubjectMutation(subjectKey, async () => {
        const uri = getAction().viewerRecordUris.find(
          recordUri => !recordUri.startsWith('pending:'),
        )
        if (!uri) return undefined
        updateAction(state => removeRecords(state, [uri]))
        try {
          await deleteRecord(uri)
          onDelete?.()
          return uri
        } catch (error) {
          updateAction(state => restoreRecords(state, [uri]))
          throw error
        }
      }),
    [deleteRecord, getAction, onDelete, subjectKey, updateAction],
  )

  const queueRemoveAll = useCallback(
    () =>
      enqueueSubjectMutation(subjectKey, async () => {
        const uris = getAction().viewerRecordUris.filter(
          uri => !uri.startsWith('pending:'),
        )
        if (uris.length === 0) return []
        updateAction(state => removeRecords(state, uris))
        const results = await Promise.allSettled(uris.map(deleteRecord))
        const failed = uris.filter(
          (_, index) => results[index]?.status === 'rejected',
        )
        if (failed.length > 0) {
          updateAction(state => restoreRecords(state, failed))
          throw new Error(
            `Removed ${uris.length - failed.length} of ${uris.length} ${action} records`,
          )
        }
        onDelete?.()
        return uris
      }),
    [action, deleteRecord, getAction, onDelete, subjectKey, updateAction],
  )

  return [queueCreate, queueRemoveOne, queueRemoveAll] as const
}

function usePostRepostMutation(
  feedDescriptor: string | undefined,
  logContext: Metrics['post:repost']['logContext'],
  post: Shadow<AppBskyFeedDefs.PostView>,
) {
  const agent = useAgent()
  const ax = useAnalytics()
  return useMutation<
    {uri: string}, // responds with the uri of the repost
    Error,
    {uri: string; cid: string; via?: {uri: string; cid: string}} // the post's uri and cid, and the repost uri/cid if present
  >({
    mutationFn: ({uri, cid, via}) => {
      ax.metric('post:repost', {
        uri,
        authorDid: post.author.did,
        logContext,
        feedDescriptor,
      })
      return createMultiplicityRepost(agent, {uri, cid}, via)
    },
  })
}

function usePostUnrepostMutation(
  feedDescriptor: string | undefined,
  logContext: Metrics['post:unrepost']['logContext'],
  post: Shadow<AppBskyFeedDefs.PostView>,
) {
  const agent = useAgent()
  const ax = useAnalytics()
  return useMutation<void, Error, {postUri: string; repostUri: string}>({
    mutationFn: ({postUri, repostUri}) => {
      ax.metric('post:unrepost', {
        uri: postUri,
        authorDid: post.author.did,
        logContext,
        feedDescriptor,
      })
      return agent.deleteRepost(repostUri)
    },
  })
}

export function usePostDeleteMutation() {
  const queryClient = useQueryClient()
  const agent = useAgent()
  return useMutation<void, Error, {uri: string}>({
    mutationFn: async ({uri}) => {
      await agent.deletePost(uri)
    },
    onSuccess(_, variables) {
      updatePostShadow(queryClient, variables.uri, {isDeleted: true})
    },
  })
}

export function useThreadMuteMutationQueue(
  post: Shadow<AppBskyFeedDefs.PostView>,
  rootUri: string,
) {
  const threadMuteMutation = useThreadMuteMutation()
  const threadUnmuteMutation = useThreadUnmuteMutation()
  const isThreadMuted = useIsThreadMuted(rootUri, post.viewer?.threadMuted)
  const setThreadMute = useSetThreadMute()

  const queueToggle = useToggleMutationQueue<boolean>({
    initialState: isThreadMuted,
    runMutation: async (_prev, shouldMute) => {
      if (shouldMute) {
        await threadMuteMutation.mutateAsync({
          uri: rootUri,
        })
        return true
      } else {
        await threadUnmuteMutation.mutateAsync({
          uri: rootUri,
        })
        return false
      }
    },
    onSuccess(finalIsMuted) {
      // finalize
      setThreadMute(rootUri, finalIsMuted)
    },
  })

  const queueMuteThread = useCallback(() => {
    // optimistically update
    setThreadMute(rootUri, true)
    return queueToggle(true)
  }, [setThreadMute, rootUri, queueToggle])

  const queueUnmuteThread = useCallback(() => {
    // optimistically update
    setThreadMute(rootUri, false)
    return queueToggle(false)
  }, [rootUri, setThreadMute, queueToggle])

  return [isThreadMuted, queueMuteThread, queueUnmuteThread] as const
}

function useThreadMuteMutation() {
  const agent = useAgent()
  return useMutation<
    {},
    Error,
    {uri: string} // the root post's uri
  >({
    mutationFn: ({uri}) => {
      return agent.api.app.bsky.graph.muteThread({root: uri})
    },
  })
}

function useThreadUnmuteMutation() {
  const agent = useAgent()
  return useMutation<{}, Error, {uri: string}>({
    mutationFn: ({uri}) => {
      return agent.api.app.bsky.graph.unmuteThread({root: uri})
    },
  })
}
