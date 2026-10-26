import { describe, expect, it } from 'vitest'

import { canCompleteGame, isNorthKeyEligible, isSouthKeyEligible } from './adminRules'
import { applySupportAnswer } from './supportRules'
import { canStartLobby, dedupeMembersByProfileId, type LobbyMember } from './lobbyRules'
import { applySouthUnlock, canUnlockQuestion } from './southUnlockRules'

describe('game flow integration', () => {
  it('đi từ phòng chờ tới hoàn thành trận khi đạt đủ điều kiện', () => {
    const lobbyMembers: LobbyMember[] = [
      { profileId: 'north-1', displayName: 'Người chơi A', team: 'north', isAdmin: false },
      { profileId: 'north-2', displayName: 'Người chơi B', team: 'north', isAdmin: false },
      { profileId: 'north-3', displayName: 'Người chơi C', team: 'north', isAdmin: false },
      { profileId: 'south-1', displayName: 'Người chơi D', team: 'south', isAdmin: false },
      { profileId: 'south-2', displayName: 'Người chơi E', team: 'south', isAdmin: false },
      { profileId: 'south-3', displayName: 'Người chơi F', team: 'south', isAdmin: false },
      { profileId: 'admin-1', displayName: 'Quản trị viên', team: 'south', isAdmin: true },
    ]

    const uniqueMembers = dedupeMembersByProfileId(lobbyMembers)
    expect(canStartLobby(uniqueMembers)).toBe(true)

    const unlockState = {
      southTeamPoints: 200,
      unlockCost: 80,
      questionId: 'q-1',
      unlockedQuestionIds: ['q-0'],
      sessionActive: true,
    }

    expect(canUnlockQuestion(unlockState)).toBe(true)

    const unlockResult = applySouthUnlock(unlockState)
    expect(unlockResult.allowed).toBe(true)
    expect(unlockResult.updatedPoints).toBe(120)

    const supportResult = applySupportAnswer({
      southTeamPoints: unlockResult.updatedPoints,
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
    })

    expect(supportResult.allowed).toBe(true)
    expect(supportResult.southTeamPoints).toBe(337)
    expect(supportResult.northSupportPoints).toBe(217)

    const northEligible = isNorthKeyEligible({
      northSupportPoints: supportResult.northSupportPoints,
      threshold: 150,
      sessionActive: true,
      keyAlreadyClaimed: false,
    })

    const southEligible = isSouthKeyEligible({
      southProgress: 0.8,
      threshold: 0.75,
      sessionActive: true,
      keyAlreadyClaimed: false,
    })

    expect(northEligible).toBe(true)
    expect(southEligible).toBe(true)

    expect(
      canCompleteGame({
        isAdmin: true,
        sessionStatus: 'ACTIVE',
        northKeyEligible: northEligible,
        southKeyEligible: southEligible,
        northKeyClaimed: true,
        southKeyClaimed: true,
      }),
    ).toBe(true)
  })
})
