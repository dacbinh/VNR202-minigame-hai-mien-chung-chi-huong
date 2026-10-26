import { describe, expect, it } from 'vitest'

import {
  evaluateAnswer,
  shouldIgnoreDuplicateAnswer,
  type AnswerEvaluationInput,
} from './answerRules'

describe('evaluateAnswer', () => {
  it('cho kết quả đúng cho multiple choice khi chọn đúng và sai khi chọn sai', () => {
    const correctChoice: AnswerEvaluationInput = {
      kind: 'multiple_choice',
      submitted: 'B',
      correct: 'B',
      normalization: { trim: true, caseInsensitive: true, collapseWhitespace: true },
      allowPartial: false,
    }

    const wrongChoice: AnswerEvaluationInput = {
      kind: 'multiple_choice',
      submitted: 'A',
      correct: 'B',
      normalization: { trim: true, caseInsensitive: true, collapseWhitespace: true },
      allowPartial: false,
    }

    expect(evaluateAnswer(correctChoice)).toEqual({ isCorrect: true, points: 100 })
    expect(evaluateAnswer(wrongChoice)).toEqual({ isCorrect: false, points: -20 })
  })

  it('chuẩn hóa đáp án fill blank và xử lý đúng/sai đúng luật', () => {
    const correctFill: AnswerEvaluationInput = {
      kind: 'fill_blank',
      submitted: '  Hà Nội  ',
      correct: 'Hà Nội',
      normalization: { trim: true, caseInsensitive: true, collapseWhitespace: true },
      allowPartial: false,
    }

    const wrongFill: AnswerEvaluationInput = {
      kind: 'fill_blank',
      submitted: 'Hà  Nôi',
      correct: 'Hà Nội',
      normalization: { trim: true, caseInsensitive: true, collapseWhitespace: true },
      allowPartial: false,
    }

    expect(evaluateAnswer(correctFill)).toEqual({ isCorrect: true, points: 100 })
    expect(evaluateAnswer(wrongFill)).toEqual({ isCorrect: false, points: -20 })
  })
})

describe('shouldIgnoreDuplicateAnswer', () => {
  it('không chấm lại cùng một request lặp', () => {
    expect(shouldIgnoreDuplicateAnswer('attempt-1', new Set(['attempt-1']))).toBe(true)
    expect(shouldIgnoreDuplicateAnswer('attempt-2', new Set(['attempt-1']))).toBe(false)
  })
})
