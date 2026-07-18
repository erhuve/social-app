import {
  addPendingRecord,
  confirmPendingRecord,
  removeRecords,
  restoreRecords,
} from '../action-state'

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
})
