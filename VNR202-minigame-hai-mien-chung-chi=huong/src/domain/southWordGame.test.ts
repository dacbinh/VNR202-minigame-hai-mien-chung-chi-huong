import { describe, expect, it } from 'vitest'

import {
  calculateWordGameCompletion,
  calculateWordGameScore,
  createWordGameState,
  getWordAnswerPattern,
  transitionWordGame,
  type GameState,
  type WordQuestion,
} from './southWordGame'

const questions: WordQuestion[] = [
  { id: 'q1', prompt: 'Điền từ thứ nhất', expectedAnswer: 'Hà Nội', unlockCost: 80 },
  { id: 'q2', prompt: 'Điền từ thứ hai', expectedAnswer: 'Huế', unlockCost: 100 },
]

const startGame = (gameQuestions = questions) =>
  transitionWordGame(createWordGameState(gameQuestions), { type: 'START' })

const answer = (state: GameState, value: string) =>
  transitionWordGame(
    transitionWordGame(state, { type: 'ANSWER_CHANGED', value }),
    { type: 'SUBMIT_ANSWER' },
  )

describe('createWordGameState', () => {
  it('starts ready with an empty result list and a copied question list', () => {
    const state = createWordGameState(questions)

    expect(state.status).toBe('ready')
    expect(state.context.currentIndex).toBe(0)
    expect(state.context.results).toEqual([])
    expect(state.context.questions).not.toBe(questions)
  })

  it('rejects invalid question data', () => {
    const state = createWordGameState([{ id: '', prompt: 'Prompt', expectedAnswer: 'Answer', unlockCost: 50 }])

    expect(state.status).toBe('error')
  })
})

