const MAX_PETALS = 5

export function getMultiplicityPetalCount(count: number): number {
  if (!Number.isFinite(count) || count < 2) return 0
  return Math.min(MAX_PETALS, Math.floor(count))
}
