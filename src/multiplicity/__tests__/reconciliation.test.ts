import {addPendingRecord, removeRecords} from '../action-state'
import {
  applyMultiplicityOverlay,
  commitMultiplicityRemoval,
  confirmMultiplicityAddition,
  getMultiplicityReconciliationSizeForTest,
  markMultiplicityAddition,
  markMultiplicityRemoval,
  MAX_RECONCILIATION_OVERLAYS,
  MAX_RECONCILIATION_RECORDS_PER_OVERLAY,
  mergeMultiplicityAction,
  reconcileMultiplicityAction,
  REMOVAL_CONVERGENCE_GRACE_MS,
  resetMultiplicityReconciliationForTest,
  rollbackMultiplicityRemoval,
} from '../reconciliation'
import {MAX_VIEWER_RECORD_URIS} from '../types'

const KEY = 'did:plc:viewer:post:at://post:like'
const URI = 'at://did:plc:viewer/app.bsky.feed.like/one'

beforeEach(resetMultiplicityReconciliationForTest)

describe('multiplicity reconciliation', () => {
  it('keeps AppView as a floor while the live index is incomplete', () => {
    expect(
      mergeMultiplicityAction(
        {count: 0, viewerRecordUris: []},
        {count: 100, viewerRecordUris: [URI]},
      ),
    ).toEqual({count: 100, viewerRecordUris: [URI]})
  })

  it('adds indexed repeated records to AppView\'s actor-collapsed count', () => {
    expect(
      mergeMultiplicityAction(
        {count: 19, extraCount: 17, viewerRecordUris: [URI]},
        {count: 29, viewerRecordUris: [URI]},
      ),
    ).toEqual({count: 46, extraCount: 17, viewerRecordUris: [URI]})
  })

  it('counts a fallback viewer record missing from a partial index', () => {
    const fallbackUri =
      'at://did:plc:viewer/app.bsky.feed.like/appview-canonical'
    expect(
      mergeMultiplicityAction(
        {count: 1, extraCount: 0, viewerRecordUris: [URI]},
        {count: 29, viewerRecordUris: [fallbackUri]},
      ),
    ).toEqual({
      count: 30,
      extraCount: 1,
      viewerRecordUris: [URI, fallbackUri],
    })
  })

  it('preserves repeated-record metadata through optimistic changes', () => {
    const pending = 'pending:like:next'
    const indexed = {
      count: 46,
      extraCount: 17,
      viewerRecordUris: [URI],
    }
    markMultiplicityAddition(KEY, pending)
    const added = addPendingRecord(indexed, pending)
    expect(
      applyMultiplicityOverlay(KEY, added, {
        count: 30,
        viewerRecordUris: [URI],
      }),
    ).toEqual({
      count: 48,
      extraCount: 18,
      viewerRecordUris: [pending, URI],
    })

    expect(removeRecords(added, [pending])).toEqual(indexed)
  })

  it('bounds merged and overlaid viewer record lists', () => {
    const indexedUris = Array.from(
      {length: MAX_VIEWER_RECORD_URIS},
      (_, index) => `at://did:plc:viewer/app.bsky.feed.like/${index}`,
    )
    const fallbackUri = 'at://did:plc:viewer/app.bsky.feed.like/fallback-only'
    const merged = mergeMultiplicityAction(
      {count: indexedUris.length, viewerRecordUris: indexedUris},
      {count: 1, viewerRecordUris: [fallbackUri]},
    )
    expect(merged.viewerRecordUris).toHaveLength(MAX_VIEWER_RECORD_URIS)
    expect(merged.viewerRecordUris).not.toContain(fallbackUri)

    const pending = 'pending:like:bounded-output'
    markMultiplicityAddition(KEY, pending)
    const overlaid = applyMultiplicityOverlay(
      KEY,
      {count: indexedUris.length, viewerRecordUris: indexedUris},
      {count: 0, viewerRecordUris: []},
    )
    expect(overlaid.viewerRecordUris).toHaveLength(MAX_VIEWER_RECORD_URIS)
    expect(overlaid.viewerRecordUris[0]).toBe(pending)
    expect(overlaid.count).toBe(MAX_VIEWER_RECORD_URIS + 1)
  })

  it('preserves a confirmed create until the service acknowledges it', () => {
    const pending = 'pending:like:one'
    markMultiplicityAddition(KEY, pending)
    confirmMultiplicityAddition(KEY, pending, URI)

    expect(
      reconcileMultiplicityAction(
        KEY,
        {count: 2, viewerRecordUris: []},
        {count: 2, viewerRecordUris: []},
      ),
    ).toEqual({count: 3, viewerRecordUris: [URI]})
    expect(
      reconcileMultiplicityAction(
        KEY,
        {count: 3, viewerRecordUris: [URI]},
        {count: 2, viewerRecordUris: []},
      ),
    ).toEqual({count: 3, viewerRecordUris: [URI]})
  })

  it('does not resurrect a delete while the service is stale', () => {
    reconcileMultiplicityAction(
      KEY,
      {count: 2, viewerRecordUris: [URI]},
      {count: 2, viewerRecordUris: [URI]},
    )
    markMultiplicityRemoval(KEY, [URI])
    commitMultiplicityRemoval(KEY, [URI])

    expect(
      reconcileMultiplicityAction(
        KEY,
        {count: 2, viewerRecordUris: [URI]},
        {count: 2, viewerRecordUris: [URI]},
      ),
    ).toEqual({count: 1, viewerRecordUris: []})
    expect(
      reconcileMultiplicityAction(
        KEY,
        {count: 1, viewerRecordUris: []},
        {count: 1, viewerRecordUris: []},
      ),
    ).toEqual({count: 1, viewerRecordUris: []})
  })

  it('does not resurrect a delete while AppView is stale', () => {
    reconcileMultiplicityAction(
      KEY,
      {count: 2, viewerRecordUris: [URI]},
      {count: 2, viewerRecordUris: [URI]},
    )
    markMultiplicityRemoval(KEY, [URI])
    commitMultiplicityRemoval(KEY, [URI])

    expect(
      reconcileMultiplicityAction(
        KEY,
        {count: 1, viewerRecordUris: []},
        {count: 2, viewerRecordUris: [URI]},
      ),
    ).toEqual({count: 1, viewerRecordUris: []})
    expect(
      applyMultiplicityOverlay(
        KEY,
        {count: 1, viewerRecordUris: []},
        {count: 2, viewerRecordUris: [URI]},
      ),
    ).toEqual({count: 1, viewerRecordUris: []})
  })

  it('keeps fallback-only deletes hidden and can roll them back', () => {
    markMultiplicityRemoval(KEY, [URI])
    expect(
      reconcileMultiplicityAction(
        KEY,
        {count: 0, viewerRecordUris: []},
        {count: 1, viewerRecordUris: [URI]},
      ),
    ).toEqual({count: 0, viewerRecordUris: []})

    rollbackMultiplicityRemoval(KEY, [URI])
    expect(
      reconcileMultiplicityAction(
        KEY,
        {count: 0, viewerRecordUris: []},
        {count: 1, viewerRecordUris: [URI]},
      ),
    ).toEqual({count: 1, viewerRecordUris: [URI]})
  })

  it('does not retain read-only subjects', () => {
    for (let index = 0; index < 10_000; index++) {
      reconcileMultiplicityAction(
        `${KEY}:${index}`,
        {count: 0, viewerRecordUris: []},
        {count: 0, viewerRecordUris: []},
      )
    }
    expect(getMultiplicityReconciliationSizeForTest()).toBe(0)
  })

  it('evicts settled and rolled-back overlays', () => {
    const pending = 'pending:like:settled'
    markMultiplicityAddition(KEY, pending)
    confirmMultiplicityAddition(KEY, pending, URI)
    expect(getMultiplicityReconciliationSizeForTest()).toBe(1)
    reconcileMultiplicityAction(
      KEY,
      {count: 1, viewerRecordUris: [URI]},
      {count: 1, viewerRecordUris: [URI]},
    )
    expect(getMultiplicityReconciliationSizeForTest()).toBe(0)

    markMultiplicityRemoval(KEY, [URI])
    rollbackMultiplicityRemoval(KEY, [URI])
    expect(getMultiplicityReconciliationSizeForTest()).toBe(0)
  })

  it('retains an acknowledged delete through the convergence grace period', () => {
    reconcileMultiplicityAction(
      KEY,
      {count: 1, viewerRecordUris: [URI]},
      {count: 1, viewerRecordUris: [URI]},
    )
    markMultiplicityRemoval(KEY, [URI])
    commitMultiplicityRemoval(KEY, [URI], 1_000)

    expect(
      reconcileMultiplicityAction(
        KEY,
        {count: 0, viewerRecordUris: []},
        {count: 0, viewerRecordUris: []},
        1_000 + REMOVAL_CONVERGENCE_GRACE_MS - 1,
      ),
    ).toEqual({count: 0, viewerRecordUris: []})
    expect(getMultiplicityReconciliationSizeForTest()).toBe(1)

    expect(
      reconcileMultiplicityAction(
        KEY,
        {count: 1, viewerRecordUris: [URI]},
        {count: 0, viewerRecordUris: []},
        1_000 + REMOVAL_CONVERGENCE_GRACE_MS - 1,
      ),
    ).toEqual({count: 0, viewerRecordUris: []})

    expect(
      reconcileMultiplicityAction(
        KEY,
        {count: 0, viewerRecordUris: []},
        {count: 0, viewerRecordUris: []},
        1_000 + REMOVAL_CONVERGENCE_GRACE_MS,
      ),
    ).toEqual({count: 0, viewerRecordUris: []})
    expect(getMultiplicityReconciliationSizeForTest()).toBe(0)
  })

  it('does not resurrect a create deleted before either source observes it', () => {
    const pending = 'pending:like:short-lived'
    markMultiplicityAddition(KEY, pending)
    confirmMultiplicityAddition(KEY, pending, URI)
    markMultiplicityRemoval(KEY, [URI])
    commitMultiplicityRemoval(KEY, [URI], 1_000)

    expect(
      reconcileMultiplicityAction(
        KEY,
        {count: 0, viewerRecordUris: []},
        {count: 0, viewerRecordUris: []},
        1_001,
      ),
    ).toEqual({count: 0, viewerRecordUris: []})
    expect(
      reconcileMultiplicityAction(
        KEY,
        {count: 1, viewerRecordUris: [URI]},
        {count: 0, viewerRecordUris: []},
        1_002,
      ),
    ).toEqual({count: 0, viewerRecordUris: []})
    expect(
      reconcileMultiplicityAction(
        KEY,
        {count: 0, viewerRecordUris: []},
        {count: 0, viewerRecordUris: []},
        1_000 + REMOVAL_CONVERGENCE_GRACE_MS,
      ),
    ).toEqual({count: 0, viewerRecordUris: []})
    expect(getMultiplicityReconciliationSizeForTest()).toBe(0)
  })

  it('bounds active reconciliation subjects without evicting existing state', () => {
    for (let index = 0; index < MAX_RECONCILIATION_OVERLAYS; index++) {
      markMultiplicityAddition(`${KEY}:${index}`, `pending:like:${index}`)
    }
    expect(getMultiplicityReconciliationSizeForTest()).toBe(
      MAX_RECONCILIATION_OVERLAYS,
    )
    expect(() =>
      markMultiplicityAddition(`${KEY}:overflow`, 'pending:like:overflow'),
    ).toThrow('Too many pending actions')
    markMultiplicityAddition(`${KEY}:0`, 'pending:like:existing-key')
    expect(getMultiplicityReconciliationSizeForTest()).toBe(
      MAX_RECONCILIATION_OVERLAYS,
    )
  })

  it('bounds records retained by one reconciliation overlay', () => {
    for (
      let index = 0;
      index < MAX_RECONCILIATION_RECORDS_PER_OVERLAY;
      index++
    ) {
      markMultiplicityAddition(KEY, `pending:like:${index}`)
    }
    expect(() =>
      markMultiplicityAddition(KEY, 'pending:like:overflow'),
    ).toThrow('Too many pending actions')
  })

  it('rejects an oversized removal atomically', () => {
    for (
      let index = 0;
      index < MAX_RECONCILIATION_RECORDS_PER_OVERLAY - 1;
      index++
    ) {
      markMultiplicityAddition(KEY, `pending:like:${index}`)
    }
    const secondUri = 'at://did:plc:viewer/app.bsky.feed.like/two'
    expect(() => markMultiplicityRemoval(KEY, [URI, secondUri])).toThrow(
      'Too many pending actions',
    )
    const result = applyMultiplicityOverlay(
      KEY,
      {count: 2, viewerRecordUris: [URI, secondUri]},
      {count: 1, viewerRecordUris: [URI]},
    )
    expect(result.count).toBe(MAX_RECONCILIATION_RECORDS_PER_OVERLAY + 1)
  })
})
