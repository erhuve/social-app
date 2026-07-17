# Multiplicity Social Client Design

- Date: 2026-07-17
- Status: Proposed, with interaction model approved
- Client base: `bluesky-social/social-app`
- Working branch: `plan/multiplicity-design`

## Product Contract

Likes, follows, and reposts are repeatable public social actions. If Alice follows
Bob seven times, the system stores seven `app.bsky.graph.follow` records and the
client says that Alice follows Bob seven times. The same rule applies to likes and
reposts.

A normal tap always adds one record. Long-pressing the control opens actions for
removing the most recent record or removing every record owned by the viewer for
that subject. Feed ranking treats records as raffle tickets, but a post appears at
most once in a page.

The source of truth is the user's AT Protocol repository, not a private preference
database. Other clients may collapse the records to binary state; this client does
not.

## Recommended Architecture

Use native `app.bsky` records and add a thin multiplicity service beside the
forked client. Continue using a Bluesky AppView for ordinary post and profile
hydration.

```text
User PDS repositories
        |
        | Jetstream creates and deletes
        v
Multiplicity index + feed generator
        |                         |
        | batch counts/state      | getFeedSkeleton
        v                         v
Forked social-app client ------> Bluesky AppView
        |
        | authenticated native record writes
        v
User PDS
```

The client writes records directly to the user's PDS. The service never holds user
credentials and never proxies writes. It indexes every distinct record URI, serves
raw record counts and viewer-owned record URIs, and generates personalized feed
skeletons. The client overlays those values on AppView-hydrated data.

This is preferable to the alternatives:

1. A client-only implementation cannot efficiently discover global multiplicity or
   recover a viewer's records across devices without scanning repositories.
2. A custom lexicon would make the semantics explicit but would lose the useful
   property that every action is also a native Bluesky like, follow, or repost.
3. A full AppView fork would provide complete control, but it is unnecessary for a
   first release and creates a much larger operational surface.

The multiplicity service should be a separate repository once implementation
starts. It has a different release cadence and deployment model from the React
Native client. This repository owns the product design, client integration, and
shared API contract until that split is made.

## Protocol Semantics

`app.bsky.feed.like`, `app.bsky.feed.repost`, and
`app.bsky.graph.follow` all use TID record keys. Raw creates receive a new record
key, but current PDS validation treats the subject backlinks for likes, reposts,
and follows as exclusive: a validated create deletes the actor's previous
conflicting record. Multiplicity writes must validate the known lexicon locally,
then call `com.atproto.repo.createRecord` with `validate: false`. Bluesky's AppView
separately projects actor-subject pairs as unique rows.

The index groups likes and reposts by subject AT URI while retaining the strong-ref
CID for audit and validation. Follows group by subject DID. Deletes remove an exact
record URI. Replayed events are idempotent.

Counts have two representations:

- Aggregate count: number of records, including repeated actions by one actor.
- Actor list: one actor row with an `xN` multiplicity, not N duplicate rows.

Viewer state is an ordered list of owned record URIs. `-1` deletes the newest
record by `(createdAt, rkey)`. `Remove all` deletes all matching owned records and
reports partial failures rather than pretending the operation was atomic.

## Service Data Model And API

The minimum durable tables are:

```text
records(
  uri primary key,
  collection,
  actor_did,
  subject_uri nullable,
  subject_did nullable,
  subject_cid nullable,
  created_at,
  indexed_at
)

posts(
  uri primary key,
  author_did,
  cid,
  created_at,
  indexed_at
)

cursor_state(stream primary key, cursor, updated_at)
```

Indexes cover `(collection, subject_uri)`, `(collection, subject_did)`, and
`(actor_did, collection, subject_*)`. Aggregates should initially be ordinary SQL
queries; materialized counters are justified only after measurement.

The first client endpoint is a batch read:

