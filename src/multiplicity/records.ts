import {
  AppBskyFeedLike,
  AppBskyFeedRepost,
  AppBskyGraphFollow,
  type BskyAgent,
} from '@atproto/api'

import {assertMultiplicityWritesEnabled} from './capabilities.ts'

type StrongRef = {uri: string; cid: string}

function assertValid(
  result: {success: boolean; error?: unknown},
  collection: string,
): void {
  if (!result.success) {
    throw new Error(`Invalid ${collection} record: ${String(result.error)}`)
  }
}

export async function createMultiplicityLike(
  agent: BskyAgent,
  subject: StrongRef,
  via?: StrongRef,
) {
  const record = {
    $type: 'app.bsky.feed.like' as const,
    subject,
    createdAt: new Date().toISOString(),
    ...(via ? {via} : {}),
  }
  assertValid(AppBskyFeedLike.validateRecord(record), record.$type)
  assertMultiplicityWritesEnabled()
  return agent.app.bsky.feed.like.create(
    {repo: agent.assertDid, validate: false},
    record,
  )
}

export async function createMultiplicityRepost(
  agent: BskyAgent,
  subject: StrongRef,
  via?: StrongRef,
) {
  const record = {
    $type: 'app.bsky.feed.repost' as const,
    subject,
    createdAt: new Date().toISOString(),
    ...(via ? {via} : {}),
  }
  assertValid(AppBskyFeedRepost.validateRecord(record), record.$type)
  assertMultiplicityWritesEnabled()
  return agent.app.bsky.feed.repost.create(
    {repo: agent.assertDid, validate: false},
    record,
  )
}

export async function createMultiplicityFollow(
  agent: BskyAgent,
  subject: string,
  via?: StrongRef,
) {
  const record = {
    $type: 'app.bsky.graph.follow' as const,
    subject,
    createdAt: new Date().toISOString(),
    ...(via ? {via} : {}),
  }
  assertValid(AppBskyGraphFollow.validateRecord(record), record.$type)
  assertMultiplicityWritesEnabled()
  return agent.app.bsky.graph.follow.create(
    {repo: agent.assertDid, validate: false},
    record,
  )
}

export function deleteMultiplicityLike(agent: BskyAgent, uri: string) {
  return agent.deleteLike(uri)
}

export function deleteMultiplicityRepost(agent: BskyAgent, uri: string) {
  return agent.deleteRepost(uri)
}

export function deleteMultiplicityFollow(agent: BskyAgent, uri: string) {
  return agent.deleteFollow(uri)
}
