export interface MultipleChoiceOption {
  id: string
  label: string
  text: string
}

export interface MultipleChoiceQuestion {
  id: string
  prompt: string
  options: MultipleChoiceOption[]
  durationSeconds: number
  points: number
}

export type ResolutionReason = 'timeout' | 'admin_reveal' | 'admin_skip'
export type NorthGameStatus =
  | 'lobby'
  | 'question_active'
  | 'answer_revealed'
  | 'intermission'
  | 'paused'
  | 'completed'
  | 'error'

export interface AnswerRecord {
  playerId: string
  questionId: string
  selectedOptionId: string
  correct: boolean | null
  submittedAt: number
  pointsAwarded: number
}

export interface QuestionResolution {
  questionId: string
  reason: ResolutionReason
  correctOptionId: string | null
  resolvedAt: number
}

export interface PointAdjustment {
  actorId: string
  targetId: string
  amount: number
  reason: string
  requestId: string
  createdAt: number
}

export interface NorthGameContext {
  gameId: string
  questions: MultipleChoiceQuestion[]
  participantIds: string[]
  currentIndex: number
  answers: AnswerRecord[]
  resolutions: QuestionResolution[]
  pointAdjustments: PointAdjustment[]
  scores: Record<string, number>
  processedRequestIds: string[]
  questionDeadline: number | null
  feedbackDeadline: number | null
  intermissionDeadline: number | null
  feedbackDurationSeconds: number
  intermissionDurationSeconds: number
}

export type NorthGameState =
  | { status: 'lobby'; context: NorthGameContext }
  | { status: 'question_active'; context: NorthGameContext }
  | { status: 'answer_revealed'; context: NorthGameContext }
  | { status: 'intermission'; context: NorthGameContext }
  | {
      status: 'paused'
      context: NorthGameContext
      pausedFrom: 'question_active' | 'intermission'
      pausedRemainingMs: number
    }
  | { status: 'completed'; context: NorthGameContext }
  | { status: 'error'; context: NorthGameContext; message: string }

export type NorthGameEvent =
  | { type: 'ADMIN_START' }
  | { type: 'SUBMIT_ANSWER'; questionId: string; optionId: string; requestId: string }
  | { type: 'ADMIN_REVEAL_ANSWER'; correctOptionId: string }
  | { type: 'ADMIN_SKIP_QUESTION'; reason?: string }
  | { type: 'ADMIN_PAUSE' }
  | { type: 'ADMIN_RESUME' }
  | { type: 'ADMIN_SKIP_INTERMISSION' }
  | { type: 'ADMIN_GRANT_POINTS'; targetId: string; amount: number; reason: string; requestId: string }
  | { type: 'ADMIN_DEDUCT_POINTS'; targetId: string; amount: number; reason: string; requestId: string }
  | { type: 'ADMIN_END_GAME'; reason: string }
  | { type: 'ADMIN_RESTART' }
  | { type: 'TICK'; now: number }

export type NorthGameActor =
  | { role: 'admin'; id: string }
  | { role: 'player'; id: string }

export interface NorthGameConfig {
  feedbackDurationSeconds: number
  intermissionDurationSeconds: number
}

const defaultConfig: NorthGameConfig = {
  feedbackDurationSeconds: 2,
  intermissionDurationSeconds: 3,
}

export const validateMultipleChoiceQuestions = (questions: MultipleChoiceQuestion[]): string | null => {
  if (questions.length === 0) return 'Không có câu hỏi để bắt đầu.'

  const questionIds = new Set<string>()
  for (const question of questions) {
    if (!question.id.trim() || questionIds.has(question.id)) return 'Mã câu hỏi bị trống hoặc trùng lặp.'
    questionIds.add(question.id)

    if (!question.prompt.trim()) return 'Nội dung câu hỏi không được để trống.'
    if (question.options.length < 2 || question.options.length > 4) {
      return 'Mỗi câu hỏi cần có từ 2 đến 4 lựa chọn.'
    }
    if (!Number.isFinite(question.durationSeconds) || question.durationSeconds <= 0) {
      return 'Thời lượng câu hỏi phải lớn hơn 0.'
    }
    if (!Number.isInteger(question.points) || question.points <= 0) {
      return 'Điểm câu hỏi phải là số nguyên dương.'
    }

    const optionIds = new Set<string>()
    for (const option of question.options) {
      if (!option.id.trim() || optionIds.has(option.id)) return 'Mã lựa chọn bị trống hoặc trùng lặp.'
      if (!option.label.trim() || !option.text.trim()) return 'Nhãn và nội dung lựa chọn không được để trống.'
      optionIds.add(option.id)
    }
  }

  return null
}

