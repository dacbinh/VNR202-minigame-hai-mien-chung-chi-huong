import { describe, expect, it } from 'vitest'

import {
  createNorthGameState,
  isNorthOptionCorrect,
  transitionNorthGame,
  validateMultipleChoiceQuestions,
  type MultipleChoiceQuestion,
  type NorthGameActor,
} from './northMultipleChoice'

const questions: MultipleChoiceQuestion[] = [
  {
    id: 'north-1',
    prompt: 'Nội dung câu hỏi 1',
    options: [
      { id: 'a', label: 'A', text: 'Lựa chọn A' },
      { id: 'b', label: 'B', text: 'Lựa chọn B' },
    ],
    durationSeconds: 10,
    points: 1,
  },
  {
    id: 'north-2',
    prompt: 'Nội dung câu hỏi 2',
    options: [
      { id: 'c', label: 'A', text: 'Lựa chọn C' },
      { id: 'd', label: 'B', text: 'Lựa chọn D' },
    ],
    durationSeconds: 5,
    points: 1,
  },
]

const admin: NorthGameActor = { role: 'admin', id: 'host' }
const player: NorthGameActor = { role: 'player', id: 'player-1' }
const createGame = () => createNorthGameState(questions, ['player-1', 'player-2'], {
  feedbackDurationSeconds: 2,
  intermissionDurationSeconds: 3,
})
const startGame = () => transitionNorthGame(createGame(), { type: 'ADMIN_START' }, admin)

describe('validateMultipleChoiceQuestions', () => {
  it('accepts 2-4 options and rejects invalid question sets', () => {
    expect(validateMultipleChoiceQuestions(questions)).toBeNull()
    expect(validateMultipleChoiceQuestions([])).toBe('Không có câu hỏi để bắt đầu.')
    expect(validateMultipleChoiceQuestions([{ ...questions[0]!, options: [questions[0]!.options[0]!] }]))
      .toBe('Mỗi câu hỏi cần có từ 2 đến 4 lựa chọn.')
    expect(validateMultipleChoiceQuestions([{ ...questions[0]!, options: [...questions[0]!.options, ...questions[0]!.options, ...questions[0]!.options] }]))
      .toBe('Mỗi câu hỏi cần có từ 2 đến 4 lựa chọn.')
    expect(validateMultipleChoiceQuestions([{ ...questions[0]!, durationSeconds: Number.NaN }]))
      .toBe('Thời lượng câu hỏi phải lớn hơn 0.')
  })
})

