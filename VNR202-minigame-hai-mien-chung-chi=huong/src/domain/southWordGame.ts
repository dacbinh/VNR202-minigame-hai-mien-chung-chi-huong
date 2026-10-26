import { normalizeAnswer } from './gameRules'

export interface WordQuestion {
  id: string
  prompt: string
  expectedAnswer: string
}

export interface GameResult {
  questionId: string
  submittedAnswer: string
  correct: boolean
}

export interface GameContext {
  questions: WordQuestion[]
  currentIndex: number
  draftAnswer: string
  results: GameResult[]
}

export type GameState =
  | { status: 'ready'; context: GameContext }
  | { status: 'answering'; context: GameContext }
  | { status: 'feedback'; context: GameContext; lastResult: GameResult }
  | { status: 'completed'; context: GameContext }
  | { status: 'error'; context: GameContext; message: string }

export type GameEvent =
  | { type: 'START' }
  | { type: 'ANSWER_CHANGED'; value: string }
  | { type: 'SUBMIT_ANSWER' }
  | { type: 'NEXT_QUESTION' }
  | { type: 'RESTART' }

const wordAnswerNormalization = {
  trim: true,
  caseInsensitive: true,
  collapseWhitespace: false,
}

export const isWordAnswerCorrect = (submitted: string, expected: string) =>
  normalizeAnswer(submitted, wordAnswerNormalization)
  === normalizeAnswer(expected, wordAnswerNormalization)

const hasValidQuestionData = (question: WordQuestion) =>
  question.id.trim().length > 0
  && question.prompt.trim().length > 0
  && normalizeAnswer(question.expectedAnswer, wordAnswerNormalization).length > 0

export const createWordGameState = (questions: WordQuestion[]): GameState => {
  const context: GameContext = {
    questions: [...questions],
    currentIndex: 0,
    draftAnswer: '',
    results: [],
  }

  if (questions.some((question) => !hasValidQuestionData(question))) {
    return { status: 'error', context, message: 'Dữ liệu câu hỏi không hợp lệ.' }
  }

  return { status: 'ready', context }
}

export const transitionWordGame = (state: GameState, event: GameEvent): GameState => {
  switch (event.type) {
    case 'START': {
      if (state.status !== 'ready') return state
      if (state.context.questions.length === 0) {
        return { status: 'error', context: state.context, message: 'Không có câu hỏi để bắt đầu.' }
      }

      return {
        status: 'answering',
        context: { ...state.context, currentIndex: 0, draftAnswer: '', results: [] },
      }
    }

    case 'ANSWER_CHANGED': {
      if (state.status !== 'answering') return state
      return {
        status: 'answering',
        context: { ...state.context, draftAnswer: event.value },
      }
    }

    case 'SUBMIT_ANSWER': {
      if (state.status !== 'answering') return state

      const question = state.context.questions[state.context.currentIndex]
      if (!question) {
        return { status: 'error', context: state.context, message: 'Không tìm thấy câu hỏi hiện tại.' }
      }

      if (normalizeAnswer(state.context.draftAnswer, wordAnswerNormalization) === '') return state

      const result: GameResult = {
        questionId: question.id,
        submittedAnswer: state.context.draftAnswer,
        correct: isWordAnswerCorrect(state.context.draftAnswer, question.expectedAnswer),
      }

      return {
        status: 'feedback',
        context: { ...state.context, results: [...state.context.results, result] },
        lastResult: result,
      }
    }

    case 'NEXT_QUESTION': {
      if (state.status !== 'feedback') return state

      const nextIndex = state.context.currentIndex + 1
      if (nextIndex >= state.context.questions.length) {
        return { status: 'completed', context: state.context }
      }

      return {
        status: 'answering',
        context: { ...state.context, currentIndex: nextIndex, draftAnswer: '' },
      }
    }

    case 'RESTART': {
      if (state.status !== 'completed') return state
      if (state.context.questions.length === 0) {
        return { status: 'error', context: state.context, message: 'Không có câu hỏi để bắt đầu.' }
      }

      return {
        status: 'answering',
        context: { ...state.context, currentIndex: 0, draftAnswer: '', results: [] },
      }
    }

    default:
      return state
  }
}

export const calculateWordGameScore = (results: GameResult[]) =>
  results.filter((result) => result.correct).length

export const calculateWordGameCompletion = (completedCount: number, totalCount: number) =>
  totalCount <= 0 ? 0 : Math.round((completedCount / totalCount) * 100)