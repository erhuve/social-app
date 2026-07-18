import {useCallback} from 'react'
import {type AppBskyActorDefs} from '@atproto/api'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {logger} from '#/logger'
import {useProfileShadow} from '#/state/cache/profile-shadow'
import {useActorMultiplicity} from '#/state/queries/multiplicity'
import {
  useProfileFollowMutationQueue,
  useProfileQuery,
} from '#/state/queries/profile'
import {useRequireAuth} from '#/state/session'
import {atoms as a, useBreakpoints} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {MultiplicityRemoveDialog} from '#/components/PostControls/MultiplicityRemoveDialog'
import * as Toast from '#/components/Toast'
import {IS_IOS} from '#/env'
import {GrowthHack} from './GrowthHack'

export function ThreadItemAnchorFollowButton({
  did,
  enabled = true,
}: {
  did: string
  enabled?: boolean
}) {
  if (IS_IOS) {
    return (
      <GrowthHack>
        <ThreadItemAnchorFollowButtonInner did={did} enabled={enabled} />
      </GrowthHack>
    )
  }

  return <ThreadItemAnchorFollowButtonInner did={did} enabled={enabled} />
}

export function ThreadItemAnchorFollowButtonInner({
  did,
  enabled = true,
}: {
  did: string
  enabled?: boolean
}) {
  const {data: profile, isLoading} = useProfileQuery({did})

  // We will never hit this - the profile will always be cached or loaded above
  // but it keeps the typechecker happy
  if (!enabled || isLoading || !profile) return null

  return <PostThreadFollowBtnLoaded profile={profile} />
}

function PostThreadFollowBtnLoaded({
  profile: profileUnshadowed,
}: {
  profile: AppBskyActorDefs.ProfileViewDetailed
}) {
  const {_} = useLingui()
  const {gtMobile} = useBreakpoints()
  const profile = useProfileShadow(profileUnshadowed)
  const multiplicity = useActorMultiplicity(profile)
  const [queueFollow, queueUnfollow, queueUnfollowAll] =
    useProfileFollowMutationQueue(profile, 'PostThreadItem')
  const requireAuth = useRequireAuth()
  const removeFollowControl = Dialog.useDialogControl()

  const viewerFollowCount = multiplicity.follow.viewerRecordUris.length
  const isFollowing = viewerFollowCount > 0
  const isFollowedBy = !!profile.viewer?.followedBy
  const onPress = useCallback(() => {
    requireAuth(async () => {
      try {
        await queueFollow()
      } catch (e: any) {
        if (e?.name !== 'AbortError') {
          logger.error('Failed to follow', {message: String(e)})
          Toast.show(_(msg`There was an issue! ${e.toString()}`), {
            type: 'error',
          })
        }
      }
    })
  }, [requireAuth, queueFollow, _])

  return (
    <>
      <Button
        testID="followBtn"
        label={
          isFollowing
            ? _(msg`Follow ${profile.handle} again`)
            : _(msg`Follow ${profile.handle}`)
        }
        onPress={onPress}
        onLongPress={isFollowing ? () => removeFollowControl.open() : undefined}
        accessibilityActions={
          isFollowing
            ? [{name: 'manageFollows', label: _(msg`Manage your follows`)}]
            : undefined
        }
        onAccessibilityAction={event => {
          if (event.nativeEvent.actionName === 'manageFollows') {
            removeFollowControl.open()
          }
        }}
        accessibilityHint={
          isFollowing
            ? _(
                msg`Adds another follow. Use accessibility actions to remove follows.`,
              )
            : undefined
        }
        size="small"
        color={isFollowing ? 'secondary' : 'secondary_inverted'}
        style={[a.rounded_full]}>
        {gtMobile && (
          <ButtonIcon icon={isFollowing ? CheckIcon : PlusIcon} size="sm" />
        )}
        <ButtonText maxFontSizeMultiplier={2}>
          {!isFollowing ? (
            isFollowedBy ? (
              <Trans>Follow back</Trans>
            ) : (
              <Trans>Follow</Trans>
            )
          ) : viewerFollowCount > 1 ? (
            <Trans>Following ×{viewerFollowCount}</Trans>
          ) : (
            <Trans>Following</Trans>
          )}
        </ButtonText>
      </Button>
      <MultiplicityRemoveDialog
        control={removeFollowControl}
        actionLabel={_(msg`Remove follows`)}
        ownedCount={viewerFollowCount}
        onRemoveOne={queueUnfollow}
        onRemoveAll={queueUnfollowAll}
      />
    </>
  )
}
