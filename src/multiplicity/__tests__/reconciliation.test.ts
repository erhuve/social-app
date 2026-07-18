import {
  applyMultiplicityOverlay,
  commitMultiplicityRemoval,
  confirmMultiplicityAddition,
  markMultiplicityAddition,
  markMultiplicityRemoval,
  mergeMultiplicityAction,
  reconcileMultiplicityAction,
  resetMultiplicityReconciliationForTest,
  rollbackMultiplicityRemoval,
} from '../reconciliation'

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
})
