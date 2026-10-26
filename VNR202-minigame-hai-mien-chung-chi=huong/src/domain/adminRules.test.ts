import { describe, expect, it } from 'vitest'

import {
  canCompleteGame,
  canPerformAdminAction,
  isNorthKeyEligible,
  isSouthKeyEligible,
  shouldIgnoreDuplicateKeySubmission,
} from './adminRules'

describe('canPerformAdminAction', () => {
  it('cho phép admin điều khiển phiên khi trạng thái không bị huỷ', () => {
    expect(canPerformAdminAction(true, 'ACTIVE')).toBe(true)
    expect(canPerformAdminAction(false, 'ACTIVE')).toBe(false)
    expect(canPerformAdminAction(true, 'CANCELLED')).toBe(false)
  })
})

describe('key eligibility', () => {
  it('cho phép nhận chìa khóa khi điều kiện đạt ngưỡng', () => {
    expect(
      isNorthKeyEligible({
        northSupportPoints: 200,
        threshold: 150,
        sessionActive: true,
        keyAlreadyClaimed: false,
      }),
    ).toBe(true)

    expect(
      isSouthKeyEligible({
        southProgress: 0.8,
        threshold: 0.75,
        sessionActive: true,
        keyAlreadyClaimed: false,
      }),
    ).toBe(true)
  })

  it('không cho phép nhận chìa khóa khi thiếu điều kiện hoặc đã nhận rồi', () => {
    expect(
      isNorthKeyEligible({
        northSupportPoints: 100,
        threshold: 150,
        sessionActive: true,
        keyAlreadyClaimed: false,
      }),
    ).toBe(false)

    expect(
      isSouthKeyEligible({
        southProgress: 0.8,
        threshold: 0.75,
        sessionActive: false,
        keyAlreadyClaimed: false,
      }),
    ).toBe(false)

    expect(
      isSouthKeyEligible({
        southProgress: 0.8,
        threshold: 0.75,
        sessionActive: true,
        keyAlreadyClaimed: true,
      }),
    ).toBe(false)
  })
})

describe('canCompleteGame', () => {
  it('chỉ hoàn thành trận khi cả hai chìa khóa hợp lệ và đã được nộp', () => {
    expect(
      canCompleteGame({
        isAdmin: true,
        sessionStatus: 'ACTIVE',
        southKeyEligible: true,
        northKeyEligible: true,
        southKeyClaimed: true,
        northKeyClaimed: true,
      }),
    ).toBe(true)

    expect(
      canCompleteGame({
        isAdmin: true,
        sessionStatus: 'ACTIVE',
        southKeyEligible: true,
        northKeyEligible: false,
        southKeyClaimed: true,
        northKeyClaimed: true,
      }),
    ).toBe(false)
  })
})

describe('shouldIgnoreDuplicateKeySubmission', () => {
  it('bỏ qua key submission trùng', () => {
    expect(shouldIgnoreDuplicateKeySubmission('key-1', new Set(['key-1']))).toBe(true)
    expect(shouldIgnoreDuplicateKeySubmission('key-2', new Set(['key-1']))).toBe(false)
  })
})
