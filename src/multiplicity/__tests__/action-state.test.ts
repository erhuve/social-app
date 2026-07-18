import {
  addPendingRecord,
  confirmPendingRecord,
  removeRecords,
  restoreRecords,
} from '../action-state'
import {MAX_VIEWER_RECORD_URIS} from '../types'

describe('multiplicity action state', () => {
  const initial = {
    count: 4,
    viewerRecordUris: ['at://viewer/like/new', 'at://viewer/like/old'],
  }

  it('optimistically adds and then confirms a newest record', () => {
    const pending = addPendingRecord(initial, 'pending:1')
    expect(pending).toEqual({
      count: 5,
      viewerRecordUris: [
        'pending:1',
        'at://viewer/like/new',
        'at://viewer/like/old',
      ],
    })
    expect(
      confirmPendingRecord(pending, 'pending:1', 'at://viewer/like/newest'),
    ).toEqual({
      count: 5,
      viewerRecordUris: [
        'at://viewer/like/newest',
        'at://viewer/like/new',
        'at://viewer/like/old',
      ],
    })
  })

  it('rejects an optimistic record above the owned-record limit', () => {
    expect(() =>
      addPendingRecord(
        {
          count: MAX_VIEWER_RECORD_URIS,
          viewerRecordUris: Array.from(
            {length: MAX_VIEWER_RECORD_URIS},
            (_, index) => `at://viewer/like/${index}`,
          ),
        },
        'pending:overflow',
      ),
    ).toThrow('Too many pending actions')
  })

  it('rolls back one pending record without disturbing other records', () => {
    const pending = addPendingRecord(initial, 'pending:1')
    expect(removeRecords(pending, ['pending:1'])).toEqual(initial)
  })

  it('preserves a confirmed record if a refetch replaced its pending entry', () => {
    expect(
      confirmPendingRecord(
        initial,
        'pending:missing',
        'at://viewer/like/newest',
      ),
    ).toEqual({
      count: 5,
      viewerRecordUris: [
        'at://viewer/like/newest',
        'at://viewer/like/new',
        'at://viewer/like/old',
      ],
    })
  })

  it('removes exact records and never makes the aggregate negative', () => {
    expect(removeRecords(initial, ['at://viewer/like/new'])).toEqual({
      count: 3,
      viewerRecordUris: ['at://viewer/like/old'],
    })
    expect(
      removeRecords(
        {count: 1, viewerRecordUris: initial.viewerRecordUris},
        initial.viewerRecordUris,
      ),
    ).toEqual({count: 0, viewerRecordUris: []})
  })

  it('restores only records that are still absent', () => {
    expect(
      restoreRecords({count: 3, viewerRecordUris: ['at://viewer/like/old']}, [
        'at://viewer/like/new',
        'at://viewer/like/old',
      ]),
    ).toEqual({
      count: 4,
      viewerRecordUris: ['at://viewer/like/new', 'at://viewer/like/old'],
    })
  })

  it('bounds rollback restoration while prioritizing restored records', () => {
    const viewerRecordUris = Array.from(
      {length: MAX_VIEWER_RECORD_URIS},
      (_, index) => `at://viewer/like/${index}`,
    )
    const restored = 'at://viewer/like/restored'
    const result = restoreRecords(
      {count: MAX_VIEWER_RECORD_URIS, viewerRecordUris},
      [restored],
    )
    expect(result.count).toBe(MAX_VIEWER_RECORD_URIS + 1)
    expect(result.viewerRecordUris).toHaveLength(MAX_VIEWER_RECORD_URIS)
    expect(result.viewerRecordUris[0]).toBe(restored)
  })
})
