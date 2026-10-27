import type { LobbyMember, LobbyTeam } from '../domain/lobbyRules'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { NorthGameState } from '../domain/northMultipleChoice'
import type { GameState as SouthWordGameState } from '../domain/southWordGame'
import { supabaseClient } from './supabase'

const getClient = () => {
  if (!supabaseClient) {
    throw new Error('Cấu hình Supabase chưa hoàn tất. Vui lòng thử lại sau.')
  }

  return supabaseClient
}

export const getRoomServiceErrorMessage = (error: unknown, fallback: string) => {
  const errorFields = typeof error === 'object' && error !== null
    ? error as Record<string, unknown>
    : {}
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
    : [errorFields.message, errorFields.details, errorFields.hint]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .join(' ')
  const normalizedMessage = message.toLowerCase()

  if (normalizedMessage.includes('question_bank_answers')) {
    return 'Không thể tải đáp án cho chế độ demo. Hãy áp dụng migration 20261026_0006_demo_answer_key_access.sql.'
  }

  if (normalizedMessage.includes('question_bank') || normalizedMessage.includes('permission denied') || normalizedMessage.includes('row-level security')) {
    return 'Không thể tải ngân hàng câu hỏi. Hãy áp dụng migrations question_bank trong Supabase và cấp quyền đọc câu hỏi đang mở.'
  }

  if (normalizedMessage.includes('room_code_not_found')) {
    return 'Không tìm thấy mã phòng. Hãy kiểm tra mã và thử lại.'
  }

  if (normalizedMessage.includes('channel') || normalizedMessage.includes('realtime')) {
    return 'Không thể kết nối phòng. Hãy kiểm tra Supabase Realtime và thử lại.'
  }

  return message || fallback
}

export type BankQuestion = {
  id: string
  owner_team: LobbyTeam
  kind: 'multiple_choice' | 'fill_blank'
  prompt: string
  choices: string[]
  unlock_cost: number
  support_reward_base: number
  duration_seconds: number
  points: number
}

export type SouthWallet = {
  balance: number
  lastAid: number
  unlockedQuestionIds: string[]
  completedQuestionIds?: string[]
}

export type RoomMessage = {
  type: string
  requestId?: string
  errorMessage?: string
  player?: LobbyMember
  state?: {
    players: LobbyMember[]
    status: 'waiting' | 'active' | 'paused'
    questionNumber: number
    questions: BankQuestion[]
    southWallet?: SouthWallet
    northGame?: NorthGameState | null
    southGame?: SouthWordGameState | null
  }
  playerId?: string
  questionId?: string
  optionId?: string
  answer?: string
}

const roomChannelName = (code: string) => `vnr-room:${code}`
const roomMessageEvent = 'room-message'

const createId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`

const waitForSubscription = (channel: RealtimeChannel) =>
  new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Kết nối phòng quá thời gian chờ.')), 8000)

    channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') {
        window.clearTimeout(timeout)
        resolve()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        window.clearTimeout(timeout)
        reject(error ?? new Error('Không thể kết nối kênh phòng.'))
      }
    })
  })

const createRoomChannel = (
  code: string,
  onMessage: (message: RoomMessage) => void,
) => getClient()
  .channel(roomChannelName(code), {
    config: { broadcast: { ack: true, self: false }, private: false },
  })
  .on('broadcast', { event: roomMessageEvent }, ({ payload }) => {
    if (payload && typeof payload === 'object' && 'type' in payload) {
      onMessage(payload as RoomMessage)
    }
  })

const sendRoomMessage = async (channel: RealtimeChannel, message: RoomMessage) => {
  const result = await channel.send({ type: 'broadcast', event: roomMessageEvent, payload: message })
  if (result !== 'ok') throw new Error('Không thể gửi dữ liệu đến phòng.')
}

export const closeRoomChannel = async (channel: RealtimeChannel | null) => {
  if (channel && supabaseClient) await supabaseClient.removeChannel(channel)
}

export const createHostRoom = async (onMessage: (message: RoomMessage) => void) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const randomValues = new Uint8Array(6)
  globalThis.crypto.getRandomValues(randomValues)
  const roomCode = Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join('')
  const channel = createRoomChannel(roomCode, onMessage)

  try {
    await waitForSubscription(channel)
    return { roomCode, channel }
  } catch (error) {
    await closeRoomChannel(channel)
    throw error
  }
}

export const connectPlayerToRoom = async (
  roomCode: string,
  onMessage: (message: RoomMessage) => void,
) => {
  const requestId = createId()
  let resolveFound: (() => void) | undefined
  let rejectFound: ((error: Error) => void) | undefined
  const roomFound = new Promise<void>((resolve, reject) => {
    resolveFound = resolve
    rejectFound = reject
  })
  const channel = createRoomChannel(roomCode, (message) => {
    if (message.type === 'room-found' && message.requestId === requestId) resolveFound?.()
    onMessage(message)
  })

  try {
    await waitForSubscription(channel)
    await sendRoomMessage(channel, { type: 'room-probe', requestId })
    await Promise.race([
      roomFound,
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error('ROOM_CODE_NOT_FOUND')), 4000)
      }),
    ])
    return { roomCode: roomCode.trim().toUpperCase(), channel }
  } catch (error) {
    rejectFound?.(error instanceof Error ? error : new Error('Không tìm thấy phòng.'))
    await closeRoomChannel(channel)
    throw error
  }
}

export const sendRoomEvent = sendRoomMessage

export const loadQuestionBank = async (): Promise<BankQuestion[]> => {
  const { data, error } = await getClient()
    .from('question_bank')
    .select('id, owner_team, kind, prompt, choices, unlock_cost, support_reward_base, duration_seconds, points')
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as BankQuestion[]
}

export type BankAnswerKey = {
  question_id: string
  correct_answer: string
}

export const loadQuestionAnswerKeys = async (questionIds: string[]): Promise<BankAnswerKey[]> => {
  if (questionIds.length === 0) return []

  const { data, error } = await getClient()
    .from('question_bank_answers')
    .select('question_id, correct_answer')
    .in('question_id', questionIds)

  if (error) throw error
  return data ?? []
}

