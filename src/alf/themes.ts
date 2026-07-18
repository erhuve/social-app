import {
  createThemes,
  DEFAULT_PALETTE,
  DEFAULT_SUBDUED_PALETTE,
} from '@bsky.app/alf'

const DEFAULT_THEMES = createThemes({
  defaultPalette: {
    ...DEFAULT_PALETTE,
    pink: '#C95B4A',
    like: '#C95B4A',
    yellow: '#D6A62E',
    contrast_0: '#FFFEFA',
    contrast_25: '#FAF8F1',
    contrast_50: '#F1EEE5',
    contrast_100: '#E2DED2',
    contrast_200: '#CBC5B7',
    contrast_300: '#AEA898',
    contrast_400: '#8D8A7D',
    contrast_500: '#6E7165',
    contrast_600: '#565D51',
    contrast_700: '#424B40',
    contrast_800: '#323A31',
    contrast_900: '#252C25',
    contrast_950: '#1B221C',
    contrast_975: '#141A15',
    primary_25: '#F5F8F1',
    primary_50: '#E8EFE2',
    primary_100: '#D0DFC7',
    primary_200: '#AEC6A2',
    primary_300: '#86A77A',
    primary_400: '#62885A',
    primary_500: '#456B42',
    primary_600: '#355735',
    primary_700: '#29452C',
    primary_800: '#203724',
    primary_900: '#172A1C',
    primary_950: '#102016',
    primary_975: '#0B1710',
  },
  subduedPalette: {
    ...DEFAULT_SUBDUED_PALETTE,
    pink: '#C95B4A',
    like: '#C95B4A',
    yellow: '#D6A62E',
    primary_25: '#F5F8F1',
    primary_50: '#EAF0E5',
    primary_100: '#D5E1CE',
    primary_200: '#B4C9AA',
    primary_300: '#8EAC83',
    primary_400: '#6C9063',
    primary_500: '#50764B',
    primary_600: '#3E603D',
    primary_700: '#314C32',
    primary_800: '#293D2B',
    primary_900: '#213123',
    primary_950: '#19271D',
    primary_975: '#121C15',
  },
})

export const themes = {
  lightPalette: DEFAULT_THEMES.light.palette,
  darkPalette: DEFAULT_THEMES.dark.palette,
  dimPalette: DEFAULT_THEMES.dim.palette,
  light: DEFAULT_THEMES.light,
  dark: DEFAULT_THEMES.dark,
  dim: DEFAULT_THEMES.dim,
}

/**
 * @deprecated use ALF and access palette from `useTheme()`
 */
export const lightPalette = DEFAULT_THEMES.light.palette
/**
 * @deprecated use ALF and access palette from `useTheme()`
 */
export const darkPalette = DEFAULT_THEMES.dark.palette
/**
 * @deprecated use ALF and access palette from `useTheme()`
 */
export const dimPalette = DEFAULT_THEMES.dim.palette
/**
 * @deprecated use ALF and access theme from `useTheme()`
 */
export const light = DEFAULT_THEMES.light
/**
 * @deprecated use ALF and access theme from `useTheme()`
 */
export const dark = DEFAULT_THEMES.dark
/**
 * @deprecated use ALF and access theme from `useTheme()`
 */
export const dim = DEFAULT_THEMES.dim
