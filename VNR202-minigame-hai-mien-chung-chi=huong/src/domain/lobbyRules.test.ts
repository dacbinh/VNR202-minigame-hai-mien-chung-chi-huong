import { describe, expect, it } from 'vitest'

import {
  canStartLobby,
  dedupeMembersByProfileId,
  getTeamMemberCount,
  type LobbyMember,
} from './lobbyRules'

describe('canStartLobby', () => {
  it('cho phép bắt đầu khi có ít nhất 3 người cho mỗi đội và 1 admin', () => {
    const members: LobbyMember[] = [
      { profileId: 'a1', displayName: 'A', team: 'north', isAdmin: false },
      { profileId: 'a2', displayName: 'B', team: 'north', isAdmin: false },
      { profileId: 'a3', displayName: 'C', team: 'north', isAdmin: false },
      { profileId: 'b1', displayName: 'D', team: 'south', isAdmin: false },
      { profileId: 'b2', displayName: 'E', team: 'south', isAdmin: false },
      { profileId: 'b3', displayName: 'F', team: 'south', isAdmin: false },
      { profileId: 'admin', displayName: 'Admin', team: 'south', isAdmin: true },
    ]

    expect(canStartLobby(members)).toBe(true)
  })

  it('không cho phép bắt đầu khi thiếu người ở một đội', () => {
    const members: LobbyMember[] = [
      { profileId: 'n1', displayName: 'N1', team: 'north', isAdmin: false },
      { profileId: 'n2', displayName: 'N2', team: 'north', isAdmin: false },
      { profileId: 's1', displayName: 'S1', team: 'south', isAdmin: false },
      { profileId: 's2', displayName: 'S2', team: 'south', isAdmin: false },
      { profileId: 'admin', displayName: 'Admin', team: 'south', isAdmin: true },
    ]

    expect(canStartLobby(members)).toBe(false)
  })
})

describe('getTeamMemberCount', () => {
  it('đếm đúng số lượng người trong mỗi đội', () => {
    const members: LobbyMember[] = [
      { profileId: 'n1', displayName: 'N1', team: 'north', isAdmin: false },
      { profileId: 'n2', displayName: 'N2', team: 'north', isAdmin: false },
      { profileId: 's1', displayName: 'S1', team: 'south', isAdmin: false },
    ]

    expect(getTeamMemberCount(members, 'north')).toBe(2)
    expect(getTeamMemberCount(members, 'south')).toBe(1)
  })
})

describe('dedupeMembersByProfileId', () => {
  it('gộp thành viên trùng khi refresh hoặc reconnect', () => {
    const members: LobbyMember[] = [
      { profileId: 'u1', displayName: 'A', team: 'north', isAdmin: false },
      { profileId: 'u1', displayName: 'A mới', team: 'north', isAdmin: false },
      { profileId: 'u2', displayName: 'B', team: 'south', isAdmin: true },
    ]

    expect(dedupeMembersByProfileId(members)).toHaveLength(2)
    expect(dedupeMembersByProfileId(members)[0]?.displayName).toBe('A mới')
  })
})
