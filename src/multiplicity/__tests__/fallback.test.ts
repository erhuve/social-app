import {createFallbackAction} from '../fallback'

describe('createFallbackAction', () => {
  it('preserves an AppView count without viewer state', () => {
    expect(createFallbackAction(4, undefined)).toEqual({
      count: 4,
      viewerRecordUris: [],
    })
  })

  it('keeps viewer state valid when the AppView count is stale', () => {
    expect(
      createFallbackAction(0, 'at://did:plc:viewer/app.bsky.feed.like/one'),
    ).toEqual({
      count: 1,
      viewerRecordUris: ['at://did:plc:viewer/app.bsky.feed.like/one'],
    })
  })
})
