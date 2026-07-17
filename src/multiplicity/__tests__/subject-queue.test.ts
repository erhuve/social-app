import {enqueueSubjectMutation} from '../subject-queue'

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
})
