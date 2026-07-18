import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {useRequireAuth, useSession} from '#/state/session'
import {EventStopper} from '#/view/com/util/EventStopper'
import {useTheme} from '#/alf'
import {CloseQuote_Stroke2_Corner1_Rounded as Quote} from '#/components/icons/Quote'
import {Repost_Stroke2_Corner2_Rounded as Repost} from '#/components/icons/Repost'
import * as Menu from '#/components/Menu'
import * as Toast from '#/components/Toast'
import {
  PostControlButton,
  PostControlButtonIcon,
  PostControlButtonText,
} from './PostControlButton'
import {useFormatPostStatCount} from './util'

interface Props {
  isReposted: boolean
  repostCount?: number
  onRepost: () => void
  onRemoveOne: () => Promise<unknown>
  onRemoveAll: () => Promise<unknown>
  viewerRepostCount: number
  onQuote: () => void
  big?: boolean
  embeddingDisabled: boolean
}

export const RepostButton = ({
  isReposted,
  repostCount,
  onRepost,
  onRemoveOne,
  onRemoveAll,
  viewerRepostCount,
  onQuote,
  big,
  embeddingDisabled,
}: Props) => {
  const t = useTheme()
  const {_} = useLingui()
  const {hasSession} = useSession()
  const requireAuth = useRequireAuth()
  const formatPostStatCount = useFormatPostStatCount()
  const run = (operation: () => Promise<unknown>) => {
    void operation().catch(error => {
      Toast.show(
        error instanceof Error ? error.message : _(msg`Action failed`),
        {
          type: 'warning',
        },
      )
    })
  }

  return hasSession ? (
    <EventStopper onKeyDown={false}>
      <Menu.Root>
        <Menu.Trigger label={_(msg`Repost or quote post`)}>
          {({props}) => {
            return (
              <PostControlButton
                testID="repostBtn"
                active={isReposted}
                activeColor={t.palette.positive_500}
                label={props.accessibilityLabel}
                big={big}
                {...props}>
                <PostControlButtonIcon icon={Repost} />
                {typeof repostCount !== 'undefined' && repostCount > 0 && (
                  <PostControlButtonText testID="repostCount">
                    {formatPostStatCount(repostCount)}
                  </PostControlButtonText>
                )}
              </PostControlButton>
            )
          }}
        </Menu.Trigger>
        <Menu.Outer style={{minWidth: 170}}>
          <Menu.Item
            label={
              isReposted
                ? _(msg`Repost again`)
                : _(msg({message: `Repost`, context: `action`}))
            }
            testID="repostDropdownRepostBtn"
            onPress={onRepost}>
            <Menu.ItemText>
              {isReposted
                ? _(msg`Repost again`)
                : _(msg({message: `Repost`, context: `action`}))}
            </Menu.ItemText>
            <Menu.ItemIcon icon={Repost} position="right" />
          </Menu.Item>
          {isReposted && (
            <>
              <Menu.Item
                label={_(msg`Remove one repost`)}
                onPress={() => run(onRemoveOne)}>
                <Menu.ItemText>{_(msg`Remove one repost`)}</Menu.ItemText>
              </Menu.Item>
              <Menu.Item
                label={_(msg`Remove all reposts`)}
                onPress={() => run(onRemoveAll)}>
                <Menu.ItemText>
                  {_(msg`Remove all reposts`)} ({viewerRepostCount})
                </Menu.ItemText>
              </Menu.Item>
            </>
          )}
          <Menu.Item
            disabled={embeddingDisabled}
            label={
              embeddingDisabled
                ? _(msg`Quote posts disabled`)
                : _(msg`Quote post`)
            }
            testID="repostDropdownQuoteBtn"
            onPress={onQuote}>
            <Menu.ItemText>
              {embeddingDisabled
                ? _(msg`Quote posts disabled`)
                : _(msg`Quote post`)}
            </Menu.ItemText>
            <Menu.ItemIcon icon={Quote} position="right" />
          </Menu.Item>
        </Menu.Outer>
      </Menu.Root>
    </EventStopper>
  ) : (
    <PostControlButton
      onPress={() => requireAuth(() => {})}
      active={isReposted}
      activeColor={t.palette.positive_500}
      label={_(msg`Repost or quote post`)}
      big={big}>
      <PostControlButtonIcon icon={Repost} />
      {typeof repostCount !== 'undefined' && repostCount > 0 && (
        <PostControlButtonText testID="repostCount">
          {formatPostStatCount(repostCount)}
        </PostControlButtonText>
      )}
    </PostControlButton>
  )
}
