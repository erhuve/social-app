import {features} from '#/analytics/features'
import {Features} from '#/analytics/features/types'

jest.mock('@bsky.app/react-native-mmkv', () => ({
  MMKV: class {
    getString() {
      return undefined
    }
    set() {}
  },
}))

jest.mock('#/env', () => ({
  GROWTHBOOK_API_HOST: undefined,
  GROWTHBOOK_CLIENT_KEY: undefined,
}))

describe('local feature defaults', () => {
  it('fails closed for unsupported upstream-only features', () => {
    expect(features.isOn(Features.ImportContactsOnboardingDisable)).toBe(true)
    expect(features.isOn(Features.ImportContactsSettingsDisable)).toBe(true)
    expect(features.isOn(Features.LiveNowBetaDisable)).toBe(true)
    expect(features.isOn(Features.GroupChatsDisable)).toBe(true)
    expect(features.isOn(Features.PostGalleryEmbedEnable)).toBe(false)
  })
})
