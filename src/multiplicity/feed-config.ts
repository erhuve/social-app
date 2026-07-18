import {AtUri} from '@atproto/api'

const FEED_GENERATOR_COLLECTION = 'app.bsky.feed.generator'

export function parseMultiplicityFeedUri(
  value: string | undefined,
): string | undefined {
  if (!value || value !== value.trim()) return undefined

  try {
    const uri = new AtUri(value)
    if (
      uri.protocol !== 'at:' ||
      !uri.hostname.startsWith('did:') ||
      uri.collection !== FEED_GENERATOR_COLLECTION ||
      !uri.rkey ||
      uri.toString() !== value
    ) {
      return undefined
    }
    return value
  } catch {
    return undefined
  }
}
