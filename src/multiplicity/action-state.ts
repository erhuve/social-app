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
  const extraCount =
    (state.extraCount ?? Math.max(0, state.viewerRecordUris.length - 1)) +
    (state.viewerRecordUris.length > 0 ? 1 : 0)
  return {
    count: state.count + 1,
    ...(extraCount > 0 ? {extraCount} : {}),
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
  const removedExtras = Math.min(
    removedCount,
    Math.max(0, state.viewerRecordUris.length - 1),
  )
  const extraCount = Math.max(
    0,
    (state.extraCount ?? Math.max(0, state.viewerRecordUris.length - 1)) -
      removedExtras,
  )
  return {
    count: Math.max(0, state.count - removedCount),
    ...(extraCount > 0 ? {extraCount} : {}),
    viewerRecordUris,
  }
}

export function restoreRecords(
  state: MultiplicityActionState,
  recordUris: readonly string[],
): MultiplicityActionState {
  const existing = new Set(state.viewerRecordUris)
  const restored = recordUris.filter(uri => !existing.has(uri))
  const previousViewerExtras = Math.max(0, state.viewerRecordUris.length - 1)
  const restoredViewerExtras = Math.max(
    0,
    state.viewerRecordUris.length + restored.length - 1,
  )
  const extraCount =
    (state.extraCount ?? previousViewerExtras) +
    restoredViewerExtras -
    previousViewerExtras
  return {
    count: state.count + restored.length,
    ...(extraCount > 0 ? {extraCount} : {}),
    viewerRecordUris: [...restored, ...state.viewerRecordUris].slice(
      0,
      MAX_VIEWER_RECORD_URIS,
    ),
  }
}
