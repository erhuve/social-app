import {useMemo} from 'react'

import {type useSaveNux} from '#/state/queries/nuxs'
import {ACTIVE_UPDATE_ID} from '#/components/PolicyUpdateOverlay/config'
import {logger} from '#/components/PolicyUpdateOverlay/logger'
import {IS_DEV} from '#/env'
import {device, useStorage} from '#/storage'

export type PolicyUpdateState = {
  completed: boolean
  complete: () => void
}

export function usePolicyUpdateState({
  enabled,
}: {
  /**
   * Used to skip the policy update overlay until we're actually ready to
   * show it.
   */
  enabled: boolean
}) {
  const deviceStorage = useStorage(device, [ACTIVE_UPDATE_ID])
  const debugOverride =
    !!useStorage(device, ['policyUpdateDebugOverride'])[0] && IS_DEV

  return useMemo(() => {
    /**
     * If not enabled, then just return a completed state so the app functions
     * as normal.
     */
    if (!enabled) {
      return {
        completed: true,
        complete() {},
      }
    }

    const [completedForDevice, setCompletedForDevice] = deviceStorage
    const completed = debugOverride ? false : completedForDevice === true

    logger.debug(`state`, {
      completed,
      completedForDevice,
    })

    return {
      completed,
      complete() {
        logger.debug(`user completed`)
        setCompletedForDevice(true)
      },
    }
  }, [enabled, deviceStorage, debugOverride])
}

export function computeCompletedState({
  nuxIsReady,
  nuxIsCompleted,
  nuxIsOptimisticallyCompleted,
  completedForDevice,
}: {
  nuxIsReady: boolean
  nuxIsCompleted: boolean
  nuxIsOptimisticallyCompleted: boolean
  completedForDevice: boolean | undefined
}): boolean {
  /**
   * Assume completed to prevent flash
   */
  let completed = true

  /**
   * Prefer server state, if available
   */
  if (nuxIsReady) {
    completed = nuxIsCompleted
  }

  /**
   * Override with optimistic state or device state
   */
  if (nuxIsOptimisticallyCompleted || !!completedForDevice) {
    completed = true
  }

  return completed
}

export function syncCompletedState({
  nuxIsReady,
  nuxIsCompleted,
  nuxIsOptimisticallyCompleted,
  completedForDevice,
  save,
  setCompletedForDevice,
}: {
  nuxIsReady: boolean
  nuxIsCompleted: boolean
  nuxIsOptimisticallyCompleted: boolean
  completedForDevice: boolean | undefined
  save: ReturnType<typeof useSaveNux>['mutate']
  setCompletedForDevice: (value: boolean) => void
}) {
  /*
   * Sync device state to server state for this account
   */
  if (
    nuxIsReady &&
    !nuxIsCompleted &&
    !nuxIsOptimisticallyCompleted &&
    !!completedForDevice
  ) {
    logger.debug(`syncing device state to server state`)
    save({
      id: ACTIVE_UPDATE_ID,
      completed: true,
      data: undefined,
    })
  } else if (nuxIsReady && nuxIsCompleted && !completedForDevice) {
    logger.debug(`syncing server state to device state`)
    /*
     * Sync server state to device state
     */
    setCompletedForDevice(true)
  }
}
