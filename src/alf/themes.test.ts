import {themes} from './themes'
import {contrastRatio} from './util/colorGeneration'

describe('Meadow themes', () => {
  it('uses charcoal-moss surfaces in dark and dim modes', () => {
    expect(themes.dark.atoms.bg.backgroundColor).toBe('#0D130F')
    expect(themes.dim.atoms.bg.backgroundColor).toBe('#1B251F')
    expect(
      contrastRatio(
        themes.dark.atoms.bg.backgroundColor,
        themes.dim.atoms.bg.backgroundColor,
      ),
    ).toBeGreaterThan(1.15)
  })

  it('uses accessible green foregrounds and green-gray dim neutrals', () => {
    expect(themes.dim.atoms.border_contrast_low.borderColor).toBe('#3A463E')
    expect(themes.dim.atoms.text_contrast_medium.color).toBe('#A7A59A')
    expect(themes.light.palette.primary_500).toBe('#456B42')

    for (const theme of [themes.dark, themes.dim]) {
      expect(theme.palette.primary_500).toBe('#739A6A')
      expect(
        contrastRatio(
          theme.atoms.bg.backgroundColor,
          theme.palette.primary_500,
        ),
      ).toBeGreaterThanOrEqual(4.5)
    }
  })
})
