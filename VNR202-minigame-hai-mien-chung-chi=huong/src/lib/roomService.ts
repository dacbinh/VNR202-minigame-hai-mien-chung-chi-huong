import type { LobbyMember, LobbyTeam } from '../domain/lobbyRules'
import { supabaseClient } from './supabase'

type RoomResult = {
  session_id: string
  room_code: string
  session_status?: string
}

type TeamMemberRow = {
  profile_id: string
  team: LobbyTeam
  is_admin: boolean
  profiles: { display_name: string } | null
}

const getClient = () => {
  if (!supabaseClient) {
    throw new Error('Cấu hình Supabase chưa hoàn tất. Vui lòng thử lại sau.')
  }

  return supabaseClient
}

export const getRoomServiceErrorMessage = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : ''
  const normalizedMessage = message.toLowerCase()

  if (normalizedMessage.includes('schema cache') || normalizedMessage.includes('create_lobby_room') || normalizedMessage.includes('join_lobby_room')) {
    return 'Chức năng phòng chưa được cài trên máy chủ. Hãy áp dụng migration 20261026_0002_lobby_room_rpcs.sql trong Supabase.'
  }

  if (normalizedMessage.includes('room code was not found')) {
    return 'Không tìm thấy mã phòng. Hãy kiểm tra mã và thử lại.'
  }

  if (normalizedMessage.includes('anonymous') && normalizedMessage.includes('disabled')) {
    return 'Supabase chưa bật đăng nhập ẩn danh. Hãy bật Anonymous Sign-Ins trong phần Auth.'
  }

  return message || fallback
}

const ensureAnonymousUser = async () => {
  const client = getClient()
  const { data: sessionData, error: sessionError } = await client.auth.getSession()

  if (sessionError) throw sessionError
  if (sessionData.session?.user) return sessionData.session.user.id

  const { data, error } = await client.auth.signInAnonymously()
  if (error) throw error
  if (!data.user) throw new Error('Không thể tạo phiên người dùng ẩn danh.')

  return data.user.id
}

const getRoomResult = (data: RoomResult[] | RoomResult | null): RoomResult => {
  const room = Array.isArray(data) ? data[0] : data
  if (!room?.session_id || !room.room_code) {
    throw new Error('Máy chủ không trả về thông tin phòng hợp lệ.')
  }

  return room
}

export const createLobbyRoom = async () => {
  await ensureAnonymousUser()

  const { data, error } = await getClient().rpc('create_lobby_room')
  if (error) throw error

  const room = getRoomResult(data as RoomResult[] | RoomResult | null)
  return { sessionId: room.session_id, roomCode: room.room_code }
}

export const joinLobbyRoom = async (
  roomCode: string,
  displayName: string,
  team: LobbyTeam,
) => {
  const profileId = await ensureAnonymousUser()
  const { data, error } = await getClient().rpc('join_lobby_room', {
    p_code: roomCode.trim().toUpperCase(),
    p_display_name: displayName.trim(),
    p_team: team,
  })

  if (error) throw error

  const room = getRoomResult(data as RoomResult[] | RoomResult | null)
  return { sessionId: room.session_id, roomCode: room.room_code, profileId }
}

export const getRoomMembers = async (sessionId: string): Promise<LobbyMember[]> => {
  const { data, error } = await getClient()
    .from('team_members')
    .select('profile_id, team, is_admin, profiles(display_name)')
    .eq('session_id', sessionId)
    .eq('is_admin', false)
    .order('joined_at', { ascending: true })

  if (error) throw error

  return ((data ?? []) as unknown as TeamMemberRow[]).map((member) => ({
    profileId: member.profile_id,
    displayName: member.profiles?.display_name ?? 'Người chơi',
    team: member.team,
    isAdmin: member.is_admin,
  }))
}