import {useCallback} from 'react'
import {View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {atoms as a} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import * as Toast from '#/components/Toast'

export function MultiplicityRemoveDialog({
  control,
  actionLabel,
  ownedCount,
  onRemoveOne,
  onRemoveAll,
}: {
  control: ReturnType<typeof Dialog.useDialogControl>
  actionLabel: string
  ownedCount: number
  onRemoveOne: () => Promise<unknown>
  onRemoveAll: () => Promise<unknown>
}) {
  return (
    <Dialog.Outer control={control} nativeOptions={{preventExpansion: true}}>
      <Dialog.Handle />
      <MultiplicityRemoveDialogInner
        actionLabel={actionLabel}
        ownedCount={ownedCount}
        onRemoveOne={onRemoveOne}
        onRemoveAll={onRemoveAll}
      />
    </Dialog.Outer>
  )
}

function MultiplicityRemoveDialogInner({
  actionLabel,
  ownedCount,
  onRemoveOne,
  onRemoveAll,
}: {
  actionLabel: string
  ownedCount: number
  onRemoveOne: () => Promise<unknown>
  onRemoveAll: () => Promise<unknown>
}) {
  const {_} = useLingui()
  const control = Dialog.useDialogContext()

  const run = useCallback(
    (operation: () => Promise<unknown>) => {
      control.close(() => {
        void operation().catch(error => {
          Toast.show(
            error instanceof Error ? error.message : _(msg`Action failed`),
            {
              type: 'warning',
            },
          )
        })
      })
    },
    [_, control],
  )

  return (
    <Dialog.ScrollableInner label={actionLabel}>
      <View style={a.gap_md}>
        <Button
          label={_(msg`Remove one`)}
          onPress={() => run(onRemoveOne)}
          size="large"
          color="secondary">
          <ButtonText>
            <Trans>Remove one</Trans>
          </ButtonText>
        </Button>
        <Button
          label={_(msg`Remove all`)}
          onPress={() => run(onRemoveAll)}
          size="large"
          color="secondary">
          <ButtonText>
            <Trans>Remove all ({ownedCount})</Trans>
          </ButtonText>
        </Button>
        <Button
          label={_(msg`Cancel`)}
          onPress={() => control.close()}
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
