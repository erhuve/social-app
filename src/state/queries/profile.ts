import {useCallback, useMemo} from 'react'
import {
  type AppBskyActorDefs,
  type AppBskyActorGetProfile,
  type AppBskyActorGetProfiles,
  type AppBskyActorProfile,
  type AppBskyGraphGetFollows,
  type AtpAgent,
  AtUri,
  type ComAtprotoRepoUploadBlob,
  type Un$Typed,
} from '@atproto/api'
import {
  type InfiniteData,
  keepPreviousData,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import {uploadBlob} from '#/lib/api'
import {until} from '#/lib/async/until'
import {useToggleMutationQueue} from '#/lib/hooks/useToggleMutationQueue'
import {updateProfileShadow} from '#/state/cache/profile-shadow'
import {type Shadow} from '#/state/cache/types'
import {type ImageMeta} from '#/state/gallery'
import {STALE} from '#/state/queries'
import {resetProfilePostsQueries} from '#/state/queries/post-feed'
import {RQKEY as PROFILE_FOLLOWS_RQKEY} from '#/state/queries/profile-follows'
import {
  unstableCacheProfileView,
  useUnstableProfileViewCache,
} from '#/state/queries/unstable-profile-cache'
import {useUpdateProfileVerificationCache} from '#/state/queries/verification/useUpdateProfileVerificationCache'
import {useAgent, useSession} from '#/state/session'
import * as userActionHistory from '#/state/userActionHistory'
import {useAnalytics} from '#/analytics'
import {type Metrics, toClout} from '#/analytics/metrics'
import {
  type ActorMultiplicityState,
  addPendingRecord,
  assertCanAddMultiplicityRecord,
  assertMultiplicityReconciliationCapacity,
  assertSubjectMutationCapacity,
  commitMultiplicityRemoval,
  confirmMultiplicityAddition,
  confirmPendingRecord,
  createFallbackAction,
  createMultiplicityFollow,
  enqueueSubjectMutation,
  markMultiplicityAddition,
  markMultiplicityRemoval,
  type MultiplicityActionState,
  multiplicityReconciliationKey,
  removeRecords,
  restoreRecords,
  rollbackMultiplicityAddition,
  rollbackMultiplicityRemoval,
  settleMutationBatch,
} from '#/multiplicity'
import type * as bsky from '#/types/bsky'
import {
  ProgressGuideAction,
  useProgressGuideControls,
} from '../shell/progress-guide'
import {RQKEY_ROOT as RQKEY_LIST_CONVOS} from './messages/list-conversations'
import {ACTOR_MULTIPLICITY_RQKEY, updateActorMultiplicity} from './multiplicity'
import {RQKEY as RQKEY_MY_BLOCKED} from './my-blocked-accounts'
import {RQKEY as RQKEY_MY_MUTED} from './my-muted-accounts'

export * from '#/state/queries/unstable-profile-cache'
/**
 * @deprecated use {@link unstableCacheProfileView} instead
 */
export const precacheProfile = unstableCacheProfileView

const RQKEY_ROOT = 'profile'
export const RQKEY = (did: string) => [RQKEY_ROOT, did]

export const profilesQueryKeyRoot = 'profiles'
export const profilesQueryKey = (handles: string[]) => [
  profilesQueryKeyRoot,
  handles,
]

export function useProfileQuery({
  did,
  staleTime = STALE.SECONDS.FIFTEEN,
}: {
  did: string | undefined
  staleTime?: number
}) {
  const agent = useAgent()
  const {getUnstableProfile} = useUnstableProfileViewCache()
  return useQuery<AppBskyActorDefs.ProfileViewDetailed>({
    // WARNING
    // this staleTime is load-bearing
    // if you remove it, the UI infinite-loops
    // -prf
    staleTime,
    refetchOnWindowFocus: true,
    queryKey: RQKEY(did ?? ''),
    queryFn: async () => {
      const res = await agent.getProfile({actor: did ?? ''})
      return res.data
    },
    placeholderData: () => {
      if (!did) return
      return getUnstableProfile(did) as AppBskyActorDefs.ProfileViewDetailed
    },
    enabled: !!did,
  })
}

export function useProfilesQuery({
  handles,
  maintainData,
}: {
  handles: string[]
  maintainData?: boolean
}) {
  const agent = useAgent()
  return useQuery({
    enabled: handles.length > 0,
    staleTime: STALE.MINUTES.FIVE,
    queryKey: profilesQueryKey(handles),
    queryFn: async () => {
      const res = await agent.getProfiles({actors: handles})
      return res.data
    },
    placeholderData: maintainData ? keepPreviousData : undefined,
  })
}

export function usePrefetchProfileQuery() {
  const agent = useAgent()
  const queryClient = useQueryClient()
  const prefetchProfileQuery = useCallback(
    async (did: string) => {
      await queryClient.prefetchQuery({
        staleTime: STALE.SECONDS.THIRTY,
        queryKey: RQKEY(did),
        queryFn: async () => {
          const res = await agent.getProfile({actor: did || ''})
          return res.data
        },
      })
    },
    [queryClient, agent],
  )
  return prefetchProfileQuery
}

interface ProfileUpdateParams {
  profile: AppBskyActorDefs.ProfileViewDetailed
  updates:
    | Un$Typed<AppBskyActorProfile.Record>
    | ((
        existing: Un$Typed<AppBskyActorProfile.Record>,
      ) => Un$Typed<AppBskyActorProfile.Record>)
  newUserAvatar?: ImageMeta | undefined | null
  newUserBanner?: ImageMeta | undefined | null
  checkCommitted?: (res: AppBskyActorGetProfile.Response) => boolean
}
export function useProfileUpdateMutation() {
  const queryClient = useQueryClient()
  const agent = useAgent()
  const updateProfileVerificationCache = useUpdateProfileVerificationCache()
  return useMutation<void, Error, ProfileUpdateParams>({
    mutationFn: async ({
      profile,
      updates,
      newUserAvatar,
      newUserBanner,
      checkCommitted,
    }) => {
      let newUserAvatarPromise:
        | Promise<ComAtprotoRepoUploadBlob.Response>
        | undefined
      if (newUserAvatar) {
        newUserAvatarPromise = uploadBlob(
          agent,
          newUserAvatar.path,
          newUserAvatar.mime,
        )
      }
      let newUserBannerPromise:
        | Promise<ComAtprotoRepoUploadBlob.Response>
        | undefined
      if (newUserBanner) {
        newUserBannerPromise = uploadBlob(
          agent,
          newUserBanner.path,
          newUserBanner.mime,
        )
      }
      await agent.upsertProfile(async existing => {
        let next: Un$Typed<AppBskyActorProfile.Record> = existing || {}
        if (typeof updates === 'function') {
          next = updates(next)
        } else {
          next.displayName = updates.displayName || undefined
          next.description = updates.description || undefined
          if ('pinnedPost' in updates) {
            next.pinnedPost = updates.pinnedPost
          }
        }
        if (newUserAvatarPromise) {
          const res = await newUserAvatarPromise
          next.avatar = res.data.blob
        } else if (newUserAvatar === null) {
          next.avatar = undefined
        }
        if (newUserBannerPromise) {
          const res = await newUserBannerPromise
          next.banner = res.data.blob
        } else if (newUserBanner === null) {
          next.banner = undefined
        }
        return next
      })
      await whenAppViewReady(
        agent,
        profile.did,
        checkCommitted ||
          (res => {
            if (typeof newUserAvatar !== 'undefined') {
              if (newUserAvatar === null && res.data.avatar) {
                // url hasn't cleared yet
                return false
              } else if (res.data.avatar === profile.avatar) {
                // url hasn't changed yet
                return false
              }
            }
            if (typeof newUserBanner !== 'undefined') {
              if (newUserBanner === null && res.data.banner) {
                // url hasn't cleared yet
                return false
              } else if (res.data.banner === profile.banner) {
                // url hasn't changed yet
                return false
              }
            }
            if (typeof updates === 'function') {
              return true
            }
            return (
              res.data.displayName === updates.displayName &&
              res.data.description === updates.description
            )
          }),
      )
    },
    async onSuccess(_, variables) {
      // invalidate cache
      void queryClient.invalidateQueries({
        queryKey: RQKEY(variables.profile.did),
      })
      void queryClient.invalidateQueries({
        queryKey: [profilesQueryKeyRoot, [variables.profile.did]],
      })
      await updateProfileVerificationCache({profile: variables.profile})
    },
  })
}

export function useProfileFollowMutationQueue(
  profile: Shadow<bsky.profile.AnyProfileView>,
  logContext: Metrics['profile:follow']['logContext'],
  position?: number,
  contextProfileDid?: string,
) {
  const agent = useAgent()
  const queryClient = useQueryClient()
  const {currentAccount} = useSession()
  const viewerDid = currentAccount?.did ?? ''
  const did = profile.did
  const followMutation = useProfileFollowMutation(
    logContext,
    profile,
    position,
    contextProfileDid,
  )
  const unfollowMutation = useProfileUnfollowMutation(logContext)
  const fallback = useMemo(
    () => ({
      follow: createFallbackAction(
        profile.viewer?.following ? 1 : 0,
        profile.viewer?.following,
      ),
    }),
    [profile.viewer?.following],
  )

  const syncBinaryFollowingState = useCallback(
    (state: MultiplicityActionState) => {
      const followingUri = state.viewerRecordUris[0]
      updateProfileShadow(queryClient, did, {followingUri})

      if (!currentAccount?.did) return
      type FollowsQueryData = InfiniteData<AppBskyGraphGetFollows.OutputSchema>
      queryClient.setQueryData<FollowsQueryData>(
        PROFILE_FOLLOWS_RQKEY(currentAccount.did),
        old => {
          if (!old?.pages?.[0]) return old
          if (followingUri) {
            const alreadyExists = old.pages[0].follows.some(
              item => item.did === profile.did,
            )
            if (alreadyExists) return old
            return {
              ...old,
              pages: [
                {
                  ...old.pages[0],
                  follows: [
                    profile as AppBskyActorDefs.ProfileView,
                    ...old.pages[0].follows,
                  ],
                },
                ...old.pages.slice(1),
              ],
            }
          }
          return {
            ...old,
            pages: old.pages.map(page => ({
              ...page,
              follows: page.follows.filter(item => item.did !== profile.did),
            })),
          }
        },
      )
    },
    [currentAccount?.did, did, profile, queryClient],
  )

  const updateFollow = useCallback(
    (update: (state: MultiplicityActionState) => MultiplicityActionState) => {
      let next = fallback.follow
      updateActorMultiplicity(queryClient, viewerDid, did, fallback, state => {
        next = update(state.follow)
        return {...state, follow: next}
      })
      syncBinaryFollowingState(next)
    },
    [did, fallback, queryClient, syncBinaryFollowingState, viewerDid],
  )

  const getFollow = useCallback(() => {
    return (
      queryClient.getQueryData<ActorMultiplicityState>(
        ACTOR_MULTIPLICITY_RQKEY(viewerDid, did),
      )?.follow ?? fallback.follow
    )
  }, [did, fallback.follow, queryClient, viewerDid])

  const subjectKey = `${viewerDid}:follow:${did}`
  const reconciliationKey = multiplicityReconciliationKey(
    viewerDid,
    'actor',
    did,
    'follow',
  )
  const queueFollow = useCallback(() => {
    try {
      assertSubjectMutationCapacity(subjectKey)
      assertMultiplicityReconciliationCapacity(reconciliationKey)
      assertCanAddMultiplicityRecord(getFollow())
    } catch (error) {
      return Promise.reject(
        error instanceof Error ? error : new Error('Unable to queue action'),
      )
    }
    const pendingUri = `pending:follow:${++nextPendingFollowId}`
    markMultiplicityAddition(reconciliationKey, pendingUri)
    updateFollow(state => addPendingRecord(state, pendingUri))
    return enqueueSubjectMutation(subjectKey, async () => {
      try {
        const {uri} = await followMutation.mutateAsync({did})
        confirmMultiplicityAddition(reconciliationKey, pendingUri, uri)
        updateFollow(state => confirmPendingRecord(state, pendingUri, uri))
        userActionHistory.follow([did])
        void agent.app.bsky.graph
          .getSuggestedFollowsByActor({actor: did})
          .then(res => {
            const dids = res.data.suggestions
              .filter(item => !item.viewer?.following)
              .map(item => item.did)
              .slice(0, 8)
            userActionHistory.followSuggestion(dids)
          })
        return uri
      } catch (error) {
        rollbackMultiplicityAddition(reconciliationKey, pendingUri)
        updateFollow(state => removeRecords(state, [pendingUri]))
        throw error
      }
    })
  }, [
    agent,
    did,
    followMutation,
    getFollow,
    reconciliationKey,
    subjectKey,
    updateFollow,
  ])

  const queueUnfollow = useCallback(
    () =>
      enqueueSubjectMutation(subjectKey, async () => {
        const uri = getFollow().viewerRecordUris.find(
          recordUri => !recordUri.startsWith('pending:'),
        )
        if (!uri) return undefined
        markMultiplicityRemoval(reconciliationKey, [uri])
        const remaining = removeRecords(getFollow(), [uri])
        updateFollow(() => remaining)
        try {
          await unfollowMutation.mutateAsync({did, followUri: uri})
          commitMultiplicityRemoval(reconciliationKey, [uri])
          if (remaining.viewerRecordUris.length === 0) {
            userActionHistory.unfollow([did])
          } else {
            userActionHistory.unfollowOne(did)
          }
          return uri
        } catch (error) {
          rollbackMultiplicityRemoval(reconciliationKey, [uri])
          updateFollow(state => restoreRecords(state, [uri]))
          throw error
        }
      }),
    [
      did,
      getFollow,
      reconciliationKey,
      subjectKey,
      unfollowMutation,
      updateFollow,
    ],
  )

  const queueUnfollowAll = useCallback(
    () =>
      enqueueSubjectMutation(subjectKey, async () => {
        const uris = getFollow().viewerRecordUris.filter(
          uri => !uri.startsWith('pending:'),
        )
        if (uris.length === 0) return []
        markMultiplicityRemoval(reconciliationKey, uris)
        updateFollow(state => removeRecords(state, uris))
        const results = await settleMutationBatch(uris, followUri =>
          unfollowMutation.mutateAsync({did, followUri}),
        )
        const failed = uris.filter(
          (_, index) => results[index]?.status === 'rejected',
        )
        const removedCount = uris.length - failed.length
        const removed = uris.filter(
          (_, index) => results[index]?.status === 'fulfilled',
        )
        commitMultiplicityRemoval(reconciliationKey, removed)
        rollbackMultiplicityRemoval(reconciliationKey, failed)
        if (failed.length > 0) {
          updateFollow(state => restoreRecords(state, failed))
          for (let index = 0; index < removedCount; index++) {
            userActionHistory.unfollowOne(did)
          }
          throw new Error(
            `Removed ${uris.length - failed.length} of ${uris.length} follow records`,
          )
        }
        userActionHistory.unfollow([did])
        return uris
      }),
    [
      did,
      getFollow,
      reconciliationKey,
      subjectKey,
      unfollowMutation,
      updateFollow,
    ],
  )

  return [queueFollow, queueUnfollow, queueUnfollowAll] as const
}

let nextPendingFollowId = 0

function useProfileFollowMutation(
  logContext: Metrics['profile:follow']['logContext'],
  profile: Shadow<bsky.profile.AnyProfileView>,
  position?: number,
  contextProfileDid?: string,
) {
  const ax = useAnalytics()
  const {currentAccount} = useSession()
  const agent = useAgent()
  const queryClient = useQueryClient()
  const {captureAction} = useProgressGuideControls()

  return useMutation<{uri: string; cid: string}, Error, {did: string}>({
    mutationFn: async ({did}) => {
      let ownProfile: AppBskyActorDefs.ProfileViewDetailed | undefined
      if (currentAccount) {
        ownProfile = findProfileQueryData(queryClient, currentAccount.did)
      }
      captureAction(ProgressGuideAction.Follow)
      ax.metric('profile:follow', {
        logContext,
        didBecomeMutual: profile.viewer
          ? Boolean(profile.viewer.followedBy)
          : undefined,
        followeeClout:
          'followersCount' in profile
            ? toClout(profile.followersCount)
            : undefined,
        followeeDid: did,
        followerClout: toClout(ownProfile?.followersCount),
        position,
        contextProfileDid,
      })
      return await createMultiplicityFollow(agent, did)
    },
  })
}

function useProfileUnfollowMutation(
  logContext: Metrics['profile:unfollow']['logContext'],
) {
  const ax = useAnalytics()
  const agent = useAgent()
  return useMutation<void, Error, {did: string; followUri: string}>({
    mutationFn: async ({followUri}) => {
      ax.metric('profile:unfollow', {logContext})
      return await agent.deleteFollow(followUri)
    },
  })
}

export function useProfileMuteMutationQueue(
  profile: Shadow<bsky.profile.AnyProfileView>,
) {
  const ax = useAnalytics()
  const queryClient = useQueryClient()
  const did = profile.did
  const initialMuted = profile.viewer?.muted
  const muteMutation = useProfileMuteMutation()
  const unmuteMutation = useProfileUnmuteMutation()

  const queueToggle = useToggleMutationQueue({
    initialState: initialMuted,
    runMutation: async (_prevMuted, shouldMute) => {
      if (shouldMute) {
        await muteMutation.mutateAsync({
          did,
        })
        ax.metric('profile:mute', {})
        return true
      } else {
        await unmuteMutation.mutateAsync({
          did,
        })
        ax.metric('profile:unmute', {})
        return false
      }
    },
    onSuccess(finalMuted) {
      // finalize
      updateProfileShadow(queryClient, did, {muted: finalMuted})
    },
  })

  const queueMute = useCallback(() => {
    // optimistically update
    updateProfileShadow(queryClient, did, {
      muted: true,
    })
    return queueToggle(true)
  }, [queryClient, did, queueToggle])

  const queueUnmute = useCallback(() => {
    // optimistically update
    updateProfileShadow(queryClient, did, {
      muted: false,
    })
    return queueToggle(false)
  }, [queryClient, did, queueToggle])

  return [queueMute, queueUnmute] as const
}

function useProfileMuteMutation() {
  const queryClient = useQueryClient()
  const agent = useAgent()
  return useMutation<void, Error, {did: string}>({
    mutationFn: async ({did}) => {
      await agent.mute(did)
    },
    onSuccess() {
      void queryClient.invalidateQueries({queryKey: RQKEY_MY_MUTED()})
    },
  })
}

function useProfileUnmuteMutation() {
  const queryClient = useQueryClient()
  const agent = useAgent()
  return useMutation<void, Error, {did: string}>({
    mutationFn: async ({did}) => {
      await agent.unmute(did)
    },
    onSuccess() {
      void queryClient.invalidateQueries({queryKey: RQKEY_MY_MUTED()})
    },
  })
}

export function useProfileBlockMutationQueue(
  profile: Shadow<bsky.profile.AnyProfileView>,
) {
  const ax = useAnalytics()
  const queryClient = useQueryClient()
  const did = profile.did
  const initialBlockingUri = profile.viewer?.blocking
  const blockMutation = useProfileBlockMutation()
  const unblockMutation = useProfileUnblockMutation()

  const queueToggle = useToggleMutationQueue({
    initialState: initialBlockingUri,
    runMutation: async (prevBlockUri, shouldFollow) => {
      if (shouldFollow) {
        const {uri} = await blockMutation.mutateAsync({
          did,
        })
        ax.metric('profile:block', {})
        return uri
      } else {
        if (prevBlockUri) {
          await unblockMutation.mutateAsync({
            did,
            blockUri: prevBlockUri,
          })
          ax.metric('profile:unblock', {})
        }
        return undefined
      }
    },
    onSuccess(finalBlockingUri) {
      // finalize
      updateProfileShadow(queryClient, did, {
        blockingUri: finalBlockingUri,
      })
      // The shadow only reaches components that read profiles through shadow
      // hooks. The convo list is also read raw (e.g. the unread badge's
      // calculateCount, getMessageInfo), and blocks emit no chat log event,
      // so without a refetch that data stays stale indefinitely.
      void queryClient.invalidateQueries({queryKey: [RQKEY_LIST_CONVOS]})
    },
  })

  const queueBlock = useCallback(() => {
    // optimistically update
    updateProfileShadow(queryClient, did, {
      blockingUri: 'pending',
    })
    return queueToggle(true)
  }, [queryClient, did, queueToggle])

  const queueUnblock = useCallback(() => {
    // optimistically update
    updateProfileShadow(queryClient, did, {
      blockingUri: undefined,
    })
    return queueToggle(false)
  }, [queryClient, did, queueToggle])

  return [queueBlock, queueUnblock] as const
}

function useProfileBlockMutation() {
  const {currentAccount} = useSession()
  const agent = useAgent()
  const queryClient = useQueryClient()
  return useMutation<{uri: string; cid: string}, Error, {did: string}>({
    mutationFn: async ({did}) => {
      if (!currentAccount) {
        throw new Error('Not signed in')
      }
      return await agent.app.bsky.graph.block.create(
        {repo: currentAccount.did},
        {subject: did, createdAt: new Date().toISOString()},
      )
    },
    onSuccess(_, {did}) {
      void queryClient.invalidateQueries({queryKey: RQKEY_MY_BLOCKED()})
      resetProfilePostsQueries(queryClient, did, 1000)
    },
  })
}

function useProfileUnblockMutation() {
  const {currentAccount} = useSession()
  const agent = useAgent()
  const queryClient = useQueryClient()
  return useMutation<void, Error, {did: string; blockUri: string}>({
    mutationFn: async ({blockUri}) => {
      if (!currentAccount) {
        throw new Error('Not signed in')
      }
      const {rkey} = new AtUri(blockUri)
      await agent.app.bsky.graph.block.delete({
        repo: currentAccount.did,
        rkey,
      })
    },
    onSuccess(_, {did}) {
      resetProfilePostsQueries(queryClient, did, 1000)
    },
  })
}

async function whenAppViewReady(
  agent: AtpAgent,
  actor: string,
  fn: (res: AppBskyActorGetProfile.Response) => boolean,
) {
  await until(
    5, // 5 tries
    1e3, // 1s delay between tries
    fn,
    () => agent.app.bsky.actor.getProfile({actor}),
  )
}

export function* findAllProfilesInQueryData(
  queryClient: QueryClient,
  did: string,
): Generator<AppBskyActorDefs.ProfileViewDetailed, void> {
  const profileQueryDatas =
    queryClient.getQueriesData<AppBskyActorDefs.ProfileViewDetailed>({
      queryKey: [RQKEY_ROOT],
    })
  for (const [_queryKey, queryData] of profileQueryDatas) {
    if (!queryData) {
      continue
    }
    if (queryData.did === did) {
      yield queryData
    }
  }
  const profilesQueryDatas =
    queryClient.getQueriesData<AppBskyActorGetProfiles.OutputSchema>({
      queryKey: [profilesQueryKeyRoot],
    })
  for (const [_queryKey, queryData] of profilesQueryDatas) {
    if (!queryData) {
      continue
    }
    for (let profile of queryData.profiles) {
      if (profile.did === did) {
        yield profile
      }
    }
  }
}

export function findProfileQueryData(
  queryClient: QueryClient,
  did: string,
): AppBskyActorDefs.ProfileViewDetailed | undefined {
  return queryClient.getQueryData<AppBskyActorDefs.ProfileViewDetailed>(
    RQKEY(did),
  )
}
