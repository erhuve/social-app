const tails = new Map<string, Promise<void>>()
const pendingBySubject = new Map<string, number>()
let pendingTotal = 0

export const MAX_PENDING_MUTATIONS_PER_SUBJECT = 64
const MAX_PENDING_MUTATIONS_TOTAL = 1_000
export const MAX_CONCURRENT_BATCH_MUTATIONS = 8

export function assertSubjectMutationCapacity(subject: string) {
  if (
    (pendingBySubject.get(subject) ?? 0) >= MAX_PENDING_MUTATIONS_PER_SUBJECT ||
    pendingTotal >= MAX_PENDING_MUTATIONS_TOTAL
  ) {
    throw new Error('Too many pending actions. Please wait and try again.')
  }
}

export function enqueueSubjectMutation<T>(
  subject: string,
  mutation: () => Promise<T>,
): Promise<T> {
  try {
    assertSubjectMutationCapacity(subject)
  } catch (error) {
    return Promise.reject(
      error instanceof Error ? error : new Error('Unable to queue action'),
    )
  }
  pendingBySubject.set(subject, (pendingBySubject.get(subject) ?? 0) + 1)
  pendingTotal += 1
  const previous = tails.get(subject) ?? Promise.resolve()
  const result = previous.then(mutation, mutation)
  const releaseCapacity = () => {
    const pending = (pendingBySubject.get(subject) ?? 1) - 1
    if (pending === 0) pendingBySubject.delete(subject)
    else pendingBySubject.set(subject, pending)
    pendingTotal -= 1
  }
  const settled = result.then(
    () => releaseCapacity(),
    () => releaseCapacity(),
  )
  tails.set(subject, settled)
  void settled.then(() => {
    if (tails.get(subject) === settled) tails.delete(subject)
  })
  return result
}

export async function settleMutationBatch<T>(
  items: readonly T[],
  mutation: (item: T) => Promise<unknown>,
): Promise<PromiseSettledResult<unknown>[]> {
  const results = new Array<PromiseSettledResult<unknown>>(items.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++
      try {
        results[index] = {
          status: 'fulfilled',
          value: await mutation(items[index]),
        }
      } catch (reason) {
        results[index] = {status: 'rejected', reason}
      }
    }
  }
  await Promise.all(
    Array.from(
      {length: Math.min(items.length, MAX_CONCURRENT_BATCH_MUTATIONS)},
      () => worker(),
    ),
  )
  return results
}
