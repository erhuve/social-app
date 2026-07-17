import {createBatchedMultiplicityAdapter} from '../batched-adapter'
import {
  type MultiplicityAdapter,
  type MultiplicityBatchResponse,
} from '../types'

const VIEWER = 'did:plc:viewer'
const POST_ONE = 'at://did:plc:author/app.bsky.feed.post/one'
const POST_TWO = 'at://did:plc:author/app.bsky.feed.post/two'
const ACTOR = 'did:plc:author'

function response(): MultiplicityBatchResponse {
  return {
    posts: {
      [POST_ONE]: {
        like: {count: 1, viewerRecordUris: []},
        repost: {count: 0, viewerRecordUris: []},
      },
      [POST_TWO]: {
        like: {count: 2, viewerRecordUris: []},
        repost: {count: 0, viewerRecordUris: []},
      },
    },
    actors: {
      [ACTOR]: {follow: {count: 3, viewerRecordUris: []}},
    },
  }
}

describe('createBatchedMultiplicityAdapter', () => {
  it('combines concurrent requests for one viewer', async () => {
    const getBatch = jest.fn(() => Promise.resolve(response()))
    const adapter = createBatchedMultiplicityAdapter({getBatch})

    const [post, actor] = await Promise.all([
      adapter.getBatch({
        viewerDid: VIEWER,
        postUris: [POST_ONE, POST_TWO],
        actorDids: [],
      }),
      adapter.getBatch({
        viewerDid: VIEWER,
        postUris: [POST_TWO],
        actorDids: [ACTOR],
      }),
    ])

    expect(getBatch).toHaveBeenCalledTimes(1)
    expect(getBatch).toHaveBeenCalledWith({
      viewerDid: VIEWER,
      postUris: [POST_ONE, POST_TWO],
      actorDids: [ACTOR],
    })
    expect(Object.keys(post.posts)).toEqual([POST_ONE, POST_TWO])
    expect(Object.keys(actor.posts)).toEqual([POST_TWO])
  })

  it('does not combine requests from different viewers', async () => {
    const getBatch = jest.fn(() => Promise.resolve(response()))
    const adapter = createBatchedMultiplicityAdapter({getBatch})

    await Promise.all([
      adapter.getBatch({
        viewerDid: VIEWER,
        postUris: [POST_ONE],
        actorDids: [],
      }),
      adapter.getBatch({
        viewerDid: 'did:plc:other',
        postUris: [POST_ONE],
        actorDids: [],
      }),
    ])

    expect(getBatch).toHaveBeenCalledTimes(2)
  })

  it('chunks batches at the service subject limit', async () => {
    const getBatch = jest.fn<
      ReturnType<MultiplicityAdapter['getBatch']>,
      Parameters<MultiplicityAdapter['getBatch']>
    >(request =>
      Promise.resolve({
        posts: Object.fromEntries(
          request.postUris.map(uri => [
            uri,
            {
              like: {count: 0, viewerRecordUris: []},
              repost: {count: 0, viewerRecordUris: []},
            },
          ]),
        ),
        actors: {},
      }),
    )
    const adapter = createBatchedMultiplicityAdapter({getBatch})
    const postUris = Array.from(
      {length: 101},
      (_, index) => `at://did:plc:author/app.bsky.feed.post/${index}`,
    )

    const result = await adapter.getBatch({
      viewerDid: VIEWER,
      postUris,
      actorDids: [],
    })

    expect(getBatch).toHaveBeenCalledTimes(2)
    expect(getBatch.mock.calls[0][0].postUris).toHaveLength(100)
    expect(getBatch.mock.calls[1][0].postUris).toHaveLength(1)
    expect(Object.keys(result.posts)).toHaveLength(101)
  })

  it('rejects every grouped request when the service fails', async () => {
    const failure = new Error('offline')
    const adapter = createBatchedMultiplicityAdapter({
      getBatch: () => Promise.reject(failure),
    })

    const results = await Promise.allSettled([
      adapter.getBatch({
        viewerDid: VIEWER,
        postUris: [POST_ONE],
        actorDids: [],
      }),
      adapter.getBatch({viewerDid: VIEWER, postUris: [], actorDids: [ACTOR]}),
    ])

    expect(results).toEqual([
      {status: 'rejected', reason: failure},
      {status: 'rejected', reason: failure},
    ])
  })
})
