import {memo, useCallback} from 'react'
import {View} from 'react-native'
import {msg, plural} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {useHaptics} from '#/lib/haptics'
import {useRequireAuth} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {CloseQuote_Stroke2_Corner1_Rounded as QuoteIcon} from '#/components/icons/Quote'
import {Repost_Stroke2_Corner3_Rounded as RepostIcon} from '#/components/icons/Repost'
import {useFormatPostStatCount} from '#/components/PostControls/util'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {
  PostControlButton,
  PostControlButtonIcon,
  PostControlButtonText,
} from './PostControlButton'

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

let RepostButton = ({
  isReposted,
  repostCount,
  onRepost,
  onRemoveOne,
  onRemoveAll,
  viewerRepostCount,
  onQuote,
  big,
  embeddingDisabled,
}: Props): React.ReactNode => {
  const t = useTheme()
  const {_} = useLingui()
  const requireAuth = useRequireAuth()
  const dialogControl = Dialog.useDialogControl()
  const formatPostStatCount = useFormatPostStatCount()

  const onPress = () => requireAuth(onRepost)

  const onLongPress = () => requireAuth(() => dialogControl.open())

  return (
    <>
      <PostControlButton
        testID="repostBtn"
        active={isReposted}
        activeColor={t.palette.positive_500}
        big={big}
        onPress={onPress}
        onLongPress={onLongPress}
        label={
          isReposted
            ? _(
                msg({
                  message: `Repost again (${plural(repostCount || 0, {
                    one: '# repost',
                    other: '# reposts',
                  })})`,
                  comment:
                    'Accessibility label for adding another repost, verb followed by number of reposts and noun',
                }),
              )
            : _(
                msg({
                  message: `Repost (${plural(repostCount || 0, {
                    one: '# repost',
                    other: '# reposts',
                  })})`,
                  comment:
                    'Accessibility label for the repost button when the post has not been reposted, verb form followed by number of reposts and noun form',
                }),
              )
        }>
        <PostControlButtonIcon icon={RepostIcon} />
        {typeof repostCount !== 'undefined' && repostCount > 0 && (
          <PostControlButtonText testID="repostCount">
            {formatPostStatCount(repostCount)}
          </PostControlButtonText>
        )}
      </PostControlButton>
      <Dialog.Outer
        control={dialogControl}
        nativeOptions={{preventExpansion: true}}>
        <Dialog.Handle />
        <RepostButtonDialogInner
          isReposted={isReposted}
          onRepost={onRepost}
          onRemoveOne={onRemoveOne}
          onRemoveAll={onRemoveAll}
          viewerRepostCount={viewerRepostCount}
          onQuote={onQuote}
          embeddingDisabled={embeddingDisabled}
        />
      </Dialog.Outer>
    </>
  )
}
RepostButton = memo(RepostButton)
export {RepostButton}

let RepostButtonDialogInner = ({
  isReposted,
  onRepost,
  onRemoveOne,
  onRemoveAll,
  viewerRepostCount,
  onQuote,
  embeddingDisabled,
}: {
  isReposted: boolean
  onRepost: () => void
  onRemoveOne: () => Promise<unknown>
  onRemoveAll: () => Promise<unknown>
  viewerRepostCount: number
  onQuote: () => void
  embeddingDisabled: boolean
}): React.ReactNode => {
  const t = useTheme()
  const {_} = useLingui()
  const playHaptic = useHaptics()
  const control = Dialog.useDialogContext()

  const onPressRepost = useCallback(() => {
    playHaptic()

    control.close(() => {
      onRepost()
    })
  }, [control, onRepost, playHaptic])

  const onPressRemoveOne = useCallback(() => {
    control.close(() => {
      void onRemoveOne().catch(error => {
        Toast.show(
          error instanceof Error ? error.message : _(msg`Action failed`),
          {
            type: 'warning',
          },
        )
      })
    })
  }, [_, control, onRemoveOne])

  const onPressRemoveAll = useCallback(() => {
    control.close(() => {
      void onRemoveAll().catch(error => {
        Toast.show(
          error instanceof Error ? error.message : _(msg`Action failed`),
          {
            type: 'warning',
          },
        )
      })
    })
  }, [_, control, onRemoveAll])

  const onPressQuote = useCallback(() => {
    playHaptic()
    control.close(() => {
      onQuote()
    })
  }, [control, onQuote, playHaptic])

  const onPressClose = useCallback(() => control.close(), [control])

  return (
    <Dialog.ScrollableInner label={_(msg`Repost or quote post`)}>
      <View style={a.gap_xl}>
        <View style={a.gap_xs}>
          <Button
            style={[a.justify_start, a.px_md, a.gap_sm]}
            label={
              isReposted
                ? _(msg`Repost again`)
                : _(msg({message: `Repost`, context: 'action'}))
            }
            onPress={onPressRepost}
            size="large"
            variant="ghost"
            color="primary">
            <RepostIcon size="lg" fill={t.palette.primary_500} />
            <Text style={[a.font_semi_bold, a.text_xl]}>
              {isReposted ? (
                <Trans>Repost again</Trans>
              ) : (
                <Trans context="action">Repost</Trans>
              )}
            </Text>
          </Button>
          {isReposted && (
            <>
              <Button
                style={[a.justify_start, a.px_md]}
                label={_(msg`Remove one repost`)}
                onPress={onPressRemoveOne}
                size="large"
                variant="ghost"
                color="primary">
                <Text style={[a.font_semi_bold, a.text_xl]}>
                  <Trans>Remove one repost</Trans>
                </Text>
              </Button>
              <Button
                style={[a.justify_start, a.px_md]}
                label={_(msg`Remove all reposts`)}
                onPress={onPressRemoveAll}
                size="large"
                variant="ghost"
                color="primary">
                <Text style={[a.font_semi_bold, a.text_xl]}>
                  <Trans>Remove all reposts ({viewerRepostCount})</Trans>
                </Text>
              </Button>
            </>
          )}
          <Button
            disabled={embeddingDisabled}
            testID="quoteBtn"
            style={[a.justify_start, a.px_md, a.gap_sm]}
            label={
              embeddingDisabled
                ? _(msg`Quote posts disabled`)
                : _(msg`Quote post`)
            }
            onPress={onPressQuote}
            size="large"
            variant="ghost"
            color="primary">
            <QuoteIcon
              size="lg"
              fill={
                embeddingDisabled
                  ? t.atoms.text_contrast_low.color
                  : t.palette.primary_500
              }
            />
            <Text
              style={[
                a.font_semi_bold,
                a.text_xl,
                embeddingDisabled && t.atoms.text_contrast_low,
              ]}>
              {embeddingDisabled ? (
                <Trans>Quote posts disabled</Trans>
              ) : (
                <Trans>Quote post</Trans>
              )}
            </Text>
          </Button>
        </View>
        <Button
          label={_(msg`Cancel quote post`)}
          onPress={onPressClose}
          size="large"
          color="secondary">
          <ButtonText>
            <Trans>Cancel</Trans>
          </ButtonText>
        </Button>
      </View>
    </Dialog.ScrollableInner>
  )
}
RepostButtonDialogInner = memo(RepostButtonDialogInner)
export {RepostButtonDialogInner}
