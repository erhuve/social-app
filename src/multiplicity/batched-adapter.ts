import {
  type MultiplicityAdapter,
  type MultiplicityBatchRequest,
  type MultiplicityBatchResponse,
} from './types'
import {validateBatchResponse} from './validation'

type PendingRequest = {
  request: MultiplicityBatchRequest
  resolve: (response: MultiplicityBatchResponse) => void
  reject: (error: unknown) => void
}

const MAX_SUBJECTS_PER_REQUEST = 100

export function createBatchedMultiplicityAdapter(
  adapter: MultiplicityAdapter,
  schedule: (callback: () => void) => void = queueMicrotask,
): MultiplicityAdapter {
  let pending: PendingRequest[] = []
  let scheduled = false

  async function flush() {
    const requests = pending
    pending = []
    scheduled = false
    const byViewer = new Map<string, PendingRequest[]>()
    for (const item of requests) {
      const group = byViewer.get(item.request.viewerDid)
      if (group) group.push(item)
      else byViewer.set(item.request.viewerDid, [item])
    }

    await Promise.all(
      [...byViewer.entries()].map(async ([viewerDid, group]) => {
        const postUris = [
          ...new Set(group.flatMap(item => item.request.postUris)),
        ]
        const actorDids = [
          ...new Set(group.flatMap(item => item.request.actorDids)),
        ]
        try {
          const chunkCount = Math.max(
            1,
            Math.ceil(postUris.length / MAX_SUBJECTS_PER_REQUEST),
            Math.ceil(actorDids.length / MAX_SUBJECTS_PER_REQUEST),
          )
          const chunks = await Promise.all(
            Array.from({length: chunkCount}, (_, index) =>
              adapter.getBatch({
                viewerDid,
                postUris: postUris.slice(
                  index * MAX_SUBJECTS_PER_REQUEST,
                  (index + 1) * MAX_SUBJECTS_PER_REQUEST,
                ),
                actorDids: actorDids.slice(
                  index * MAX_SUBJECTS_PER_REQUEST,
                  (index + 1) * MAX_SUBJECTS_PER_REQUEST,
                ),
              }),
            ),
          )
          const response: MultiplicityBatchResponse = {
            posts: Object.assign({}, ...chunks.map(chunk => chunk.posts)),
            actors: Object.assign({}, ...chunks.map(chunk => chunk.actors)),
          }
          for (const item of group) {
            item.resolve(validateBatchResponse(response, item.request))
          }
        } catch (error) {
          for (const item of group) item.reject(error)
        }
      }),
    )
  }

  return {
    getBatch(request) {
      const promise = new Promise<MultiplicityBatchResponse>(
        (resolve, reject) => {
          pending.push({request, resolve, reject})
        },
      )
      if (!scheduled) {
        scheduled = true
        schedule(() => void flush())
      }
      return promise
    },
  }
}
