import {useCallback} from 'react'
import {View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {webLinks} from '#/lib/constants'
import {atoms as a} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {InlineLinkText} from '#/components/Link'
import {Overlay} from '#/components/PolicyUpdateOverlay/Overlay'
import {type PolicyUpdateState} from '#/components/PolicyUpdateOverlay/usePolicyUpdateState'
import {Text} from '#/components/Typography'

export function Content({state}: {state: PolicyUpdateState}) {
  const {_} = useLingui()
  const handleClose = useCallback(() => state.complete(), [state])

  return (
    <Overlay label={_(msg`Meadow public beta`)}>
      <View style={[a.align_start, a.gap_xl]}>
        <View style={[a.gap_sm]}>
          <Text style={[a.text_2xl, a.font_semi_bold, a.leading_snug]}>
            <Trans>Meadow public beta</Trans>
          </Text>
          <Text style={[a.leading_snug, a.text_md]}>
            <Trans>
              Meadow is an independent AT Protocol client and is not operated by
              or affiliated with Bluesky Social PBC.
            </Trans>
          </Text>
          <Text style={[a.leading_snug, a.text_md]}>
            <Trans>
              Review the{' '}
              <InlineLinkText
                to={webLinks.tos}
                label={_(msg`Meadow Public Beta Terms`)}>
                Public Beta Terms
              </InlineLinkText>{' '}
              and{' '}
              <InlineLinkText
                to={webLinks.privacy}
                label={_(msg`Meadow Privacy Notice`)}>
                Privacy Notice
              </InlineLinkText>
              .
            </Trans>
          </Text>
        </View>

        <Button
          label={_(msg`Continue`)}
          color="primary"
          size="large"
          onPress={handleClose}>
          <ButtonText>
            <Trans>Continue</Trans>
          </ButtonText>
        </Button>
      </View>
    </Overlay>
  )
}
