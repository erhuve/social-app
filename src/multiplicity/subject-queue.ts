const tails = new Map<string, Promise<void>>()

export function enqueueSubjectMutation<T>(
  subject: string,
  mutation: () => Promise<T>,
): Promise<T> {
  const previous = tails.get(subject) ?? Promise.resolve()
  const result = previous.then(mutation, mutation)
  const settled = result.then(
    () => undefined,
    () => undefined,
  )
  tails.set(subject, settled)
  void settled.then(() => {
    if (tails.get(subject) === settled) tails.delete(subject)
  })
  return result
}
