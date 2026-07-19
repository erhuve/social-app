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
    <Overlay label="Meadow public beta">
      <View style={[a.align_start, a.gap_xl]}>
        <View style={[a.gap_sm]}>
          <Text style={[a.text_2xl, a.font_semi_bold, a.leading_snug]}>
            Meadow public beta
          </Text>
          <Text style={[a.leading_snug, a.text_md]}>
            Meadow is an independent AT Protocol client and is not operated by
            or affiliated with Bluesky Social PBC.
          </Text>
          <Text style={[a.leading_snug, a.text_md]}>
            Review the{' '}
            <InlineLinkText to={webLinks.tos} label="Meadow Public Beta Terms">
              Public Beta Terms
            </InlineLinkText>{' '}
            and{' '}
            <InlineLinkText to={webLinks.privacy} label="Meadow Privacy Notice">
              Privacy Notice
            </InlineLinkText>
            .
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
