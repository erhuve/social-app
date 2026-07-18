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

  it('bounds concurrent service calls across a large flush', async () => {
    let active = 0
    let peak = 0
    const getBatch: MultiplicityAdapter['getBatch'] = async request => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise(resolve => setTimeout(resolve, 0))
      active -= 1
      return {
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
      }
    }
    const service = {getBatch: jest.fn(getBatch)}
    const adapter = createBatchedMultiplicityAdapter(service)
    const postUris = Array.from(
      {length: 401},
      (_, index) => `at://did:plc:author/app.bsky.feed.post/${index}`,
    )

    const result = await adapter.getBatch({
      viewerDid: VIEWER,
      postUris,
      actorDids: [],
    })

    expect(service.getBatch).toHaveBeenCalledTimes(5)
    expect(peak).toBe(2)
    expect(Object.keys(result.posts)).toHaveLength(401)
  })

  it('bounds service calls across overlapping flushes', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    let active = 0
    let peak = 0
    const service: MultiplicityAdapter = {
      async getBatch(request) {
        active += 1
        peak = Math.max(peak, active)
        await gate
        active -= 1
        return {
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
        }
      },
    }
    const adapter = createBatchedMultiplicityAdapter(service)
    const firstUris = Array.from(
      {length: 201},
      (_, index) => `at://did:plc:author/app.bsky.feed.post/first-${index}`,
    )
    const first = adapter.getBatch({
      viewerDid: VIEWER,
      postUris: firstUris,
      actorDids: [],
    })
    await new Promise(resolve => setTimeout(resolve, 0))

    const second = adapter.getBatch({
      viewerDid: 'did:plc:other',
      postUris: [POST_ONE],
      actorDids: [],
    })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(active).toBe(2)
    expect(peak).toBe(2)
    release()
    await Promise.all([first, second])
    expect(peak).toBe(2)
  })

  it('transfers released slots before admitting a newly flushed request', async () => {
    let adapter!: MultiplicityAdapter
    let active = 0
    let peak = 0
    let firstStarted = false
    let releaseFirst!: () => void
    const firstGate = new Promise<void>(resolve => {
      releaseFirst = resolve
    })
    let releaseOthers!: () => void
    const othersGate = new Promise<void>(resolve => {
      releaseOthers = resolve
    })
    let overlapping: Promise<MultiplicityBatchResponse> | undefined
    const service: MultiplicityAdapter = {
      async getBatch(request) {
        active += 1
        peak = Math.max(peak, active)
        if (!firstStarted) {
          firstStarted = true
          await firstGate
          overlapping = adapter.getBatch({
            viewerDid: 'did:plc:other',
            postUris: [POST_ONE],
            actorDids: [],
          })
        } else {
          await othersGate
        }
        active -= 1
        return {
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
        }
      },
    }
    adapter = createBatchedMultiplicityAdapter(service)
    const first = adapter.getBatch({
      viewerDid: VIEWER,
      postUris: Array.from(
        {length: 201},
        (_, index) => `at://did:plc:author/app.bsky.feed.post/${index}`,
      ),
      actorDids: [],
    })
    await new Promise(resolve => setTimeout(resolve, 0))

    releaseFirst()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(peak).toBe(2)

    releaseOthers()
    await first
    await overlapping
    expect(peak).toBe(2)
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
