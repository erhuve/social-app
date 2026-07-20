import {forwardRef} from 'react'
import {type TextProps} from 'react-native'
import Svg, {Circle, type PathProps, type SvgProps} from 'react-native-svg'

import {flatten, useTheme} from '#/alf'

type Props = {
  allowVariants?: boolean
  fill?: PathProps['fill']
  style?: TextProps['style']
} & Omit<SvgProps, 'style'>

export const Logo = forwardRef(function LogoImpl(props: Props, ref) {
  const t = useTheme()
  const {allowVariants: _allowVariants, fill, ...rest} = props
  const styles = flatten(props.style)
  const size = parseInt(String(rest.width || 32), 10)
  const requestedFill = fill === 'sky' ? undefined : fill
  const petalFill = requestedFill || styles?.color || t.palette.primary_500
  const centerFill = requestedFill ? petalFill : '#d5a94e'

  return (
    <Svg
      fill="none"
      // @ts-ignore react-native-svg accepts forwarded SVG refs
      ref={ref}
      accessibilityLabel="Meadow"
      accessibilityHint=""
      viewBox="0 0 64 64"
      {...rest}
      style={[{width: size, height: size}, styles]}>
      <Circle cx="32" cy="17" r="11" fill={petalFill} />
      <Circle cx="46" cy="28" r="11" fill={petalFill} />
      <Circle cx="41" cy="45" r="11" fill={petalFill} />
      <Circle cx="23" cy="45" r="11" fill={petalFill} />
      <Circle cx="18" cy="28" r="11" fill={petalFill} />
      <Circle cx="32" cy="32" r="9" fill={centerFill} />
    </Svg>
  )
})