describe('North multiple-choice state machine', () => {
  it('starts only through an admin command and sets a deadline', () => {
    const lobby = createGame()
    const unauthorized = transitionNorthGame(lobby, { type: 'ADMIN_START' }, player)
    const active = transitionNorthGame(lobby, { type: 'ADMIN_START' }, admin)

    expect(unauthorized).toBe(lobby)
    expect(active.status).toBe('question_active')
    if (active.status === 'question_active') {
      expect(active.context.questionDeadline).toBeGreaterThan(Date.now())
      expect(active.context.currentIndex).toBe(0)
    }
  })

  it('accepts one valid answer per player for the active question', () => {
    const active = startGame()
    const submitted = transitionNorthGame(active, {
      type: 'SUBMIT_ANSWER', questionId: 'north-1', optionId: 'a', requestId: 'answer-1', isCorrect: true,
    }, player)
    const duplicateAnswer = transitionNorthGame(submitted, {
      type: 'SUBMIT_ANSWER', questionId: 'north-1', optionId: 'b', requestId: 'answer-2', isCorrect: false,
    }, player)
    const duplicateRequest = transitionNorthGame(submitted, {
      type: 'SUBMIT_ANSWER', questionId: 'north-1', optionId: 'a', requestId: 'answer-1', isCorrect: true,
    }, { role: 'player', id: 'player-2' })

    expect(submitted.context.answers).toHaveLength(1)
    expect(submitted.context.answers[0]?.pointsAwarded).toBe(1)
    expect(submitted.context.scores['player-1']).toBe(1)
    expect(duplicateAnswer).toBe(submitted)
    expect(duplicateRequest).toBe(submitted)
  })

  it('rejects stale questions, invalid choices, and non-participants', () => {
    const active = startGame()
    const stale = transitionNorthGame(active, {
      type: 'SUBMIT_ANSWER', questionId: 'north-2', optionId: 'a', requestId: 'stale', isCorrect: true,
    }, player)
    const invalidOption = transitionNorthGame(active, {
      type: 'SUBMIT_ANSWER', questionId: 'north-1', optionId: 'missing', requestId: 'bad-option', isCorrect: true,
    }, player)
    const stranger = transitionNorthGame(active, {
      type: 'SUBMIT_ANSWER', questionId: 'north-1', optionId: 'a', requestId: 'stranger', isCorrect: true,
    }, { role: 'player', id: 'not-in-game' })

    expect(stale).toBe(active)
    expect(invalidOption).toBe(active)
    expect(stranger).toBe(active)
  })

  it('reveals the admin-selected answer and locks submissions', () => {
    const active = startGame()
    const answered = transitionNorthGame(active, {
      type: 'SUBMIT_ANSWER', questionId: 'north-1', optionId: 'a', requestId: 'answer', isCorrect: true,
    }, player)
    const revealed = transitionNorthGame(answered, { type: 'ADMIN_REVEAL_ANSWER', correctOptionId: 'a' }, admin)
    const lateAnswer = transitionNorthGame(revealed, {
      type: 'SUBMIT_ANSWER', questionId: 'north-1', optionId: 'b', requestId: 'late', isCorrect: false,
    }, { role: 'player', id: 'player-2' })

    expect(revealed.status).toBe('answer_revealed')
    expect(revealed.context.resolutions[0]?.correctOptionId).toBe('a')
    expect(revealed.context.answers[0]?.correct).toBe(true)
    expect(lateAnswer).toBe(revealed)
  })

  it('resolves timed-out questions, then advances through feedback and intermission', () => {
    const active = startGame()
    if (active.status !== 'question_active') throw new Error('Expected active question')
    const timedOut = transitionNorthGame(active, {
      type: 'TICK', now: active.context.questionDeadline!,
    }, admin)
    const intermission = transitionNorthGame(timedOut, {
      type: 'TICK', now: timedOut.context.feedbackDeadline!,
    }, admin)
    const secondQuestion = transitionNorthGame(intermission, {
      type: 'TICK', now: intermission.context.intermissionDeadline!,
    }, admin)

    expect(timedOut.status).toBe('answer_revealed')
    expect(timedOut.context.resolutions[0]?.reason).toBe('timeout')
    expect(intermission.status).toBe('intermission')
    expect(secondQuestion.status).toBe('question_active')
    expect(secondQuestion.context.currentIndex).toBe(1)
  })

  it('supports authorized skip, skip-intermission, and final completion', () => {
    const active = startGame()
    const skipped = transitionNorthGame(active, { type: 'ADMIN_SKIP_QUESTION' }, admin)
    const unauthorizedSkip = transitionNorthGame(active, { type: 'ADMIN_SKIP_QUESTION' }, player)
    const next = transitionNorthGame(skipped, { type: 'ADMIN_SKIP_INTERMISSION' }, admin)
    const finalSkip = transitionNorthGame(next, { type: 'ADMIN_SKIP_QUESTION' }, admin)
    const completed = transitionNorthGame(finalSkip, { type: 'ADMIN_SKIP_INTERMISSION' }, admin)

    expect(skipped.context.resolutions[0]?.reason).toBe('admin_skip')
    expect(unauthorizedSkip).toBe(active)
    expect(next.context.currentIndex).toBe(1)
    expect(completed.status).toBe('completed')
  })

  it('pauses and resumes with the remaining question time', () => {
    const active = startGame()
    if (active.status !== 'question_active') throw new Error('Expected active question')
    const pausedAt = active.context.questionDeadline! - 4000
    const paused = transitionNorthGame(active, { type: 'ADMIN_PAUSE' }, admin)
    const resumed = transitionNorthGame(paused, { type: 'ADMIN_RESUME' }, admin)

    expect(paused.status).toBe('paused')
    if (paused.status === 'paused') expect(paused.pausedRemainingMs).toBeLessThanOrEqual(10000)
    expect(resumed.status).toBe('question_active')
    if (resumed.status === 'question_active') {
      expect(resumed.context.questionDeadline).toBeGreaterThan(pausedAt)
    }
  })

  it('awards no points for an incorrect submitted answer', () => {
    const active = startGame()
    const incorrect = transitionNorthGame(active, {
      type: 'SUBMIT_ANSWER',
      questionId: 'north-1',
      optionId: 'b',
      requestId: 'wrong-answer',
      isCorrect: false,
    }, player)

    expect(incorrect.context.answers[0]?.correct).toBe(false)
    expect(incorrect.context.answers[0]?.pointsAwarded).toBe(0)
    expect(incorrect.context.scores['player-1']).toBe(0)
  })

  it('restarts completed games as a clean lobby', () => {
    const active = startGame()
    const completed = transitionNorthGame(active, { type: 'ADMIN_END_GAME', reason: 'Kết thúc' }, admin)
    const restarted = transitionNorthGame(completed, { type: 'ADMIN_RESTART' }, admin)

    expect(restarted.status).toBe('lobby')
    expect(restarted.context.answers).toEqual([])
    expect(restarted.context.scores['player-1']).toBe(0)
  })
})

describe('isNorthOptionCorrect', () => {
  it('ignores case and surrounding spaces while preserving Vietnamese diacritics', () => {
    expect(isNorthOptionCorrect('  HÀ NỘI ', 'Hà Nội')).toBe(true)
    expect(isNorthOptionCorrect('Ha Noi', 'Hà Nội')).toBe(false)
  })
})