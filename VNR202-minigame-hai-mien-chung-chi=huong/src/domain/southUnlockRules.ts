export type SouthUnlockState = {
  southTeamPoints: number
  unlockCost: number
  questionId: string
  unlockedQuestionIds: string[]
  sessionActive: boolean
}

export type SouthUnlockResult = {
  allowed: boolean
  updatedPoints: number
  questionId: string
  unlockedQuestionIds: string[]
}

export const canUnlockQuestion = (state: SouthUnlockState): boolean => {
  if (!state.sessionActive || !Number.isInteger(state.unlockCost) || state.unlockCost <= 0) {
    return false
  }

  if (state.southTeamPoints < state.unlockCost) {
    return false
  }

  if (state.unlockedQuestionIds.includes(state.questionId)) {
    return false
  }

  return true
}

export const shouldIgnoreDuplicateUnlock = (
  questionId: string,
  seenQuestionIds: Iterable<string>,
): boolean => {
  for (const seenQuestionId of seenQuestionIds) {
    if (seenQuestionId === questionId) {
      return true
    }
  }

  return false
}

export const applySouthUnlock = (state: SouthUnlockState): SouthUnlockResult => {
  const alreadyUnlocked = state.unlockedQuestionIds.includes(state.questionId)
  if (!state.sessionActive || alreadyUnlocked || !Number.isInteger(state.unlockCost)
    || state.unlockCost <= 0 || state.southTeamPoints < state.unlockCost) {
    return {
      allowed: false,
      updatedPoints: state.southTeamPoints,
      questionId: state.questionId,
      unlockedQuestionIds: [...state.unlockedQuestionIds],
    }
  }

  const updatedPoints = state.southTeamPoints - state.unlockCost
  const nextUnlockedIds = [...state.unlockedQuestionIds, state.questionId]

  return {
    allowed: true,
    updatedPoints,
    questionId: state.questionId,
    unlockedQuestionIds: nextUnlockedIds,
  }
}
