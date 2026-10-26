import { describe, expect, it } from 'vitest'
import {
  dedupeRealtimeEvents,
  describeRealtimeConnectionState,
  shouldIgnoreDuplicateRealtimeEvent,
  type RealtimeEvent,
} from './realtimeRules'

describe('realtimeRules', () => {
  it('ignores duplicate event ids produced by the same realtime payload', () => {
    const seen = new Set(['evt-001', 'evt-002'])

    expect(shouldIgnoreDuplicateRealtimeEvent('evt-001', seen)).toBe(true)
    expect(shouldIgnoreDuplicateRealtimeEvent('evt-003', seen)).toBe(false)
  })

  it('keeps only the first occurrence of each event id', () => {
    const events: RealtimeEvent[] = [
      { id: 'evt-001', channel: 'scores', payload: { points: 10 }, receivedAt: 1000 },
      { id: 'evt-001', channel: 'scores', payload: { points: 10 }, receivedAt: 1200 },
      { id: 'evt-002', channel: 'progress', payload: { value: 0.5 }, receivedAt: 1300 },
    ]

    expect(dedupeRealtimeEvents(events)).toEqual([
      { id: 'evt-001', channel: 'scores', payload: { points: 10 }, receivedAt: 1000 },
      { id: 'evt-002', channel: 'progress', payload: { value: 0.5 }, receivedAt: 1300 },
    ])
  })

  it('describes the connection status in Vietnamese', () => {
    expect(describeRealtimeConnectionState('connected')).toBe('Đã kết nối')
    expect(describeRealtimeConnectionState('reconnecting')).toBe('Đang kết nối lại')
    expect(describeRealtimeConnectionState('disconnected')).toBe('Mất kết nối')
  })
})
