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
const MAX_CONCURRENT_CHUNKS = 2

export function createBatchedMultiplicityAdapter(
  adapter: MultiplicityAdapter,
  schedule: (callback: () => void) => void = queueMicrotask,
): MultiplicityAdapter {
  let pending: PendingRequest[] = []
  let scheduled = false
  let activeChunks = 0
  const chunkWaiters: Array<() => void> = []

  async function acquireChunkSlot(): Promise<void> {
    if (activeChunks < MAX_CONCURRENT_CHUNKS) {
      activeChunks += 1
      return
    }
    await new Promise<void>(resolve => chunkWaiters.push(resolve))
  }

  function releaseChunkSlot(): void {
    const next = chunkWaiters.shift()
    if (next) next()
    else activeChunks -= 1
  }

  async function runChunk(
    request: MultiplicityBatchRequest,
  ): Promise<MultiplicityBatchResponse> {
    await acquireChunkSlot()
    try {
      return await adapter.getBatch(request)
    } finally {
      releaseChunkSlot()
    }
  }

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
          const chunks: MultiplicityBatchResponse[] = []
          for (
            let start = 0;
            start < chunkCount;
            start += MAX_CONCURRENT_CHUNKS
          ) {
            const batch = await Promise.all(
              Array.from(
                {
                  length: Math.min(MAX_CONCURRENT_CHUNKS, chunkCount - start),
                },
                (_, offset) => {
                  const index = start + offset
                  return runChunk({
                    viewerDid,
                    postUris: postUris.slice(
                      index * MAX_SUBJECTS_PER_REQUEST,
                      (index + 1) * MAX_SUBJECTS_PER_REQUEST,
                    ),
                    actorDids: actorDids.slice(
                      index * MAX_SUBJECTS_PER_REQUEST,
                      (index + 1) * MAX_SUBJECTS_PER_REQUEST,
                    ),
                  })
                },
              ),
            )
            chunks.push(...batch)
          }
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
