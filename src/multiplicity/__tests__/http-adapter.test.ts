import {
  assertMultiplicityWritesEnabled,
  MAX_MULTIPLICITY_CAPABILITY_AGE_MS,
  resetMultiplicityCapabilitiesForTest,
} from '../capabilities'
import {createHttpMultiplicityAdapter} from '../http-adapter'

const POST_URI = 'at://did:plc:bob/app.bsky.feed.post/one'
const ACTOR_DID = 'did:plc:bob'
const VIEWER_DID = 'did:plc:alice'

function serviceResponse() {
  return {
    capabilities: {generation: 1, writesEnabled: true, feedEnabled: true},
    posts: {
      [POST_URI]: {
        like: {
          count: 3,
          viewerRecordUris: ['at://did:plc:alice/app.bsky.feed.like/one'],
        },
        repost: {count: 0, viewerRecordUris: []},
      },
      'at://did:plc:unrequested/app.bsky.feed.post/one': {
        like: {count: 99, viewerRecordUris: []},
        repost: {count: 0, viewerRecordUris: []},
      },
    },
    actors: {
      [ACTOR_DID]: {
        follow: {count: 2, viewerRecordUris: []},
      },
    },
  }
}

describe('createHttpMultiplicityAdapter', () => {
  beforeEach(() => resetMultiplicityCapabilitiesForTest())

  it('posts a batch and returns only requested validated state', async () => {
    const fetch = jest.fn(() =>
      Promise.resolve(Response.json(serviceResponse())),
    )
    const adapter = createHttpMultiplicityAdapter({
      baseUrl: 'https://multiplicity.example/base/',
      fetch,
    })
    const request = {
      viewerDid: VIEWER_DID,
      postUris: [POST_URI],
      actorDids: [ACTOR_DID],
    }

    const result = await adapter.getBatch(request)

    expect(fetch).toHaveBeenCalledWith(
      'https://multiplicity.example/base/v1/multiplicity/batch',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      }),
    )
    expect(Object.keys(result.posts)).toEqual([POST_URI])
    expect(result.posts[POST_URI].like.count).toBe(3)
  })

  it('rejects service errors', async () => {
    const adapter = createHttpMultiplicityAdapter({
      baseUrl: 'https://multiplicity.example',
      fetch: () =>
        Promise.resolve(Response.json({error: 'unavailable'}, {status: 503})),
    })

    await expect(
      adapter.getBatch({viewerDid: VIEWER_DID, postUris: [], actorDids: []}),
    ).rejects.toThrow('status 503')
  })

  it('blocks new records after the service disables writes', async () => {
    const adapter = createHttpMultiplicityAdapter({
      baseUrl: 'https://multiplicity.example',
      fetch: () =>
        Promise.resolve(
          Response.json({
            ...serviceResponse(),
            capabilities: {
              generation: 2,
              writesEnabled: false,
              feedEnabled: true,
            },
          }),
        ),
    })

    await adapter.getBatch({
      viewerDid: VIEWER_DID,
      postUris: [],
      actorDids: [],
    })

    expect(() => assertMultiplicityWritesEnabled()).toThrow(
      'temporarily paused',
    )
  })

  it('rejects malformed capability state without changing write behavior', async () => {
    const adapter = createHttpMultiplicityAdapter({
      baseUrl: 'https://multiplicity.example',
      fetch: () =>
        Promise.resolve(
          Response.json({
            ...serviceResponse(),
            capabilities: {
              generation: 1,
              writesEnabled: 'no',
              feedEnabled: true,
            },
          }),
        ),
    })

    await expect(
      adapter.getBatch({
        viewerDid: VIEWER_DID,
        postUris: [],
        actorDids: [],
      }),
    ).rejects.toThrow('are invalid')
    expect(() => assertMultiplicityWritesEnabled()).toThrow(
      'temporarily paused',
    )
  })

  it('fails closed before the first capability response', () => {
    createHttpMultiplicityAdapter({
      baseUrl: 'https://multiplicity.example',
      fetch: () => Promise.reject(new Error('offline')),
    })

    expect(() => assertMultiplicityWritesEnabled()).toThrow(
      'temporarily paused',
    )
  })

  it('ignores enabled responses from an older service generation', async () => {
    const responses = [
      {generation: 3, writesEnabled: false, feedEnabled: true},
      {generation: 2, writesEnabled: true, feedEnabled: true},
    ]
    const adapter = createHttpMultiplicityAdapter({
      baseUrl: 'https://multiplicity.example',
      fetch: () =>
        Promise.resolve(
          Response.json({
            ...serviceResponse(),
            capabilities: responses.shift(),
          }),
        ),
    })

    await adapter.getBatch({
      viewerDid: VIEWER_DID,
      postUris: [],
      actorDids: [],
    })
    await adapter.getBatch({
      viewerDid: VIEWER_DID,
      postUris: [],
      actorDids: [],
    })

    expect(() => assertMultiplicityWritesEnabled()).toThrow(
      'temporarily paused',
    )
  })

  it('expires enabled state after capability refreshes stop', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000)
    const adapter = createHttpMultiplicityAdapter({
      baseUrl: 'https://multiplicity.example',
      fetch: () => Promise.resolve(Response.json(serviceResponse())),
    })
    await adapter.getBatch({
      viewerDid: VIEWER_DID,
      postUris: [],
      actorDids: [],
    })
    expect(() => assertMultiplicityWritesEnabled()).not.toThrow()

    now.mockReturnValue(1_000 + MAX_MULTIPLICITY_CAPABILITY_AGE_MS + 1)
    expect(() => assertMultiplicityWritesEnabled()).toThrow(
      'temporarily paused',
    )
    now.mockRestore()
  })

  it('expires enabled state when the wall clock moves backward', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(10_000)
    const adapter = createHttpMultiplicityAdapter({
      baseUrl: 'https://multiplicity.example',
      fetch: () => Promise.resolve(Response.json(serviceResponse())),
    })
    await adapter.getBatch({
      viewerDid: VIEWER_DID,
      postUris: [],
      actorDids: [],
    })

    now.mockReturnValue(9_999)
    expect(() => assertMultiplicityWritesEnabled()).toThrow(
      'temporarily paused',
    )
    now.mockRestore()
  })

  it('mints a fresh service token and sends it as bearer auth', async () => {
    const getServiceAuthToken = jest.fn(() => Promise.resolve('signed-token'))
    const fetch = jest.fn(() =>
      Promise.resolve(Response.json({posts: {}, actors: {}})),
    )
    const adapter = createHttpMultiplicityAdapter({
      baseUrl: 'https://multiplicity.example',
      fetch,
      getServiceAuthToken,
    })

    await adapter.getBatch({viewerDid: VIEWER_DID, postUris: [], actorDids: []})

    expect(getServiceAuthToken).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(
      'https://multiplicity.example/v1/multiplicity/batch',
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer signed-token',
          'Content-Type': 'application/json',
        },
      }),
    )
  })

  it('never sends service auth tokens over plaintext HTTP', () => {
    const getServiceAuthToken = jest.fn(() => Promise.resolve('signed-token'))

    expect(() =>
      createHttpMultiplicityAdapter({
        baseUrl: 'http://multiplicity.example',
        getServiceAuthToken,
      }),
    ).toThrow('require HTTPS')
    expect(getServiceAuthToken).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'negative counts',
      response: {
        ...serviceResponse(),
        posts: {
          [POST_URI]: {
            like: {count: -1, viewerRecordUris: []},
            repost: {count: 0, viewerRecordUris: []},
          },
        },
      },
      message: 'non-negative safe integer',
    },
    {
      name: 'malformed viewer records',
      response: {
        ...serviceResponse(),
        posts: {
          [POST_URI]: {
            like: {count: 1, viewerRecordUris: [7]},
            repost: {count: 0, viewerRecordUris: []},
          },
        },
      },
      message: 'array of strings',
    },
    {
      name: 'unbounded viewer records',
      response: {
        ...serviceResponse(),
        posts: {
          [POST_URI]: {
            like: {
              count: 1_001,
              viewerRecordUris: Array.from(
                {length: 1_001},
                (_, index) => `at://did:plc:alice/app.bsky.feed.like/${index}`,
              ),
            },
            repost: {count: 0, viewerRecordUris: []},
          },
        },
      },
      message: 'at most 1000',
    },
    {
      name: 'records owned by another viewer',
      response: {
        ...serviceResponse(),
        posts: {
          [POST_URI]: {
            like: {
              count: 1,
              viewerRecordUris: ['at://did:plc:mallory/app.bsky.feed.like/one'],
            },
            repost: {count: 0, viewerRecordUris: []},
          },
        },
      },
      message: 'requested viewer',
    },
    {
      name: 'records from the wrong collection',
      response: {
        ...serviceResponse(),
        posts: {
          [POST_URI]: {
            like: {
              count: 1,
              viewerRecordUris: ['at://did:plc:alice/app.bsky.feed.repost/one'],
            },
            repost: {count: 0, viewerRecordUris: []},
          },
        },
      },
      message: 'requested viewer',
    },
  ])('rejects $name', async ({response, message}) => {
    const adapter = createHttpMultiplicityAdapter({
      baseUrl: 'https://multiplicity.example',
      fetch: () => Promise.resolve(Response.json(response)),
    })

    await expect(
      adapter.getBatch({
        viewerDid: VIEWER_DID,
        postUris: [POST_URI],
        actorDids: [],
      }),
    ).rejects.toThrow(message)
  })

  it('rejects non-HTTP service URLs at construction', () => {
    expect(() =>
      createHttpMultiplicityAdapter({baseUrl: 'file:///tmp/index'}),
    ).toThrow('HTTP or HTTPS')
  })
})
