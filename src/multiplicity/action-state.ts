import {MAX_VIEWER_RECORD_URIS, type MultiplicityActionState} from './types'

export function assertCanAddMultiplicityRecord(state: MultiplicityActionState) {
  if (state.viewerRecordUris.length >= MAX_VIEWER_RECORD_URIS) {
    throw new Error('Too many pending actions. Please wait and try again.')
  }
}

export function addPendingRecord(
  state: MultiplicityActionState,
  pendingUri: string,
): MultiplicityActionState {
  assertCanAddMultiplicityRecord(state)
  return {
    count: state.count + 1,
    viewerRecordUris: [pendingUri, ...state.viewerRecordUris],
  }
}

export function confirmPendingRecord(
  state: MultiplicityActionState,
  pendingUri: string,
  recordUri: string,
): MultiplicityActionState {
  if (!state.viewerRecordUris.includes(pendingUri)) {
    return restoreRecords(state, [recordUri])
  }
  return {
    ...state,
    viewerRecordUris: state.viewerRecordUris.map(uri =>
      uri === pendingUri ? recordUri : uri,
    ),
  }
}

export function removeRecords(
  state: MultiplicityActionState,
  recordUris: readonly string[],
): MultiplicityActionState {
  const removed = new Set(recordUris)
  const viewerRecordUris = state.viewerRecordUris.filter(
    uri => !removed.has(uri),
  )
  const removedCount = state.viewerRecordUris.length - viewerRecordUris.length
  return {
    count: Math.max(0, state.count - removedCount),
    viewerRecordUris,
  }
}

export function restoreRecords(
  state: MultiplicityActionState,
  recordUris: readonly string[],
): MultiplicityActionState {
  const existing = new Set(state.viewerRecordUris)
  const restored = recordUris.filter(uri => !existing.has(uri))
  return {
    count: state.count + restored.length,
    viewerRecordUris: [...restored, ...state.viewerRecordUris].slice(
      0,
      MAX_VIEWER_RECORD_URIS,
    ),
  }
}
