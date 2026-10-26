import { describe, expect, it } from 'vitest'

import {
  applySupportAnswer,
  calculateSupportMeter,
  type SupportState,
} from './supportRules'

describe('calculateSupportMeter', () => {
  it('tính điểm hỗ trợ theo thời gian và trả lời đúng', () => {
    const config = {
      supportRewardMax: 250,
      supportRewardMin: 50,
      rewardWindowMs: 30000,
    }

    expect(
      calculateSupportMeter({
        isCorrect: true,
        elapsedMs: 0,
        config,
      }),
    ).toBe(250)

    expect(
      calculateSupportMeter({
        isCorrect: true,
        elapsedMs: 15000,
        config,
      }),
    ).toBe(150)
  })

  it('không cộng hỗ trợ nếu sai', () => {
    const config = {
      supportRewardMax: 250,
      supportRewardMin: 50,
      rewardWindowMs: 30000,
    }

    expect(
      calculateSupportMeter({
        isCorrect: false,
        elapsedMs: 5000,
        config,
      }),
    ).toBe(0)
  })
})

describe('applySupportAnswer', () => {
  it('cộng đúng một lần vào quỹ Miền Nam và không nhân đôi khi request lặp', () => {
    const state: SupportState = {
      southTeamPoints: 100,
      northSupportPoints: 0,
      seenSupportAttemptIds: ['attempt-1'],
      attemptId: 'attempt-2',
      isCorrect: true,
      elapsedMs: 5000,
      config: {
        supportRewardMax: 250,
        supportRewardMin: 50,
        rewardWindowMs: 30000,
      },
    }

    const result = applySupportAnswer(state)

    expect(result).toEqual({
      allowed: true,
      southTeamPoints: 317,
      northSupportPoints: 217,
      rewarded: 217,
    })

    const duplicate = applySupportAnswer({
      ...state,
      attemptId: 'attempt-1',
      seenSupportAttemptIds: ['attempt-1'],
    })

    expect(duplicate.allowed).toBe(false)
    expect(duplicate.southTeamPoints).toBe(100)
  })
})
