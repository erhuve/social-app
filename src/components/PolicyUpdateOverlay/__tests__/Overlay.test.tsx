import {type ReactElement} from 'react'
import {Text} from 'react-native'
import {render} from '@testing-library/react-native'

import {Overlay} from '#/components/PolicyUpdateOverlay/Overlay'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaFrame: () => ({height: 800, width: 1280, x: 0, y: 0}),
  useSafeAreaInsets: () => ({bottom: 0, left: 0, right: 0, top: 0}),
}))

jest.mock('#/state/a11y', () => ({
  useA11y: () => ({reduceMotionEnabled: true}),
}))

jest.mock('#/alf', () => {
  const flatten = (styles: unknown) => {
    const result: Record<string, unknown> = {}
    const visit = (style: unknown) => {
      if (Array.isArray(style)) {
        style.forEach(visit)
      } else if (style && typeof style === 'object') {
        Object.assign(result, style)
      }
    }
    visit(styles)
    return result
  }

  return {
    atoms: {
      absolute: {position: 'absolute'},
      align_center: {alignItems: 'center'},
      border: {borderWidth: 1},
      fade_in: {opacity: 1},
      fixed: {position: 'absolute'},
      flex_1: {flex: 1},
      inset_0: {bottom: 0, left: 0, right: 0, top: 0},
      justify_end: {justifyContent: 'flex-end'},
      p_2xl: {padding: 24},
      relative: {position: 'relative'},
      rounded_md: {borderRadius: 8},
      w_full: {width: '100%'},
      z_10: {zIndex: 10},
      z_20: {zIndex: 20},
      zoom_fade_in: {opacity: 1},
    },
    flatten,
    useBreakpoints: () => ({gtPhone: true}),
    useTheme: () => ({
      atoms: {
        bg: {backgroundColor: '#fff'},
        border_contrast_low: {borderColor: '#ddd'},
        shadow_lg: {boxShadow: 'none'},
      },
      palette: {black: '#000'},
    }),
    web: (style: object) => style,
  }
})

jest.mock('#/components/LockScroll', () => ({LockScroll: () => null}))
jest.mock('#/components/FocusScope', () => ({
  FocusScope: ({children}: {children: ReactElement<{style?: unknown}>}) => {
    if (Array.isArray(children.props.style)) {
      throw new Error('FocusScope received a style array')
    }
    return children
  },
}))

describe('PolicyUpdateOverlay Overlay', () => {
  test('passes a plain style object through the FocusScope boundary', () => {
    expect(() =>
      render(
        <Overlay label="Policy update">
          <Text>content</Text>
        </Overlay>,
      ),
    ).not.toThrow()
  })
})
