import { normalizeAnswer } from './gameRules'

export type QuestionKind = 'multiple_choice' | 'fill_blank'

export type AnswerNormalizationConfig = {
  trim: boolean
  caseInsensitive: boolean
  collapseWhitespace: boolean
}

export type AnswerEvaluationInput = {
  kind: QuestionKind
  submitted: string
  correct: string
  normalization: AnswerNormalizationConfig
  allowPartial?: boolean
}

export type AnswerEvaluationResult = {
  isCorrect: boolean
  points: number
}

const CORRECT_POINTS = 100
const INCORRECT_PENALTY = -20

export const shouldIgnoreDuplicateAnswer = (
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

export const evaluateAnswer = ({
  kind,
  submitted,
  correct,
  normalization,
  allowPartial = false,
}: AnswerEvaluationInput): AnswerEvaluationResult => {
  const normalizedSubmitted = normalizeAnswer(submitted, normalization)
  const normalizedCorrect = normalizeAnswer(correct, normalization)

  let isCorrect = normalizedSubmitted === normalizedCorrect

  if (kind === 'multiple_choice' && !allowPartial) {
    isCorrect = normalizedSubmitted === normalizedCorrect
  }

  if (kind === 'fill_blank' && allowPartial) {
    const partialMatch = normalizedSubmitted.includes(normalizedCorrect)
    isCorrect = partialMatch || isCorrect
  }

  return {
    isCorrect,
    points: isCorrect ? CORRECT_POINTS : INCORRECT_PENALTY,
  }
}
