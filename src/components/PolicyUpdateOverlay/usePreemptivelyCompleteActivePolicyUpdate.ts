import {useCallback} from 'react'

import {ACTIVE_UPDATE_ID} from '#/components/PolicyUpdateOverlay/config'
import {logger} from '#/components/PolicyUpdateOverlay/logger'
import {device, useStorage} from '#/storage'

/*
 * Marks the active policy update as completed in device storage.
 * Meadow keeps this fork-specific acknowledgment on the device rather than
 * transmitting it to the account's AppView.
 */
export function usePreemptivelyCompleteActivePolicyUpdate() {
  const [_completedForDevice, setCompletedForDevice] = useStorage(device, [
    ACTIVE_UPDATE_ID,
  ])

  return useCallback(() => {
    logger.debug(`preemptively completing active policy update`)
    setCompletedForDevice(true)
  }, [setCompletedForDevice])
}
