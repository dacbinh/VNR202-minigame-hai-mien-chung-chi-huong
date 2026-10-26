export type LobbyTeam = 'north' | 'south'

export type LobbyMember = {
  profileId: string
  displayName: string
  team: LobbyTeam
  isAdmin: boolean
}

export type LobbyConfig = {
  requiredPlayersPerTeam: number
  requiredAdminCount: number
}

const DEFAULT_LOBBY_CONFIG: LobbyConfig = {
  requiredPlayersPerTeam: 3,
  requiredAdminCount: 1,
}

export const getTeamMemberCount = (
  members: LobbyMember[],
  team: LobbyTeam,
): number => members.filter((member) => member.team === team).length

export const getAdminCount = (members: LobbyMember[]): number =>
  members.filter((member) => member.isAdmin).length

export const canStartLobby = (
  members: LobbyMember[],
  config: LobbyConfig = DEFAULT_LOBBY_CONFIG,
): boolean => {
  const hasEnoughAdmin = getAdminCount(members) >= config.requiredAdminCount
  const hasEnoughNorthPlayers =
    getTeamMemberCount(members, 'north') >= config.requiredPlayersPerTeam
  const hasEnoughSouthPlayers =
    getTeamMemberCount(members, 'south') >= config.requiredPlayersPerTeam

  return hasEnoughAdmin && hasEnoughNorthPlayers && hasEnoughSouthPlayers
}

export const dedupeMembersByProfileId = (members: LobbyMember[]): LobbyMember[] => {
  const deduped = new Map<string, LobbyMember>()

  for (const member of members) {
    deduped.set(member.profileId, member)
  }

  return Array.from(deduped.values())
}
