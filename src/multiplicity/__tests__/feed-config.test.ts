import {parseMultiplicityFeedUri} from '../feed-config'

describe('parseMultiplicityFeedUri', () => {
  it('accepts a canonical generator record URI', () => {
    const uri =
      'at://did:plc:abcdefghijklmnopqrstuvwxyz/app.bsky.feed.generator/raffle'
    expect(parseMultiplicityFeedUri(uri)).toBe(uri)
  })

  it.each([
    undefined,
    '',
    ' at://did:plc:abcdefghijklmnopqrstuvwxyz/app.bsky.feed.generator/raffle',
    'https://example.com/app.bsky.feed.generator/raffle',
    'at://example.com/app.bsky.feed.generator/raffle',
    'at://did:plc:abcdefghijklmnopqrstuvwxyz/app.bsky.feed.post/raffle',
    'at://did:plc:abcdefghijklmnopqrstuvwxyz/app.bsky.feed.generator',
  ])('rejects malformed or non-generator configuration: %s', value => {
    expect(parseMultiplicityFeedUri(value)).toBeUndefined()
  })
})
