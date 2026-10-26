export type TeamRole = 'north' | 'south'

export type QuestionType = 'multiple_choice' | 'fill_blank'

export type GameStatus = 'LOBBY' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'

export type AnswerNormalizationConfig = {
  trim: boolean
  caseInsensitive: boolean
  collapseWhitespace: boolean
}

export type SupportRewardConfig = {
  supportRewardMax: number
  supportRewardMin: number
  rewardWindowMs: number
}

export type SupportRewardInput = {
  isCorrect: boolean
  elapsedMs: number
  config: SupportRewardConfig
}

export type SouthProgressInput = {
  completedQuestions: number
  totalQuestions: number
}

export const normalizeAnswer = (
  value: string,
  config: AnswerNormalizationConfig,
): string => {
  let normalized = value.normalize('NFC')

  if (config.trim) {
    normalized = normalized.trim()
  }

  if (config.caseInsensitive) {
    normalized = normalized.toLocaleLowerCase('vi-VN')
  }

  if (config.collapseWhitespace) {
    normalized = normalized.replace(/\s+/g, ' ')
  }

  return normalized
}

export const calculateSupportReward = ({
  isCorrect,
  elapsedMs,
  config,
}: SupportRewardInput): number => {
  if (!isCorrect) {
    return 0
  }

  const clampedElapsedMs = Math.max(0, elapsedMs)
  const ratio = Math.min(1, clampedElapsedMs / Math.max(1, config.rewardWindowMs))
  const rewardRange = config.supportRewardMax - config.supportRewardMin
  const reward = config.supportRewardMax - rewardRange * ratio

  return Math.round(Math.max(config.supportRewardMin, reward))
}

export const calculateSouthProgress = ({
  completedQuestions,
  totalQuestions,
}: SouthProgressInput): number => {
  if (totalQuestions <= 0) {
    return 0
  }

  return Math.min(1, Math.max(0, completedQuestions / totalQuestions))
}

export const shouldIgnoreDuplicateAttempt = (
  attemptId: string,
  seenAttemptIds: Iterable<string>,
): boolean => {
  for (const seenId of seenAttemptIds) {
    if (seenId === attemptId) {
      return true
    }
  }

  return false
}
