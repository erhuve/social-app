import {
  createFakeMultiplicityAdapter,
  type FakeMultiplicitySeed,
} from '../fake-adapter'

const POST_URI = 'at://did:plc:bob/app.bsky.feed.post/one'
const OTHER_POST_URI = 'at://did:plc:bob/app.bsky.feed.post/two'
const ACTOR_DID = 'did:plc:bob'
const VIEWER_DID = 'did:plc:alice'

function createSeed(): FakeMultiplicitySeed {
  return {
    viewerDid: VIEWER_DID,
    posts: {
      [POST_URI]: {
        like: {
          count: 7,
          viewerRecordUris: ['at://did:plc:alice/app.bsky.feed.like/one'],
        },
        repost: {count: 2, viewerRecordUris: []},
      },
      [OTHER_POST_URI]: {
        like: {count: 1, viewerRecordUris: []},
        repost: {count: 0, viewerRecordUris: []},
      },
    },
    actors: {
      [ACTOR_DID]: {
        follow: {
          count: 3,
          viewerRecordUris: [
            'at://did:plc:alice/app.bsky.graph.follow/one',
            'at://did:plc:alice/app.bsky.graph.follow/two',
          ],
        },
      },
    },
  }
}

describe('createFakeMultiplicityAdapter', () => {
  it('returns only requested seeded posts and actors', async () => {
    const adapter = createFakeMultiplicityAdapter(createSeed())

    const response = await adapter.getBatch({
      viewerDid: VIEWER_DID,
      postUris: [POST_URI, 'at://did:plc:missing/app.bsky.feed.post/one'],
      actorDids: [ACTOR_DID, 'did:plc:missing'],
    })

    expect(Object.keys(response.posts)).toEqual([POST_URI])
    expect(Object.keys(response.actors)).toEqual([ACTOR_DID])
    expect(response.posts[POST_URI].like.count).toBe(7)
    expect(response.actors[ACTOR_DID].follow.viewerRecordUris).toHaveLength(2)
  })

  it('returns isolated state for every request', async () => {
    const adapter = createFakeMultiplicityAdapter(createSeed())
    const request = {
      viewerDid: VIEWER_DID,
      postUris: [POST_URI],
      actorDids: [ACTOR_DID],
    }

    const first = await adapter.getBatch(request)
    const firstViewerRecords = first.posts[POST_URI].like
      .viewerRecordUris as string[]
    firstViewerRecords.push('mutated')
    const second = await adapter.getBatch(request)

    expect(second.posts[POST_URI].like.viewerRecordUris).toEqual([
      'at://did:plc:alice/app.bsky.feed.like/one',
    ])
  })

  it('rejects requests for a different viewer', async () => {
    const adapter = createFakeMultiplicityAdapter(createSeed())

    await expect(
      adapter.getBatch({
        viewerDid: 'did:plc:other',
        postUris: [POST_URI],
        actorDids: [],
      }),
    ).rejects.toThrow('does not match the requested viewer')
  })

  it.each([
    {
      name: 'negative counts',
      like: {count: -1, viewerRecordUris: []},
      message: 'non-negative safe integer',
    },
    {
      name: 'duplicate viewer records',
      like: {count: 2, viewerRecordUris: ['same', 'same']},
      message: 'must be unique',
    },
    {
      name: 'viewer counts above the aggregate',
      like: {
        count: 0,
        viewerRecordUris: ['at://did:plc:alice/app.bsky.feed.like/one'],
      },
      message: 'cannot exceed aggregate',
    },
  ])('rejects $name', ({like, message}) => {
    const validSeed = createSeed()
    const seed = {
      ...validSeed,
      posts: {
        ...validSeed.posts,
        [POST_URI]: {...validSeed.posts[POST_URI], like},
      },
    }

    expect(() => createFakeMultiplicityAdapter(seed)).toThrow(message)
  })
})
