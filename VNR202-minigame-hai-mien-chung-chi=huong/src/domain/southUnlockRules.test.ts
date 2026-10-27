import { describe, expect, it } from 'vitest'

import {
  applySouthUnlock,
  canUnlockQuestion,
  shouldIgnoreDuplicateUnlock,
  type SouthUnlockState,
} from './southUnlockRules'

describe('canUnlockQuestion', () => {
  it('cho phép mở khóa khi điểm đủ và câu hỏi chưa được unlock', () => {
    const state: SouthUnlockState = {
      southTeamPoints: 120,
      unlockCost: 80,
      questionId: 'q-1',
      unlockedQuestionIds: ['q-2'],
      sessionActive: true,
    }

    expect(canUnlockQuestion(state)).toBe(true)
  })

  it('không cho phép mở khóa khi số dư không đủ hoặc session không còn hoạt động', () => {
    const state: SouthUnlockState = {
      southTeamPoints: 50,
      unlockCost: 80,
      questionId: 'q-1',
      unlockedQuestionIds: ['q-2'],
      sessionActive: true,
    }

    expect(canUnlockQuestion(state)).toBe(false)

    expect(
      canUnlockQuestion({
        southTeamPoints: 120,
        unlockCost: 80,
        questionId: 'q-2',
        unlockedQuestionIds: ['q-2'],
        sessionActive: true,
      }),
    ).toBe(false)

    expect(
      canUnlockQuestion({
        southTeamPoints: 120,
        unlockCost: 80,
        questionId: 'q-3',
        unlockedQuestionIds: ['q-2'],
        sessionActive: false,
      }),
    ).toBe(false)
  })

  it('không cho phép mở khóa câu hỏi không có giá', () => {
    expect(canUnlockQuestion({
      southTeamPoints: 120,
      unlockCost: 0,
      questionId: 'q-1',
      unlockedQuestionIds: [],
      sessionActive: true,
    })).toBe(false)
  })

  it('cho phép mua lại (re-purchase) câu hỏi khi câu hỏi đã bị ẩn lại', () => {
    // Khi câu hỏi đã được ẩn lại (unlockedQuestionIds rỗng), người chơi có thể mua lại để làm lại
    const repurchaseState: SouthUnlockState = {
      southTeamPoints: 160,
      unlockCost: 80,
      questionId: 'q-1',
      unlockedQuestionIds: [],
      sessionActive: true,
    }

    expect(canUnlockQuestion(repurchaseState)).toBe(true)
    const firstUnlock = applySouthUnlock(repurchaseState)
    expect(firstUnlock.allowed).toBe(true)
    expect(firstUnlock.updatedPoints).toBe(80)

    // Sau khi câu hỏi bị ẩn lại (unlockedQuestionIds reset về rỗng), mua lại lần 2 tiếp tục trừ điểm
    const secondRepurchase = applySouthUnlock({
      southTeamPoints: firstUnlock.updatedPoints,
      unlockCost: 80,
      questionId: 'q-1',
      unlockedQuestionIds: [],
      sessionActive: true,
    })
    expect(secondRepurchase.allowed).toBe(true)
    expect(secondRepurchase.updatedPoints).toBe(0)
  })
})

describe('applySouthUnlock', () => {
  it('trừ điểm đúng một lần và ghi nhận unlock', () => {
    const result = applySouthUnlock({
      southTeamPoints: 120,
      unlockCost: 80,
      questionId: 'q-1',
      unlockedQuestionIds: ['q-2'],
      sessionActive: true,
    })

    expect(result).toEqual({
      allowed: true,
      updatedPoints: 40,
      questionId: 'q-1',
      unlockedQuestionIds: ['q-2', 'q-1'],
    })
  })

  it('không trừ điểm khi unlock trùng hoặc không hợp lệ', () => {
    const duplicate = applySouthUnlock({
      southTeamPoints: 120,
      unlockCost: 80,
      questionId: 'q-2',
      unlockedQuestionIds: ['q-2'],
      sessionActive: true,
    })

    expect(duplicate.allowed).toBe(false)
    expect(duplicate.updatedPoints).toBe(120)

    const insufficient = applySouthUnlock({
      southTeamPoints: 50,
      unlockCost: 80,
      questionId: 'q-3',
      unlockedQuestionIds: ['q-2'],
      sessionActive: true,
    })

    expect(insufficient.allowed).toBe(false)
    expect(insufficient.updatedPoints).toBe(50)

    const freeQuestion = applySouthUnlock({
      southTeamPoints: 120,
      unlockCost: 0,
      questionId: 'q-4',
      unlockedQuestionIds: [],
      sessionActive: true,
    })

    expect(freeQuestion.allowed).toBe(false)
    expect(freeQuestion.updatedPoints).toBe(120)
  })
})

describe('shouldIgnoreDuplicateUnlock', () => {
  it('bỏ qua lần request trùng của cùng câu hỏi', () => {
    expect(shouldIgnoreDuplicateUnlock('q-1', new Set(['q-1']))).toBe(true)
    expect(shouldIgnoreDuplicateUnlock('q-2', new Set(['q-1']))).toBe(false)
  })
})
