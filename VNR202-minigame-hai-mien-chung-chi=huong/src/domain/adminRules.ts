import type { GameStatus } from './gameRules'

export type TeamKey = 'north' | 'south'

export type AdminActionInput = {
  isAdmin: boolean
  sessionStatus: GameStatus
}

export type NorthKeyEligibilityInput = {
  northSupportPoints: number
  threshold: number
  sessionActive: boolean
  keyAlreadyClaimed: boolean
}

export type SouthKeyEligibilityInput = {
  southProgress: number
  threshold: number
  sessionActive: boolean
  keyAlreadyClaimed: boolean
}

export type GameCompletionInput = {
  isAdmin: boolean
  sessionStatus: GameStatus
  northKeyEligible: boolean
  southKeyEligible: boolean
  northKeyClaimed: boolean
  southKeyClaimed: boolean
}

export function canPerformAdminAction(input: AdminActionInput): boolean
export function canPerformAdminAction(
  isAdmin: boolean,
  sessionStatus: GameStatus,
): boolean
export function canPerformAdminAction(
  inputOrIsAdmin: AdminActionInput | boolean,
  sessionStatus?: GameStatus,
): boolean {
  const input =
    typeof inputOrIsAdmin === 'boolean'
      ? {
          isAdmin: inputOrIsAdmin,
          sessionStatus: sessionStatus ?? 'LOBBY',
        }
      : inputOrIsAdmin

  return (
    input.isAdmin &&
    input.sessionStatus !== 'CANCELLED' &&
    input.sessionStatus !== 'COMPLETED'
  )
}

export const isNorthKeyEligible = ({
  northSupportPoints,
  threshold,
  sessionActive,
  keyAlreadyClaimed,
}: NorthKeyEligibilityInput): boolean =>
  sessionActive && !keyAlreadyClaimed && northSupportPoints >= threshold

export const isSouthKeyEligible = ({
  southProgress,
  threshold,
  sessionActive,
  keyAlreadyClaimed,
}: SouthKeyEligibilityInput): boolean =>
  sessionActive && !keyAlreadyClaimed && southProgress >= threshold

export const canCompleteGame = ({
  isAdmin,
  sessionStatus,
  northKeyEligible,
  southKeyEligible,
  northKeyClaimed,
  southKeyClaimed,
}: GameCompletionInput): boolean =>
  isAdmin &&
  sessionStatus === 'ACTIVE' &&
  northKeyEligible &&
  southKeyEligible &&
  northKeyClaimed &&
  southKeyClaimed

export const shouldIgnoreDuplicateKeySubmission = (
  keyId: string,
  seenKeyIds: Iterable<string>,
): boolean => {
  for (const seenKeyId of seenKeyIds) {
    if (seenKeyId === keyId) {
      return true
    }
  }

  return false
}
