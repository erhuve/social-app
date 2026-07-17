import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AppBskyFeedDefs,
  AppBskyFeedLike,
  AppBskyFeedRepost,
  AppBskyGraphFollow,
  AtUri,
  type BskyAgent,
} from '@atproto/api'

import {
  createMultiplicityFollow,
  createMultiplicityLike,
  createMultiplicityRepost,
} from '../src/multiplicity/records.ts'
import {createServer} from './test-pds.ts'

const COLLECTIONS = {
  follow: 'app.bsky.graph.follow',
  like: 'app.bsky.feed.like',
  repost: 'app.bsky.feed.repost',
} as const

type Collection = (typeof COLLECTIONS)[keyof typeof COLLECTIONS]

async function listRecordUris(
  agent: BskyAgent,
  repo: string,
  collection: Collection,
) {
  const response = await agent.com.atproto.repo.listRecords({
    repo,
    collection,
    limit: 100,
  })
  return response.data.records.map(record => record.uri)
}

async function deleteRecord(
  agent: BskyAgent,
  repo: string,
  collection: Collection,
  uri: string,
) {
  await agent.com.atproto.repo.deleteRecord({
    repo,
    collection,
    rkey: new AtUri(uri).rkey,
  })
}

async function assertRepositoryCounts(
  agent: BskyAgent,
  repo: string,
  expected: number,
) {
  for (const collection of Object.values(COLLECTIONS)) {
    const uris = await listRecordUris(agent, repo, collection)
    assert.equal(uris.length, expected, collection)
    assert.equal(new Set(uris).size, expected, `${collection} record URIs`)
  }
}

void test('native records preserve multiplicity while AppView projects binary state', async () => {
  const server = await createServer()

  try {
    await server.mocker.createUser('alice')
    await server.mocker.createUser('bob')

    const alice = server.mocker.users.alice
    const bob = server.mocker.users.bob
    const post = await server.mocker.createPost('bob', 'Multiplicity proof')
    const createdAt = new Date('2026-01-01T00:00:00.000Z').toISOString()
    const actionRecords = {
      follow: {
        $type: COLLECTIONS.follow,
        subject: bob.did,
        createdAt,
      },
      like: {
        $type: COLLECTIONS.like,
        subject: post,
        createdAt,
      },
      repost: {
        $type: COLLECTIONS.repost,
        subject: post,
        createdAt,
      },
    } as const

    assert(AppBskyFeedLike.validateRecord(actionRecords.like).success)
    assert(AppBskyFeedRepost.validateRecord(actionRecords.repost).success)
    assert(AppBskyGraphFollow.validateRecord(actionRecords.follow).success)

    for (let i = 0; i < 2; i++) {
      await alice.agent.app.bsky.feed.like.create(
        {repo: alice.did},
        actionRecords.like,
      )
      await alice.agent.app.bsky.feed.repost.create(
        {repo: alice.did},
        actionRecords.repost,
      )
      await alice.agent.app.bsky.graph.follow.create(
        {repo: alice.did},
        actionRecords.follow,
      )
    }
    await assertRepositoryCounts(alice.agent, alice.did, 1)
    for (const collection of Object.values(COLLECTIONS)) {
      const [uri] = await listRecordUris(alice.agent, alice.did, collection)
      await deleteRecord(alice.agent, alice.did, collection, uri)
    }
    await assertRepositoryCounts(alice.agent, alice.did, 0)

    const records = {
      follow: [],
      like: [],
      repost: [],
    } as Record<keyof typeof COLLECTIONS, string[]>

    for (let i = 0; i < 3; i++) {
      const like = await createMultiplicityLike(alice.agent, post)
      const repost = await createMultiplicityRepost(alice.agent, post)
      const follow = await createMultiplicityFollow(alice.agent, bob.did)
      records.like.push(like.uri)
      records.repost.push(repost.uri)
      records.follow.push(follow.uri)
    }
    await assertRepositoryCounts(alice.agent, alice.did, 3)
    await server.mocker.testNet.processAll()

    const thread = await alice.agent.getPostThread({uri: post.uri})
    assert(AppBskyFeedDefs.isThreadViewPost(thread.data.thread))
    assert.equal(thread.data.thread.post.likeCount, 1)
    assert.equal(thread.data.thread.post.repostCount, 1)
    assert(records.like.includes(thread.data.thread.post.viewer?.like ?? ''))
    assert(
      records.repost.includes(thread.data.thread.post.viewer?.repost ?? ''),
    )

    const profile = await alice.agent.getProfile({actor: bob.did})
    assert.equal(profile.data.followersCount, 1)
    assert(records.follow.includes(profile.data.viewer?.following ?? ''))

    const firstRecords = Object.entries(COLLECTIONS).map(
      ([action, collection]) => ({
        action: action as keyof typeof COLLECTIONS,
        collection,
        uri: records[action as keyof typeof COLLECTIONS][0],
      }),
    )
    for (const {collection, uri} of firstRecords) {
      await deleteRecord(alice.agent, alice.did, collection, uri)
    }
    await assertRepositoryCounts(alice.agent, alice.did, 2)

    for (const [action, collection] of Object.entries(COLLECTIONS)) {
      for (const uri of records[action as keyof typeof COLLECTIONS].slice(1)) {
        await deleteRecord(alice.agent, alice.did, collection, uri)
      }
    }
    await assertRepositoryCounts(alice.agent, alice.did, 0)
    await server.mocker.testNet.processAll()

    const deletedThread = await alice.agent.getPostThread({uri: post.uri})
    assert(AppBskyFeedDefs.isThreadViewPost(deletedThread.data.thread))
    assert.equal(deletedThread.data.thread.post.likeCount, 0)
    assert.equal(deletedThread.data.thread.post.repostCount, 0)
    assert.equal(deletedThread.data.thread.post.viewer?.like, undefined)
    assert.equal(deletedThread.data.thread.post.viewer?.repost, undefined)

    const deletedProfile = await alice.agent.getProfile({actor: bob.did})
    assert.equal(deletedProfile.data.followersCount, 0)
    assert.equal(deletedProfile.data.viewer?.following, undefined)
  } finally {
    await server.close()
  }
})