const makeContext = (
  questions: MultipleChoiceQuestion[],
  participantIds: string[],
  config: NorthGameConfig,
): NorthGameContext => ({
  gameId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
  questions: questions.map((question) => ({
    ...question,
    options: question.options.map((option) => ({ ...option })),
  })),
  participantIds: [...new Set(participantIds)],
  currentIndex: 0,
  answers: [],
  resolutions: [],
  pointAdjustments: [],
  scores: Object.fromEntries(participantIds.map((playerId) => [playerId, 0])),
  processedRequestIds: [],
  questionDeadline: null,
  feedbackDeadline: null,
  intermissionDeadline: null,
  feedbackDurationSeconds: config.feedbackDurationSeconds,
  intermissionDurationSeconds: config.intermissionDurationSeconds,
})

export const createNorthGameState = (
  questions: MultipleChoiceQuestion[],
  participantIds: string[],
  config: NorthGameConfig = defaultConfig,
): NorthGameState => {
  const context = makeContext(questions, participantIds, config)
  const validationError = validateMultipleChoiceQuestions(questions)
  if (validationError) return { status: 'error', context, message: validationError }
  if (participantIds.length === 0) {
    return { status: 'error', context, message: 'Cần có ít nhất một người chơi để bắt đầu.' }
  }
  if (!Number.isFinite(config.feedbackDurationSeconds) || config.feedbackDurationSeconds < 0
    || !Number.isFinite(config.intermissionDurationSeconds) || config.intermissionDurationSeconds < 0) {
    return { status: 'error', context, message: 'Thời lượng chuyển câu hỏi không hợp lệ.' }
  }

  return { status: 'lobby', context }
}

const isAdmin = (actor: NorthGameActor) => actor.role === 'admin'

const advanceToNextQuestion = (context: NorthGameContext, now: number): NorthGameState => {
  const nextIndex = context.currentIndex + 1
  if (nextIndex >= context.questions.length) return { status: 'completed', context }

  const nextContext = {
    ...context,
    currentIndex: nextIndex,
    questionDeadline: now + context.questions[nextIndex]!.durationSeconds * 1000,
    feedbackDeadline: null,
    intermissionDeadline: null,
  }
  return { status: 'question_active', context: nextContext }
}

const enterIntermission = (context: NorthGameContext, now: number): NorthGameState => ({
  status: 'intermission',
  context: {
    ...context,
    questionDeadline: null,
    feedbackDeadline: null,
    intermissionDeadline: now + context.intermissionDurationSeconds * 1000,
  },
})

const revealAnswer = (
  context: NorthGameContext,
  correctOptionId: string | null,
  reason: ResolutionReason,
  now: number,
): NorthGameState => {
  const question = context.questions[context.currentIndex]!
  const answers = context.answers.map((answer) => answer.questionId === question.id
    ? { ...answer, correct: correctOptionId === null ? null : answer.selectedOptionId === correctOptionId }
    : answer)
  const resolutions = context.resolutions.filter((resolution) => resolution.questionId !== question.id)
  resolutions.push({ questionId: question.id, reason, correctOptionId, resolvedAt: now })

  return {
    status: 'answer_revealed',
    context: {
      ...context,
      answers,
      resolutions,
      questionDeadline: null,
      feedbackDeadline: now + context.feedbackDurationSeconds * 1000,
      intermissionDeadline: null,
    },
  }
}

