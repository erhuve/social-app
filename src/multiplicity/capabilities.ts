import {type MultiplicityCapabilities} from './types.ts'

let capabilities: MultiplicityCapabilities | undefined
let capabilitiesRequired = false
let capabilitiesObservedAt = 0
let capabilitiesObservedMonotonicAt = 0

export const MAX_MULTIPLICITY_CAPABILITY_AGE_MS = 60_000

export function requireMultiplicityCapabilities(): void {
  capabilitiesRequired = true
}

export function setMultiplicityCapabilities(
  next: MultiplicityCapabilities | undefined,
): void {
  if (!next) return
  if (capabilities && next.generation < capabilities.generation) return
  capabilitiesObservedAt = Date.now()
  capabilitiesObservedMonotonicAt = performance.now()
  if (capabilities && next.generation === capabilities.generation) {
    capabilities = {
      generation: next.generation,
      writesEnabled: capabilities.writesEnabled && next.writesEnabled,
      feedEnabled: capabilities.feedEnabled && next.feedEnabled,
    }
    return
  }
  capabilities = next
}

export function assertMultiplicityWritesEnabled(): void {
  const wallElapsed = Date.now() - capabilitiesObservedAt
  const monotonicElapsed = performance.now() - capabilitiesObservedMonotonicAt
  if (
    capabilitiesRequired &&
    (capabilities?.writesEnabled !== true ||
      wallElapsed < 0 ||
      monotonicElapsed < 0 ||
      wallElapsed > MAX_MULTIPLICITY_CAPABILITY_AGE_MS ||
      monotonicElapsed > MAX_MULTIPLICITY_CAPABILITY_AGE_MS)
  ) {
    throw new Error('New Meadow actions are temporarily paused')
  }
}

export function resetMultiplicityCapabilitiesForTest(): void {
  capabilities = undefined
  capabilitiesRequired = false
  capabilitiesObservedAt = 0
  capabilitiesObservedMonotonicAt = 0
}