```text
POST /v1/multiplicity/batch
{
  "viewerDid": "did:plc:...",
  "postUris": ["at://..."],
  "actorDids": ["did:plc:..."]
}
```

It returns aggregate counts and the viewer's ordered record URIs for likes,
reposts, and follows. Public records make these facts public, but personalized feed
requests must still validate the standard feed-generator JWT so one caller cannot
request another person's recommendation state.

The service also implements `app.bsky.feed.getFeedSkeleton`. The skeleton contains
unique post URIs and opaque, deterministic cursors. Bluesky's AppView performs
hydration as usual.

## Client Behavior

Binary fields such as `viewer.like`, `viewer.repost`, and `viewer.following` remain
available as compatibility fallbacks. New multiplicity state sits beside them:

```text
like: {count, viewerRecordUris[]}
repost: {count, viewerRecordUris[]}
follow: {count, viewerRecordUris[]}
```

The existing toggle queues in `src/state/queries/post.ts` and
`src/state/queries/profile.ts` must not be stretched to represent counters. Add
dedicated increment and decrement mutation queues. The post and profile shadow
caches optimistically apply integer deltas and retain record URIs returned by the
PDS.

Every normal tap:

1. Applies an optimistic `+1` and haptic response.
2. Creates one native record through the authenticated agent.
3. Replaces the pending entry with the returned record URI.
4. Rolls back exactly one optimistic increment on failure.

Long press opens `Remove one` and `Remove all`. While an operation is pending, the
client serializes actions per subject but does not block unrelated subjects.
AppView values are shown until the multiplicity batch request resolves; the overlay
then becomes authoritative. Offline writes are not queued in the first release.

## Raffle Feed

The first algorithm is intentionally legible: recent posts from followed authors,
weighted linearly by how many follow records the viewer owns for each author.
Following an author seven times gives that author seven tickets. Sampling chooses
an author proportionally, takes that author's next unseen post, and repeats. It
never emits the same post twice.

The cursor must encode or reference a stable seed, candidate-window boundary, and
consumed position so pagination does not reshuffle previously seen items. A server-
side cursor state table is acceptable for the prototype; a signed opaque cursor is
preferred after the algorithm stabilizes.

Repeated likes enter ranking in the next experiment. Each like record is one taste
event rather than a deduplicated boolean. The initial model should weight recent
posts from repeatedly liked authors and co-liked neighborhoods, with offline replay
tests before exposure. Reposts may become additional distribution tickets later,
but they are only first-class counts/actions in the MVP.

## Delivery Stages

### Stage 0: Protocol Proof

- Use disposable development accounts against a local or test PDS.
- Create three likes, follows, and reposts for identical subjects.
- Verify all nine records remain in the repository with distinct URIs.
- Verify the Bluesky AppView collapses or ignores duplicates as expected.
- Delete one exact record, then all remaining records, and verify stream events.

Exit gate: a checked-in automated integration test demonstrates create, index,
count, single delete, and delete-all behavior without touching a real account.

### Stage 1: Fork Baseline And Product Boundary

- Make web development and the existing test suite reproducible.
- Add a feature flag that leaves upstream behavior unchanged by default.
- Replace Bluesky branding, support links, analytics, and error reporting before
  any distributable build, as required by upstream's fork guidelines.
- Define shared multiplicity types and a fake adapter for UI development.

Exit gate: upstream behavior is unchanged with the flag off, and a clearly branded
development build runs with the flag on.

### Stage 2: Multiplicity Index

- Create the companion service repository.
- Consume Jetstream creates and deletes for posts, likes, reposts, and follows.
- Persist exact record URIs and a resumable cursor.
- Add deterministic replay fixtures, health checks, and lag metrics.
- Add bounded backfill for a viewer's repository so existing duplicate records
  appear after first login.

Exit gate: replaying a fixture twice produces identical rows and counts; restarting
from the saved cursor loses no acknowledged event.

### Stage 3: Read Overlay

