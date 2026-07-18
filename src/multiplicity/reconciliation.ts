import {type MultiplicityActionState} from './types'

type RemovedRecord = {seenInService: boolean}
type Overlay = {
  added: Set<string>
  removed: Map<string, RemovedRecord>
  seenInService: Set<string>
}

const overlays = new Map<string, Overlay>()

function getOverlay(key: string): Overlay {
  let overlay = overlays.get(key)
  if (!overlay) {
    overlay = {
      added: new Set(),
      removed: new Map(),
      seenInService: new Set(),
    }
    overlays.set(key, overlay)
  }
  return overlay
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
  ]
  return {
    count: Math.max(indexed.count, fallback.count, viewerRecordUris.length),
    viewerRecordUris,
  }
}

export function reconcileMultiplicityAction(
  key: string,
  indexed: MultiplicityActionState,
  fallback: MultiplicityActionState,
): MultiplicityActionState {
  const overlay = getOverlay(key)
  const indexedUris = new Set(indexed.viewerRecordUris)
  const fallbackUris = new Set(fallback.viewerRecordUris)
  for (const uri of indexedUris) overlay.seenInService.add(uri)

  for (const [uri, removed] of overlay.removed) {
    if (indexedUris.has(uri)) removed.seenInService = true
    else if (removed.seenInService && !fallbackUris.has(uri)) {
      overlay.removed.delete(uri)
      overlay.seenInService.delete(uri)
    }
  }
  for (const uri of overlay.added) {
    if (indexedUris.has(uri)) overlay.added.delete(uri)
  }

  return applyMultiplicityOverlay(key, indexed, fallback)
}

export function applyMultiplicityOverlay(
  key: string,
  indexed: MultiplicityActionState,
  fallback: MultiplicityActionState,
): MultiplicityActionState {
  const overlay = getOverlay(key)
  const base = mergeMultiplicityAction(indexed, fallback)
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
  return {count: Math.max(count, viewerRecordUris.length), viewerRecordUris}
}

export function markMultiplicityAddition(key: string, uri: string) {
  getOverlay(key).added.add(uri)
}

export function confirmMultiplicityAddition(
  key: string,
  pendingUri: string,
  recordUri: string,
) {
  const overlay = getOverlay(key)
  overlay.added.delete(pendingUri)
  overlay.added.add(recordUri)
}

export function rollbackMultiplicityAddition(key: string, uri: string) {
  getOverlay(key).added.delete(uri)
}

export function markMultiplicityRemoval(key: string, uris: readonly string[]) {
  const overlay = getOverlay(key)
  for (const uri of uris) {
    overlay.removed.set(uri, {
      seenInService: overlay.seenInService.has(uri),
    })
  }
}

export function commitMultiplicityRemoval(
  key: string,
  uris: readonly string[],
) {
  const overlay = getOverlay(key)
  for (const uri of uris) overlay.added.delete(uri)
}

export function rollbackMultiplicityRemoval(
  key: string,
  uris: readonly string[],
) {
  const overlay = getOverlay(key)
  for (const uri of uris) overlay.removed.delete(uri)
}

export function resetMultiplicityReconciliationForTest() {
  overlays.clear()
}
