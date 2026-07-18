import {
  enqueueSubjectMutation,
  MAX_CONCURRENT_BATCH_MUTATIONS,
  MAX_PENDING_MUTATIONS_PER_SUBJECT,
  settleMutationBatch,
} from '../subject-queue'

describe('enqueueSubjectMutation', () => {
  it('preserves every task for one subject in order', async () => {
    const events: string[] = []
    let releaseFirst = () => {}
    const first = enqueueSubjectMutation('post:one', async () => {
      events.push('first:start')
      await new Promise<void>(resolve => {
        releaseFirst = resolve
      })
      events.push('first:end')
      return 1
    })
    const second = enqueueSubjectMutation('post:one', () => {
      events.push('second')
      return Promise.resolve(2)
    })

    await Promise.resolve()
    expect(events).toEqual(['first:start'])
    releaseFirst()
    await expect(Promise.all([first, second])).resolves.toEqual([1, 2])
    expect(events).toEqual(['first:start', 'first:end', 'second'])
  })

  it('does not block unrelated subjects', async () => {
    let release = () => {}
    const blocked = enqueueSubjectMutation(
      'post:blocked',
      () =>
        new Promise<void>(resolve => {
          release = resolve
        }),
    )
    const independent = enqueueSubjectMutation('post:other', () =>
      Promise.resolve('complete'),
    )

    await expect(independent).resolves.toBe('complete')
    release()
    await blocked
  })

  it('continues after a failed task', async () => {
    const failure = enqueueSubjectMutation('post:failure', () =>
      Promise.reject(new Error('failed')),
    )
    const recovery = enqueueSubjectMutation('post:failure', () =>
      Promise.resolve('recovered'),
    )

    await expect(failure).rejects.toThrow('failed')
    await expect(recovery).resolves.toBe('recovered')
  })

  it('bounds a subject queue while its first task is blocked', async () => {
    let release = () => {}
    const queued = [
      enqueueSubjectMutation(
        'post:bounded',
        () =>
          new Promise<void>(resolve => {
            release = resolve
          }),
      ),
    ]
    for (let index = 1; index < MAX_PENDING_MUTATIONS_PER_SUBJECT; index++) {
      queued.push(
        enqueueSubjectMutation('post:bounded', () => Promise.resolve()),
      )
    }

    await expect(
      enqueueSubjectMutation('post:bounded', () => Promise.resolve()),
    ).rejects.toThrow('Too many pending actions')
    await Promise.resolve()
    release()
    await Promise.all(queued)
    await expect(
      enqueueSubjectMutation('post:bounded', () => Promise.resolve('ready')),
    ).resolves.toBe('ready')
  })

  it('releases capacity before an awaiting caller continues', async () => {
    let release = () => {}
    const first = enqueueSubjectMutation(
      'post:boundary',
      () =>
        new Promise<void>(resolve => {
          release = resolve
        }),
    )
    const queued = Array.from(
      {length: MAX_PENDING_MUTATIONS_PER_SUBJECT - 1},
      () => enqueueSubjectMutation('post:boundary', () => Promise.resolve()),
    )
    await Promise.resolve()
    release()
    await first
    const replacement = enqueueSubjectMutation('post:boundary', () =>
      Promise.resolve('replacement'),
    )
    await Promise.all(queued)
    await expect(replacement).resolves.toBe('replacement')
  })

  it('bounds concurrent work inside one batch mutation', async () => {
    let active = 0
    let maximum = 0
    const results = await settleMutationBatch(
      Array.from({length: 32}, (_, index) => index),
      async index => {
        active += 1
        maximum = Math.max(maximum, active)
        await Promise.resolve()
        active -= 1
        if (index === 17) throw new Error('expected failure')
        return index
      },
    )
    expect(maximum).toBe(MAX_CONCURRENT_BATCH_MUTATIONS)
    expect(results[17]).toMatchObject({status: 'rejected'})
    expect(
      results.filter(result => result.status === 'fulfilled'),
    ).toHaveLength(31)
  })
})