- Implement the batch endpoint and client query adapter.
- Overlay counts and viewer record lists on posts and profiles.
- Render `xN` actor rows in liked-by/reposted-by views.
- Fall back to AppView state when the service is unavailable or stale.

Exit gate: web fixtures display multiplicity consistently across timeline, thread,
profile, and detail screens without changing write behavior.

### Stage 4: Repeatable Actions

- Replace binary post and profile controls behind the feature flag.
- Make every tap add one record.
- Add long-press `Remove one` and `Remove all` controls.
- Implement per-subject serialization, optimistic integer deltas, rollback, and
  partial-failure reporting.
- Add action metrics that record the operation but not private credentials.

Exit gate: rapid-tap, reload, multi-device, stale-index, and partial-delete tests
all converge to repository truth.

### Stage 5: Follow Raffle Feed

- Index a bounded recent-post window.
- Implement deterministic weighted sampling without duplicate posts.
- Serve authenticated feed skeletons with stable pagination.
- Add simulations proving a 7-ticket author receives approximately seven times the
  exposure of a 1-ticket author over a sufficiently large sample.

Exit gate: pagination has no duplicates or omissions in deterministic fixtures and
the statistical test stays within a predefined tolerance.

### Stage 6: Like-Driven For You

- Treat each like record as an independent taste event.
- Build offline candidate and ranking experiments before selecting a formula.
- Add diversity, recency, and block/mute filtering without silently deduplicating
  the viewer's preference events.
- Expose a plain-language explanation for why a post was selected.

Exit gate: replay evaluation beats the follow-only baseline on the selected quality
metrics without allowing one subject to monopolize a page.

### Stage 7: Cross-Platform And Release Hardening

- Validate shared behavior on web, iOS, and Android.
- Audit accessibility, translations, rate limits, moderation, and account deletion.
- Publish operational runbooks for index rebuilds, stream lag, and AppView outages.
- Only then enable the feature by default in public builds.

Exit gate: release checklist, rollback switch, data deletion path, and on-call
signals are all exercised in staging.

## Test Strategy

Unit tests cover counter shadows, mutation serialization, rollback, newest-record
selection, deterministic weighted sampling, and cursor encoding. Contract tests run
the client adapter against recorded service responses. Integration tests use a
local PDS/relay fixture to exercise actual record creates and deletes. End-to-end
tests cover tap-to-add, long-press removal, reload reconciliation, and fallback to
binary AppView state.

Property tests should assert that event replay is idempotent, counts never become
negative, delete-all removes only the viewer's records, and feed pages contain
unique post URIs. Statistical tests use fixed seeds and confidence bounds rather
than flaky exact sequences.

## Known Risks

- Other clients may remove only the one record their AppView exposes, leaving the
  viewer's additional records intact.
- Every tap is a public repository write and remains subject to PDS rate and storage
  limits; the UI must surface rejection instead of fabricating a count.
- Bluesky notifications and public counts remain deduplicated outside this client.
- Stream lag briefly makes server counts stale; optimistic local state must reconcile
  by exact record URI.
- Strong-reference CIDs can differ across post revisions. Aggregation uses subject
  URI while preserving each CID for validation and diagnostics.

## References

- [AT Protocol reads and writes](https://atproto.com/guides/reads-and-writes)
- [Bluesky custom feeds](https://docs.bsky.app/docs/starter-templates/custom-feeds)
- [Bluesky federation architecture](https://docs.bsky.app/docs/advanced-guides/federation-architecture)
- [AT Protocol For You feed case study](https://atproto.com/blog/serving-the-for-you-feed)
- [Like lexicon](https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/like.json)
- [Repost lexicon](https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/repost.json)
- [Follow lexicon](https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/graph/follow.json)
- [Bluesky AppView uniqueness constraints](https://github.com/bluesky-social/atproto/blob/main/packages/bsky/src/data-plane/server/db/migrations/20230309T045948368Z-init.ts)
