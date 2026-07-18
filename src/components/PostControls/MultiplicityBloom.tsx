import {View} from 'react-native'

import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'
import {getMultiplicityPetalCount} from './multiplicity-bloom'

export function MultiplicityBloom({
  count,
  color,
}: {
  count: number
  color?: string
}) {
  const t = useTheme()
  const petalCount = getMultiplicityPetalCount(count)
  if (petalCount === 0) return null

  const bloomColor = color ?? t.palette.primary_500

  return (
    <View
      testID="multiplicityBloom"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[a.flex_row, a.align_center, {gap: 2, marginLeft: -2}]}>
      <View style={{width: 13, height: 13}}>
        {Array.from({length: petalCount}, (_, index) => (
          <View
            key={index}
            style={{
              position: 'absolute',
              left: 4.5,
              top: 1,
              width: 4,
              height: 7,
              borderRadius: 4,
              backgroundColor: bloomColor,
              opacity: 0.42 + index * 0.1,
              transform: [
                {translateY: 2},
                {rotate: `${(360 / petalCount) * index}deg`},
                {translateY: -2},
              ],
            }}
          />
        ))}
      </View>
      <Text
        style={[
          a.text_xs,
          a.font_semi_bold,
          t.atoms.text,
          {fontVariant: ['tabular-nums']},
        ]}>
        ×{count}
      </Text>
    </View>
  )
}
