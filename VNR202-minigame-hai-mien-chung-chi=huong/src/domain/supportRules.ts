export type SupportRewardConfig = {
  supportRewardMax: number
  supportRewardMin: number
  rewardWindowMs: number
}

export type SupportState = {
  southTeamPoints: number
  northSupportPoints: number
  seenSupportAttemptIds: string[]
  attemptId: string
  isCorrect: boolean
  elapsedMs: number
  config: SupportRewardConfig
}

export type SupportResult = {
  allowed: boolean
  southTeamPoints: number
  northSupportPoints: number
  rewarded: number
}

export const calculateSupportMeter = ({
  isCorrect,
  elapsedMs,
  config,
}: {
  isCorrect: boolean
  elapsedMs: number
  config: SupportRewardConfig
}): number => {
  if (!isCorrect) {
    return 0
  }

  const clampedElapsedMs = Math.max(0, elapsedMs)
  const ratio = Math.min(1, clampedElapsedMs / Math.max(1, config.rewardWindowMs))
  const range = config.supportRewardMax - config.supportRewardMin
  const reward = config.supportRewardMax - range * ratio

  return Math.round(Math.max(config.supportRewardMin, reward))
}

export const applySupportAnswer = (state: SupportState): SupportResult => {
  const duplicateAttempt = state.seenSupportAttemptIds.includes(state.attemptId)

  if (duplicateAttempt || !state.isCorrect) {
    return {
      allowed: false,
      southTeamPoints: state.southTeamPoints,
      northSupportPoints: state.northSupportPoints,
      rewarded: 0,
    }
  }

  const rewarded = calculateSupportMeter({
    isCorrect: state.isCorrect,
    elapsedMs: state.elapsedMs,
    config: state.config,
  })

  return {
    allowed: true,
    southTeamPoints: state.southTeamPoints + rewarded,
    northSupportPoints: state.northSupportPoints + rewarded,
    rewarded,
  }
}
