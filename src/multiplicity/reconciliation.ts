import {MAX_VIEWER_RECORD_URIS, type MultiplicityActionState} from './types'

type RemovedRecord = {
  committed: boolean
  committedAt: number | undefined
  seenInSource: boolean
}
type Overlay = {
  added: Set<string>
  removed: Map<string, RemovedRecord>
}

const overlays = new Map<string, Overlay>()
export const MAX_RECONCILIATION_OVERLAYS = 10_000
export const MAX_RECONCILIATION_RECORDS_PER_OVERLAY = MAX_VIEWER_RECORD_URIS
export const REMOVAL_CONVERGENCE_GRACE_MS = 5 * 60 * 1_000

export function assertMultiplicityReconciliationCapacity(key: string) {
  if (!overlays.has(key) && overlays.size >= MAX_RECONCILIATION_OVERLAYS) {
    throw new Error('Too many pending actions. Please wait and try again.')
  }
}

function ensureOverlay(key: string): Overlay {
  let overlay = overlays.get(key)
  if (!overlay) {
    assertMultiplicityReconciliationCapacity(key)
    overlay = {
      added: new Set(),
      removed: new Map(),
    }
    overlays.set(key, overlay)
  }
  return overlay
}

function assertOverlayRecordCapacity(overlay: Overlay, uri: string) {
  if (
    !overlay.added.has(uri) &&
    !overlay.removed.has(uri) &&
    overlay.added.size + overlay.removed.size >=
      MAX_RECONCILIATION_RECORDS_PER_OVERLAY
  ) {
    throw new Error('Too many pending actions. Please wait and try again.')
  }
}

function assertOverlayRecordsCapacity(
  overlay: Overlay,
  uris: readonly string[],
) {
  const records = new Set([...overlay.added, ...overlay.removed.keys()])
  for (const uri of uris) records.add(uri)
  if (records.size > MAX_RECONCILIATION_RECORDS_PER_OVERLAY) {
    throw new Error('Too many pending actions. Please wait and try again.')
  }
}

function pruneOverlay(key: string, overlay: Overlay) {
  if (overlay.added.size === 0 && overlay.removed.size === 0) {
    overlays.delete(key)
  }
}

export function multiplicityReconciliationKey(
  viewerDid: string,
  subjectType: 'post' | 'actor',
  subject: string,
  action: 'like' | 'repost' | 'follow',
) {
  return `${viewerDid}:${subjectType}:${subject}:${action}`
}

export function mergeMultiplicityAction(
  indexed: MultiplicityActionState,
  fallback: MultiplicityActionState,
): MultiplicityActionState {
  const viewerRecordUris = [
    ...indexed.viewerRecordUris,
    ...fallback.viewerRecordUris.filter(
      uri => !indexed.viewerRecordUris.includes(uri),
    ),
  ].slice(0, MAX_VIEWER_RECORD_URIS)
  return {
    count: Math.max(indexed.count, fallback.count, viewerRecordUris.length),
    viewerRecordUris,
  }
}

export function reconcileMultiplicityAction(
  key: string,
  indexed: MultiplicityActionState,
  fallback: MultiplicityActionState,
  now = Date.now(),
): MultiplicityActionState {
  const overlay = overlays.get(key)
  if (!overlay) return mergeMultiplicityAction(indexed, fallback)
  const indexedUris = new Set(indexed.viewerRecordUris)
  const fallbackUris = new Set(fallback.viewerRecordUris)
  for (const [uri, removed] of overlay.removed) {
    if (indexedUris.has(uri) || fallbackUris.has(uri)) {
      removed.seenInSource = true
    } else if (
      removed.committed &&
      removed.committedAt !== undefined &&
      removed.seenInSource &&
      now - removed.committedAt >= REMOVAL_CONVERGENCE_GRACE_MS
    ) {
      overlay.removed.delete(uri)
    }
  }
  for (const uri of overlay.added) {
    if (indexedUris.has(uri)) overlay.added.delete(uri)
  }

  const result = applyMultiplicityOverlay(key, indexed, fallback)
  pruneOverlay(key, overlay)
  return result
}

export function applyMultiplicityOverlay(
  key: string,
  indexed: MultiplicityActionState,
  fallback: MultiplicityActionState,
): MultiplicityActionState {
  const base = mergeMultiplicityAction(indexed, fallback)
  const overlay = overlays.get(key)
  if (!overlay) return base
  const viewerRecordUris = base.viewerRecordUris.filter(
    uri => !overlay.removed.has(uri),
  )
  const removedFromBase = base.viewerRecordUris.length - viewerRecordUris.length
  let count = Math.max(0, base.count - removedFromBase)
  for (const uri of overlay.added) {
    if (!overlay.removed.has(uri) && !viewerRecordUris.includes(uri)) {
      viewerRecordUris.unshift(uri)
      count += 1
    }
  }
  return {
    count: Math.max(count, viewerRecordUris.length),
    viewerRecordUris: viewerRecordUris.slice(0, MAX_VIEWER_RECORD_URIS),
  }
}

export function markMultiplicityAddition(key: string, uri: string) {
  const overlay = ensureOverlay(key)
  assertOverlayRecordCapacity(overlay, uri)
  overlay.added.add(uri)
}

export function confirmMultiplicityAddition(
  key: string,
  pendingUri: string,
  recordUri: string,
) {
  const overlay = ensureOverlay(key)
  const records = new Set([...overlay.added, ...overlay.removed.keys()])
  records.delete(pendingUri)
  records.add(recordUri)
  if (records.size > MAX_RECONCILIATION_RECORDS_PER_OVERLAY) {
    throw new Error('Too many pending actions. Please wait and try again.')
  }
  overlay.added.delete(pendingUri)
  overlay.added.add(recordUri)
}

export function rollbackMultiplicityAddition(key: string, uri: string) {
  const overlay = overlays.get(key)
  if (!overlay) return
  overlay.added.delete(uri)
  pruneOverlay(key, overlay)
}

export function markMultiplicityRemoval(key: string, uris: readonly string[]) {
  const overlay = ensureOverlay(key)
  assertOverlayRecordsCapacity(overlay, uris)
  for (const uri of uris) {
    overlay.removed.set(uri, {
      committed: false,
      committedAt: undefined,
      seenInSource: !overlay.added.has(uri),
    })
  }
}

export function commitMultiplicityRemoval(
  key: string,
  uris: readonly string[],
  now = Date.now(),
) {
  const overlay = overlays.get(key)
  if (!overlay) return
  for (const uri of uris) {
    overlay.added.delete(uri)
    const removed = overlay.removed.get(uri)
    if (removed) {
      removed.committed = true
      removed.committedAt = now
    }
  }
}

export function rollbackMultiplicityRemoval(
  key: string,
  uris: readonly string[],
) {
  const overlay = overlays.get(key)
  if (!overlay) return
  for (const uri of uris) overlay.removed.delete(uri)
  pruneOverlay(key, overlay)
}

export function resetMultiplicityReconciliationForTest() {
  overlays.clear()
}

export function getMultiplicityReconciliationSizeForTest() {
  return overlays.size
}
