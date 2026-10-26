export type RealtimeChannel = 'scores' | 'progress' | 'unlocks' | 'session' | 'keys'

export type RealtimeConnectionState = 'connected' | 'reconnecting' | 'disconnected'

export type RealtimeEvent = {
  id: string
  channel: RealtimeChannel
  payload: Record<string, unknown>
  receivedAt: number
}

export const shouldIgnoreDuplicateRealtimeEvent = (
  eventId: string,
  seenEventIds: Iterable<string>,
): boolean => {
  for (const seenEventId of seenEventIds) {
    if (seenEventId === eventId) {
      return true
    }
  }

  return false
}

export const dedupeRealtimeEvents = (events: RealtimeEvent[]): RealtimeEvent[] => {
  const seenEventIds = new Set<string>()
  const uniqueEvents: RealtimeEvent[] = []

  for (const event of events) {
    if (shouldIgnoreDuplicateRealtimeEvent(event.id, seenEventIds)) {
      continue
    }

    seenEventIds.add(event.id)
    uniqueEvents.push(event)
  }

  return uniqueEvents
}

export const describeRealtimeConnectionState = (
  state: RealtimeConnectionState,
): string => {
  switch (state) {
    case 'connected':
      return 'Đã kết nối'
    case 'reconnecting':
      return 'Đang kết nối lại'
    case 'disconnected':
    default:
      return 'Mất kết nối'
  }
}

export const shouldRefetchAfterReconnect = (
  state: RealtimeConnectionState,
): boolean => state === 'reconnecting' || state === 'connected'
