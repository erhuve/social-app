import {useCallback} from 'react'

import {FEEDBACK_FORM_URL} from '#/lib/constants'

export enum SupportCode {
  AA_DID = 'AA_DID',
  AA_BIRTHDATE = 'AA_BIRTHDATE',
}

export function useCreateSupportLink() {
  return useCallback(
    (_params: {code: SupportCode; email?: string}) => FEEDBACK_FORM_URL({}),
    [],
  )
}
