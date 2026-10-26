import { describe, expect, it } from 'vitest'

import {
  calculateSouthProgress,
  calculateSupportReward,
  normalizeAnswer,
  shouldIgnoreDuplicateAttempt,
} from './gameRules'

describe('normalizeAnswer', () => {
  it('chuẩn hóa đáp án điền từ theo trim, chữ thường và khoảng trắng', () => {
    expect(normalizeAnswer('  Hà Nội  ', { trim: true, caseInsensitive: true, collapseWhitespace: true })).toBe('hà nội')
    expect(normalizeAnswer('Hà   Nội', { trim: true, caseInsensitive: true, collapseWhitespace: true })).toBe('hà nội')
  })

  it('chuẩn hóa Unicode tiếng Việt nhưng giữ dấu và khoảng trắng bên trong', () => {
    const config = { trim: true, caseInsensitive: true, collapseWhitespace: false }

    expect(normalizeAnswer('HA\u0300 NO\u0302\u0323I', config)).toBe('hà nội')
    expect(normalizeAnswer('Ha Noi', config)).not.toBe(normalizeAnswer('Hà Nội', config))
    expect(normalizeAnswer('Ha   Noi', config)).not.toBe(normalizeAnswer('Ha Noi', config))
  })
})

describe('calculateSupportReward', () => {
  it('tính thưởng cao khi trả lời sớm và giảm theo thời gian', () => {
    const config = {
      supportRewardMax: 250,
      supportRewardMin: 50,
      rewardWindowMs: 30000,
    }

    expect(calculateSupportReward({ isCorrect: true, elapsedMs: 0, config })).toBe(250)
    expect(calculateSupportReward({ isCorrect: true, elapsedMs: 15000, config })).toBe(150)
    expect(calculateSupportReward({ isCorrect: true, elapsedMs: 45000, config })).toBe(50)
  })

  it('không thưởng khi câu trả lời sai', () => {
    const config = {
      supportRewardMax: 250,
      supportRewardMin: 50,
      rewardWindowMs: 30000,
    }

    expect(calculateSupportReward({ isCorrect: false, elapsedMs: 5000, config })).toBe(0)
  })
})

describe('calculateSouthProgress', () => {
  it('chỉ tính tiến độ cho Miền Nam, không có progress riêng cho Miền Bắc', () => {
    expect(
      calculateSouthProgress({
        completedQuestions: 3,
        totalQuestions: 10,
      }),
    ).toBe(0.3)

    expect(
      calculateSouthProgress({
        completedQuestions: 10,
        totalQuestions: 10,
      }),
    ).toBe(1)
  })
})

describe('shouldIgnoreDuplicateAttempt', () => {
  it('không cộng thưởng lần hai cho cùng request', () => {
    expect(shouldIgnoreDuplicateAttempt('attempt-123', new Set(['attempt-123']))).toBe(true)
    expect(shouldIgnoreDuplicateAttempt('attempt-124', new Set(['attempt-123']))).toBe(false)
  })
})