describe('transitionWordGame', () => {
  it('starts only when at least one valid question is available', () => {
    expect(startGame().status).toBe('answering')
    expect(transitionWordGame(createWordGameState([]), { type: 'START' }).status).toBe('error')
    const answering = startGame()
    expect(transitionWordGame(answering, { type: 'START' })).toBe(answering)
  })

  it('updates drafts and ignores empty or whitespace-only submissions', () => {
    const answering = startGame()
    const blankDraft = transitionWordGame(answering, { type: 'ANSWER_CHANGED', value: ' \t ' })
    const emptyAnswer = transitionWordGame(blankDraft, { type: 'SUBMIT_ANSWER' })

    expect(emptyAnswer).toBe(blankDraft)
    expect(transitionWordGame(answering, { type: 'ANSWER_CHANGED', value: 'Hà Nội' }).context.draftAnswer)
      .toBe('Hà Nội')
  })

  it('accepts case variants and canonically equivalent Vietnamese text', () => {
    const state = answer(startGame(), 'HA\u0300 NO\u0302\u0323I')

    expect(state.status).toBe('feedback')
    if (state.status === 'feedback') {
      expect(state.lastResult.correct).toBe(true)
      expect(state.context.results).toHaveLength(1)
    }
  })

  it('accepts lowercase Vietnamese answers', () => {
    const state = answer(startGame(), 'hà nội')

    expect(state.status).toBe('feedback')
    if (state.status === 'feedback') {
      expect(state.lastResult.correct).toBe(true)
    }
  })

  it('accepts Vietnamese answers without diacritics', () => {
    const state = answer(startGame(), 'Ha Noi')

    expect(state.status).toBe('feedback')
    if (state.status === 'feedback') {
      expect(state.lastResult.correct).toBe(true)
      expect(calculateWordGameScore(state.context.results)).toBe(1)
    }
  })

  it('accepts Dong Khoi for Đồng Khởi and creates one slot per letter', () => {
    const state = answer(
      startGame([{ id: 'q1', prompt: 'Điền địa danh', expectedAnswer: 'Đồng Khởi', unlockCost: 60 }]),
      'dong khoi',
    )

    expect(state.status).toBe('feedback')
    if (state.status === 'feedback') expect(state.lastResult.correct).toBe(true)
    expect(getWordAnswerPattern('Đồng Khởi')).toEqual([4, 4])
  })

  it('allows only one submission per question and locks answer editing in feedback', () => {
    const feedback = answer(startGame(), 'Hà Nội')
    const submittedAgain = transitionWordGame(feedback, { type: 'SUBMIT_ANSWER' })
    const changedDuringFeedback = transitionWordGame(feedback, { type: 'ANSWER_CHANGED', value: 'wrong' })

    expect(submittedAgain).toBe(feedback)
    expect(changedDuringFeedback).toBe(feedback)
  })

  it('advances once and completes after the final question', () => {
    const firstFeedback = answer(startGame(), 'Hà Nội')
    const secondQuestion = transitionWordGame(firstFeedback, { type: 'NEXT_QUESTION' })

    expect(secondQuestion.status).toBe('answering')
    expect(secondQuestion.context.currentIndex).toBe(1)
    expect(secondQuestion.context.draftAnswer).toBe('')

    const completed = transitionWordGame(answer(secondQuestion, 'Huế'), { type: 'NEXT_QUESTION' })
    expect(completed.status).toBe('completed')
    expect(calculateWordGameScore(completed.context.results)).toBe(2)
    expect(calculateWordGameCompletion(completed.context.results.length, questions.length)).toBe(100)
  })

  it('restarts a completed game with cleared progress', () => {
    const firstFeedback = answer(startGame(), 'Hà Nội')
    const secondQuestion = transitionWordGame(firstFeedback, { type: 'NEXT_QUESTION' })
    const completed = transitionWordGame(answer(secondQuestion, 'Huế'), { type: 'NEXT_QUESTION' })
    const restarted = transitionWordGame(completed, { type: 'RESTART' })

    expect(restarted.status).toBe('answering')
    expect(restarted.context.currentIndex).toBe(0)
    expect(restarted.context.draftAnswer).toBe('')
    expect(restarted.context.results).toEqual([])
  })

  it('ignores advancing outside feedback and restarting before completion', () => {
    const answering = startGame()

    expect(transitionWordGame(answering, { type: 'NEXT_QUESTION' })).toBe(answering)
    expect(transitionWordGame(answering, { type: 'RESTART' })).toBe(answering)
  })

  it('allows selecting an arbitrary question by ID and resets draft answer', () => {
    const readyState = createWordGameState(questions)
    const selected = transitionWordGame(readyState, { type: 'SELECT_QUESTION', questionId: 'q2' })

    expect(selected.status).toBe('answering')
    expect(selected.context.currentIndex).toBe(1)
    expect(selected.context.draftAnswer).toBe('')

    const invalid = transitionWordGame(readyState, { type: 'SELECT_QUESTION', questionId: 'unknown' })
    expect(invalid).toBe(readyState)
  })

  it('allows returning to cards view from answering or feedback states', () => {
    const answering = startGame()
    const returnedFromAnswering = transitionWordGame(answering, { type: 'RETURN_TO_CARDS' })
    expect(returnedFromAnswering.status).toBe('ready')

    const feedback = answer(answering, 'Hà Nội')
    const returnedFromFeedback = transitionWordGame(feedback, { type: 'RETURN_TO_CARDS' })
    expect(returnedFromFeedback.status).toBe('ready')
  })

  it('records completedQuestionIds when answer is correct and retains it on wrong answers', () => {
    const readyState = createWordGameState(questions)
    const q1State = transitionWordGame(readyState, { type: 'SELECT_QUESTION', questionId: 'q1' })
    const q1Correct = answer(q1State, 'Hà Nội')

    expect(q1Correct.status).toBe('feedback')
    expect(q1Correct.context.completedQuestionIds).toContain('q1')

    const backToCards = transitionWordGame(q1Correct, { type: 'RETURN_TO_CARDS' })
    const q2State = transitionWordGame(backToCards, { type: 'SELECT_QUESTION', questionId: 'q2' })
    const q2Wrong = answer(q2State, 'Sai Đáp Án')

    expect(q2Wrong.status).toBe('feedback')
    expect(q2Wrong.context.completedQuestionIds).toContain('q1')
    expect(q2Wrong.context.completedQuestionIds).not.toContain('q2')
  })
})

describe('word game completion calculation', () => {
  it('returns zero for an empty bank and rounds partial completion', () => {
    expect(calculateWordGameCompletion(0, 0)).toBe(0)
    expect(calculateWordGameCompletion(1, 3)).toBe(33)
  })
})
