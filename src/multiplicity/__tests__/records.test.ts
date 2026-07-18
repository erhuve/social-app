import {type BskyAgent} from '@atproto/api'

jest.unmock('multiformats/cid')

import {
  createMultiplicityFollow,
  createMultiplicityLike,
  createMultiplicityRepost,
} from '../records'

const subject = {
  uri: 'at://did:plc:author/app.bsky.feed.post/example',
  cid: 'bafyreicsat53vek22bcwiciquqdffd7dyrpnink6dhf2nfdlvt5olvb5hm',
}

function createAgent() {
  const like = jest.fn().mockResolvedValue({uri: 'at://viewer/like/1'})
  const repost = jest.fn().mockResolvedValue({uri: 'at://viewer/repost/1'})
  const follow = jest.fn().mockResolvedValue({uri: 'at://viewer/follow/1'})
  const agent = {
    assertDid: 'did:plc:viewer',
    app: {
      bsky: {
        feed: {
          like: {create: like},
          repost: {create: repost},
        },
        graph: {follow: {create: follow}},
      },
    },
  } as unknown as BskyAgent
  return {agent, like, repost, follow}
}

describe('multiplicity record writes', () => {
  it('creates each action with server validation disabled after local validation', async () => {
    const {agent, like, repost, follow} = createAgent()

    await createMultiplicityLike(agent, subject)
    await createMultiplicityRepost(agent, subject)
    await createMultiplicityFollow(agent, 'did:plc:author')

    const options = {repo: 'did:plc:viewer', validate: false}
    expect(like).toHaveBeenCalledWith(
      options,
      expect.objectContaining({
        $type: 'app.bsky.feed.like',
        subject,
        createdAt: expect.any(String),
      }),
    )
    expect(repost).toHaveBeenCalledWith(
      options,
      expect.objectContaining({
        $type: 'app.bsky.feed.repost',
        subject,
        createdAt: expect.any(String),
      }),
    )
    expect(follow).toHaveBeenCalledWith(
      options,
      expect.objectContaining({
        $type: 'app.bsky.graph.follow',
        subject: 'did:plc:author',
        createdAt: expect.any(String),
      }),
    )
  })
})
