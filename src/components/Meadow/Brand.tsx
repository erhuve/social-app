import {Platform, View} from 'react-native'
import Svg, {Circle, Path, type SvgProps} from 'react-native-svg'

import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'

export function MeadowMark({
  fill,
  width = 28,
  ...props
}: {fill?: string; width?: number} & Omit<SvgProps, 'width'>) {
  const t = useTheme()
  const color = fill ?? t.palette.primary_600

  return (
    <Svg
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      viewBox="0 0 32 32"
      width={width}
      height={width}
      {...props}>
      <Path fill={color} d="M15 18h2v11h-2z" />
      <Path
        fill={color}
        d="M16 20c-4.8 0-8-3.2-8-7.4C12.8 12.6 16 15.8 16 20ZM16 23c4.2 0 7-2.8 7-6.4-4.2 0-7 2.8-7 6.4Z"
        opacity={0.72}
      />
      <Circle cx="16" cy="11" r="2.2" fill={color} />
      <Path
        fill={color}
        d="M16 1.5c2.4 0 4.1 2 4.1 4.2S18.4 9.8 16 9.8s-4.1-1.9-4.1-4.1S13.6 1.5 16 1.5ZM6.9 8.1c1.2-2 3.7-2.6 5.6-1.5 1.9 1.2 2.5 3.7 1.3 5.8-1.2 2-3.7 2.6-5.6 1.5-1.9-1.2-2.5-3.7-1.3-5.8ZM25.1 8.1c1.2 2 .6 4.6-1.3 5.8-1.9 1.1-4.4.5-5.6-1.5-1.2-2.1-.6-4.6 1.3-5.8 1.9-1.1 4.4-.5 5.6 1.5Z"
        opacity={0.9}
      />
    </Svg>
  )
}

export function MeadowBrand({compact = false}: {compact?: boolean}) {
  const t = useTheme()

  if (compact) return <MeadowMark width={30} />

  return (
    <View style={[a.flex_row, a.align_center, a.gap_sm]}>
      <Text
        accessibilityRole="header"
        style={[
          a.text_2xl,
          {color: t.palette.primary_800, letterSpacing: 2.4},
          Platform.select({
            web: {
              fontFamily:
                'Iowan Old Style, Palatino Linotype, Book Antiqua, Palatino, Georgia, serif',
            },
            ios: {fontFamily: 'Iowan Old Style'},
            android: {fontFamily: 'serif'},
          }),
        ]}>
        MEADOW
      </Text>
      <MeadowMark width={24} />
    </View>
  )
}
