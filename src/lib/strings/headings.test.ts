import {meadowTitle} from './headings'

describe('meadowTitle', () => {
  it('uses Meadow in dynamic page titles', () => {
    expect(meadowTitle('Post by @alice.test')).toBe(
      'Post by @alice.test — Meadow',
    )
  })

  it('preserves the unread count prefix', () => {
    expect(meadowTitle('Notifications', '3')).toBe('(3) Notifications — Meadow')
  })
})
