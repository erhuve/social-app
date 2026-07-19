import {type MultiplicityActionState} from './types'

export function createFallbackAction(
  count: number | undefined,
  viewerRecordUri: string | undefined,
): MultiplicityActionState {
  return {
    count: Math.max(0, count ?? 0, viewerRecordUri ? 1 : 0),
    extraCount: 0,
    viewerRecordUris: viewerRecordUri ? [viewerRecordUri] : [],
  }
}