export const transitionNorthGame = (
  state: NorthGameState,
  event: NorthGameEvent,
  actor: NorthGameActor,
): NorthGameState => {
  const now = event.type === 'TICK' ? event.now : Date.now()

  switch (event.type) {
    case 'ADMIN_START': {
      if (!isAdmin(actor) || state.status !== 'lobby') return state
      const question = state.context.questions[0]
      if (!question) return { status: 'error', context: state.context, message: 'Không có câu hỏi để bắt đầu.' }
      return {
        status: 'question_active',
        context: { ...state.context, currentIndex: 0, questionDeadline: now + question.durationSeconds * 1000 },
      }
    }

    case 'SUBMIT_ANSWER': {
      if (actor.role !== 'player' || state.status !== 'question_active') return state
      const question = state.context.questions[state.context.currentIndex]
      if (!question || event.questionId !== question.id || now >= (state.context.questionDeadline ?? 0)) return state
      if (!state.context.participantIds.includes(actor.id)
        || state.context.answers.some((answer) => answer.playerId === actor.id && answer.questionId === question.id)
        || state.context.processedRequestIds.includes(event.requestId)
        || !question.options.some((option) => option.id === event.optionId)) return state

      return {
        status: 'question_active',
        context: {
          ...state.context,
          answers: [...state.context.answers, {
            playerId: actor.id,
            questionId: question.id,
            selectedOptionId: event.optionId,
            correct: null,
            submittedAt: now,
            pointsAwarded: 0,
          }],
          processedRequestIds: [...state.context.processedRequestIds, event.requestId],
        },
      }
    }

    case 'ADMIN_REVEAL_ANSWER': {
      if (!isAdmin(actor)) return state
      const question = state.context.questions[state.context.currentIndex]
      if (!question || !question.options.some((option) => option.id === event.correctOptionId)) return state

      if (state.status === 'question_active') {
        return revealAnswer(state.context, event.correctOptionId, 'admin_reveal', now)
      }
      const currentResolution = state.context.resolutions.find((resolution) => resolution.questionId === question.id)
      if (state.status === 'answer_revealed' && currentResolution?.reason === 'timeout' && !currentResolution.correctOptionId) {
        return revealAnswer(state.context, event.correctOptionId, 'timeout', now)
      }
      return state
    }

    case 'ADMIN_SKIP_QUESTION': {
      if (!isAdmin(actor) || state.status !== 'question_active') return state
      const question = state.context.questions[state.context.currentIndex]
      if (!question) return { status: 'error', context: state.context, message: 'Không tìm thấy câu hỏi hiện tại.' }
      const resolutions = state.context.resolutions.filter((resolution) => resolution.questionId !== question.id)
      resolutions.push({ questionId: question.id, reason: 'admin_skip', correctOptionId: null, resolvedAt: now })
      return enterIntermission({ ...state.context, resolutions }, now)
    }

    case 'ADMIN_PAUSE': {
      if (!isAdmin(actor) || (state.status !== 'question_active' && state.status !== 'intermission')) return state
      const deadline = state.status === 'question_active'
        ? state.context.questionDeadline
        : state.context.intermissionDeadline
      return {
        status: 'paused',
        context: { ...state.context, questionDeadline: null, intermissionDeadline: null },
        pausedFrom: state.status,
        pausedRemainingMs: Math.max(0, (deadline ?? now) - now),
      }
    }

    case 'ADMIN_RESUME': {
      if (!isAdmin(actor) || state.status !== 'paused') return state
      if (state.pausedFrom === 'question_active') {
        return {
          status: 'question_active',
          context: { ...state.context, questionDeadline: now + state.pausedRemainingMs },
        }
      }
      return {
        status: 'intermission',
        context: { ...state.context, intermissionDeadline: now + state.pausedRemainingMs },
      }
    }

    case 'ADMIN_SKIP_INTERMISSION':
      return isAdmin(actor) && state.status === 'intermission'
        ? advanceToNextQuestion(state.context, now)
        : state

    case 'ADMIN_GRANT_POINTS':
    case 'ADMIN_DEDUCT_POINTS': {
      if (!isAdmin(actor) || state.status === 'lobby' || state.status === 'completed' || state.status === 'error') return state
      if (!state.context.participantIds.includes(event.targetId)
        || !Number.isInteger(event.amount) || event.amount <= 0
        || !event.reason.trim() || !event.requestId
        || state.context.processedRequestIds.includes(event.requestId)) return state

      const amount = event.type === 'ADMIN_GRANT_POINTS' ? event.amount : -event.amount
      if ((state.context.scores[event.targetId] ?? 0) + amount < 0) return state
      return {
        status: state.status,
        context: {
          ...state.context,
          scores: { ...state.context.scores, [event.targetId]: (state.context.scores[event.targetId] ?? 0) + amount },
          pointAdjustments: [...state.context.pointAdjustments, {
            actorId: actor.id,
            targetId: event.targetId,
            amount,
            reason: event.reason.trim(),
            requestId: event.requestId,
            createdAt: now,
          }],
          processedRequestIds: [...state.context.processedRequestIds, event.requestId],
        },
        ...('pausedFrom' in state ? { pausedFrom: state.pausedFrom, pausedRemainingMs: state.pausedRemainingMs } : {}),
      } as NorthGameState
    }

    case 'ADMIN_END_GAME':
      return isAdmin(actor) && state.status !== 'completed' && state.status !== 'error'
        ? { status: 'completed', context: state.context }
        : state

    case 'ADMIN_RESTART': {
      if (!isAdmin(actor) || state.status !== 'completed') return state
      const context = makeContext(state.context.questions, state.context.participantIds, {
        feedbackDurationSeconds: state.context.feedbackDurationSeconds,
        intermissionDurationSeconds: state.context.intermissionDurationSeconds,
      })
      return { status: 'lobby', context: { ...context, gameId: state.context.gameId } }
    }

    case 'TICK': {
      if (state.status === 'question_active' && state.context.questionDeadline !== null
        && now >= state.context.questionDeadline) {
        return revealAnswer(state.context, null, 'timeout', now)
      }
      if (state.status === 'answer_revealed' && state.context.feedbackDeadline !== null
        && now >= state.context.feedbackDeadline) {
        return enterIntermission(state.context, now)
      }
      if (state.status === 'intermission' && state.context.intermissionDeadline !== null
        && now >= state.context.intermissionDeadline) {
        return advanceToNextQuestion(state.context, now)
      }
      return state
    }

    default:
      return state
  }
}