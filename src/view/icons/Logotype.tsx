import Svg, {
  type PathProps,
  type SvgProps,
  Text as SvgText,
} from 'react-native-svg'

import {usePalette} from '#/lib/hooks/usePalette'

const ratio = 22 / 92

export function Logotype({
  fill,
  ...rest
}: {fill?: PathProps['fill']} & SvgProps) {
  const pal = usePalette('default')
  const size = parseInt(String(rest.width || 92), 10)

  return (
    <Svg
      accessibilityLabel="Meadow"
      accessibilityHint=""
      viewBox="0 0 92 22"
      {...rest}
      width={size}
      height={size * ratio}>
      <SvgText
        x="46"
        y="18"
        fill={fill || pal.text.color}
        fontFamily="InterVariable, sans-serif"
        fontSize="21"
        fontWeight="750"
        letterSpacing="-0.65"
        textAnchor="middle">
        Meadow
      </SvgText>
    </Svg>
  )
}
