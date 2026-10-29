import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getTeamMemberCount, type LobbyMember, type LobbyTeam } from './domain/lobbyRules'
import {
  createNorthGameState,
  isNorthOptionCorrect,
  transitionNorthGame,
  type MultipleChoiceQuestion,
  type NorthGameActor,
  type NorthGameEvent,
  type NorthGameState,
} from './domain/northMultipleChoice'
import {
  calculateWordGameCompletion,
  createWordGameState,
  getWordAnswerPattern,
  transitionWordGame,
  type GameState as SouthWordGameState,
  type WordQuestion,
} from './domain/southWordGame'
import { applySouthUnlock } from './domain/southUnlockRules'
import {
  closeRoomChannel,
  connectPlayerToRoom,
  createHostRoom,
  getRoomServiceErrorMessage,
  loadQuestionBank,
  loadQuestionAnswerKeys,
  sendRoomEvent,
  type BankQuestion,
  type RoomMessage,
  type SouthPlayerProgress,
  type SouthWallet,
} from './lib/roomService'
import { hasSupabaseConfig } from './lib/supabase'
import './App.css'

type AppMode = 'player' | 'admin'
type PlayerStep = 'join' | 'team' | 'waiting'
type SessionStatus = 'waiting' | 'active' | 'paused'

const teamNames: Record<LobbyTeam, string> = {
  north: 'Miền Bắc',
  south: 'Miền Nam',
}

const adminActor: NorthGameActor = { role: 'admin', id: 'host' }
const multipleChoiceLabels = ['A', 'B', 'C', 'D']

type SouthAnswerInputProps = {
  answerPattern: number[]
  value: string
  onChange: (answer: string) => void
}

const SouthAnswerInput = ({ answerPattern, value, onChange }: SouthAnswerInputProps) => {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])
  const characters = Array.from(value.normalize('NFC').replace(/\s+/g, ''))
  const slotCount = answerPattern.reduce((total, wordLength) => total + wordLength, 0)

  const updateCharacter = (slotIndex: number, rawValue: string) => {
    const enteredCharacters = Array.from(rawValue.normalize('NFC'))
      .filter((character) => !/\s/u.test(character))
    const nextCharacters = Array.from({ length: slotCount }, (_, index) => characters[index] ?? '')

    if (enteredCharacters.length === 0) {
      nextCharacters[slotIndex] = ''
    } else {
      enteredCharacters.forEach((character, offset) => {
        if (slotIndex + offset < slotCount) nextCharacters[slotIndex + offset] = character
      })
    }

    let characterOffset = 0
    const answer = answerPattern
      .map((wordLength) => {
        const word = nextCharacters.slice(characterOffset, characterOffset + wordLength).join('')
        characterOffset += wordLength
        return word
      })
      .join(' ')
    onChange(answer)

    const nextSlot = slotIndex + enteredCharacters.length
    if (enteredCharacters.length > 0 && nextSlot < slotCount) inputRefs.current[nextSlot]?.focus()
  }

  let slotIndex = 0

  return (
    <div className="south-answer-inputs" role="group" aria-label="Nhập đáp án theo từng ký tự">
      {answerPattern.map((wordLength, wordIndex) => {
        const wordStart = slotIndex
        slotIndex += wordLength

        return (
          <div className="south-answer-input-group" key={`${wordIndex}-${wordLength}`}>
            {Array.from({ length: wordLength }, (_, characterIndex) => {
              const currentSlot = wordStart + characterIndex

              return (
                <input
                  aria-label={`Ký tự ${currentSlot + 1}`}
                  autoCapitalize="none"
                  autoComplete="off"
                  className="south-answer-symbol"
                  key={currentSlot}
                  onChange={(event) => updateCharacter(currentSlot, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Backspace' && !characters[currentSlot] && currentSlot > 0) {
                      inputRefs.current[currentSlot - 1]?.focus()
                    }
                  }}
                  ref={(element) => { inputRefs.current[currentSlot] = element }}
                  value={characters[currentSlot] ?? ''}
                />
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

const getNorthMultipleChoiceQuestions = (bankQuestions: BankQuestion[]): MultipleChoiceQuestion[] =>
  bankQuestions
    .filter((question) => question.owner_team === 'north' && question.kind === 'multiple_choice')
    .map((question) => ({
      id: question.id,
      prompt: question.prompt,
      options: question.choices.map((text, index) => ({
        id: `${question.id}-option-${index + 1}`,
        label: multipleChoiceLabels[index] ?? `${index + 1}`,
        text,
      })),
      durationSeconds: question.duration_seconds,
      points: question.points,
    }))

const getSouthWordQuestions = (
  bankQuestions: BankQuestion[],
  answerKeys: Record<string, string>,
): WordQuestion[] => bankQuestions
  .filter((question) => question.owner_team === 'south' && question.kind === 'fill_blank')
  .map((question) => ({
    id: question.id,
    prompt: question.prompt,
    expectedAnswer: answerKeys[question.id] ?? '',
    unlockCost: question.unlock_cost,
    answerPattern: getWordAnswerPattern(answerKeys[question.id] ?? ''),
  }))

const getPublicSouthGameSnapshot = (game: SouthWordGameState | null, unlockedQuestionIds: string[]) =>
  game
    ? {
        ...game,
        context: {
          ...game.context,
          questions: game.context.questions.map((question) => unlockedQuestionIds.includes(question.id)
            ? { ...question, expectedAnswer: '' }
            : { ...question, prompt: '', expectedAnswer: '', answerPattern: [] }),
        },
      }
    : null

const getPublicQuestionBankSnapshot = (bankQuestions: BankQuestion[], unlockedQuestionIds: string[]) =>
  bankQuestions.map((question) => question.owner_team === 'south'
    && question.kind === 'fill_blank'
    && !unlockedQuestionIds.includes(question.id)
    ? { ...question, prompt: '', choices: [] }
    : question)

const getPublicSouthPlayerProgress = (progress: Record<string, SouthPlayerProgress>) =>
  Object.fromEntries(Object.entries(progress).map(([playerId, playerProgress]) => [playerId, {
    ...playerProgress,
    game: getPublicSouthGameSnapshot(playerProgress.game, playerProgress.unlockedQuestionIds),
  }])) as Record<string, SouthPlayerProgress>

const getModeFromHash = (hash: string): AppMode =>
  hash.replace('#', '') === 'admin' ? 'admin' : 'player'

function App() {
  const [mode, setMode] = useState<AppMode>(() =>
    typeof window === 'undefined' ? 'player' : getModeFromHash(window.location.hash),
  )
  const [playerStep, setPlayerStep] = useState<PlayerStep>('join')
  const [createdRoomCode, setCreatedRoomCode] = useState('')
  const [enteredRoomCode, setEnteredRoomCode] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [joinError, setJoinError] = useState('')
  const [adminError, setAdminError] = useState('')
  const [isCreatingRoom, setIsCreatingRoom] = useState(false)
  const [isCheckingRoom, setIsCheckingRoom] = useState(false)
  const [isJoiningTeam, setIsJoiningTeam] = useState(false)
  const [pendingPlayer, setPendingPlayer] = useState<LobbyMember | null>(null)
  const [players, setPlayers] = useState<LobbyMember[]>([])
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('waiting')
  const [questions, setQuestions] = useState<BankQuestion[]>([])
  const [answerKeys, setAnswerKeys] = useState<Record<string, string>>({})
  const [northGame, setNorthGame] = useState<NorthGameState | null>(null)
  const [southGame, setSouthGame] = useState<SouthWordGameState | null>(null)
  const [southWallet, setSouthWallet] = useState<SouthWallet>({ balance: 0, lastAid: 0, unlockedQuestionIds: [] })
  const [southPlayerProgress, setSouthPlayerProgress] = useState<Record<string, SouthPlayerProgress>>({})
  const [aidNotification, setAidNotification] = useState<number | null>(null)
  const [selectedOptionId, setSelectedOptionId] = useState('')
  const [southDraftAnswer, setSouthDraftAnswer] = useState('')
  const [clockNow, setClockNow] = useState(() => Date.now())
  const hostChannelRef = useRef<RealtimeChannel | null>(null)
  const playerChannelRef = useRef<RealtimeChannel | null>(null)
  const playersRef = useRef<LobbyMember[]>([])
  const pendingPlayerRef = useRef<LobbyMember | null>(null)
  const sessionStatusRef = useRef<SessionStatus>('waiting')
  const questionNumberRef = useRef(1)
  const questionsRef = useRef<BankQuestion[]>([])
  const northGameRef = useRef<NorthGameState | null>(null)
  const southGameRef = useRef<SouthWordGameState | null>(null)
  const southWalletRef = useRef<SouthWallet>({ balance: 0, lastAid: 0, unlockedQuestionIds: [] })
  const southPlayerProgressRef = useRef<Record<string, SouthPlayerProgress>>({})
  const answerKeysRef = useRef<Record<string, string>>({})
  const pendingJoinRef = useRef<{
    requestId: string
    resolve: () => void
    reject: (error: Error) => void
  } | null>(null)

  useEffect(() => {
    const handleHashChange = () => setMode(getModeFromHash(window.location.hash))

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => {
    if (southWallet.lastAid > 0) {
      setAidNotification(southWallet.lastAid)
      const timer = window.setTimeout(() => {
        setAidNotification(null)
      }, 2500)
      return () => window.clearTimeout(timer)
    }
  }, [southWallet.balance, southWallet.lastAid])

  useEffect(() => () => {
    void closeRoomChannel(hostChannelRef.current)
    void closeRoomChannel(playerChannelRef.current)
  }, [])

  useEffect(() => {
    if (mode !== 'admin' || northGame?.status !== 'question_active'
      && northGame?.status !== 'answer_revealed' && northGame?.status !== 'intermission') return

    const timer = window.setInterval(() => {
      const currentGame = northGameRef.current
      if (!currentGame) return
      const currentQuestion = currentGame.status === 'question_active'
        ? currentGame.context.questions[currentGame.context.currentIndex]
        : undefined
      const correctAnswer = currentQuestion ? answerKeysRef.current[currentQuestion.id] : undefined
      const correctOptionId = currentQuestion && correctAnswer
        ? currentQuestion.options.find((option) => isNorthOptionCorrect(option.text, correctAnswer))?.id
        : undefined
      const nextGame = transitionNorthGame(currentGame, {
        type: 'TICK',
        now: Date.now(),
        correctOptionId,
      }, adminActor)
      if (nextGame === currentGame) return

      northGameRef.current = nextGame
      setNorthGame(nextGame)
      const nextStatus = nextGame.status === 'question_active' ? 'active' : 'waiting'
      sessionStatusRef.current = nextStatus
        setSessionStatus(nextStatus)
      questionNumberRef.current = nextGame.context.currentIndex + 1
      const channel = hostChannelRef.current
      if (channel) {
        void sendRoomEvent(channel, {
          type: 'room-state',
          state: {
            players: playersRef.current,
            status: nextStatus,
            questionNumber: questionNumberRef.current,
            questions: getPublicQuestionBankSnapshot(questionsRef.current, southWalletRef.current.unlockedQuestionIds),
            southWallet: southWalletRef.current,
            northGame: nextGame,
            southGame: getPublicSouthGameSnapshot(southGameRef.current, southWalletRef.current.unlockedQuestionIds),
            southPlayerProgress: getPublicSouthPlayerProgress(southPlayerProgressRef.current),
          },
        })
      }
    }, 250)

    return () => window.clearInterval(timer)
  }, [mode, northGame?.status])

  useEffect(() => {
    if (northGame?.status !== 'question_active' && northGame?.status !== 'answer_revealed'
      && northGame?.status !== 'intermission') return

    const timer = window.setInterval(() => setClockNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [northGame?.status])

  const navigate = (nextMode: AppMode) => {
    window.history.replaceState(null, '', `#${nextMode}`)
    setMode(nextMode)
  }

  const broadcastHostState = (overrides: Partial<NonNullable<RoomMessage['state']>> = {}) => {
    const channel = hostChannelRef.current
    if (!channel) return

    return sendRoomEvent(channel, {
      type: 'room-state',
      state: {
        players: playersRef.current,
        status: sessionStatusRef.current,
        questionNumber: questionNumberRef.current,
        questions: getPublicQuestionBankSnapshot(questionsRef.current, southWalletRef.current.unlockedQuestionIds),
        southWallet: southWalletRef.current,
        northGame: northGameRef.current,
        southGame: getPublicSouthGameSnapshot(southGameRef.current, southWalletRef.current.unlockedQuestionIds),
        southPlayerProgress: getPublicSouthPlayerProgress(southPlayerProgressRef.current),
        ...overrides,
      },
    })
  }

  const startBothGames = () => {
    const northQuestions = getNorthMultipleChoiceQuestions(questionsRef.current)
    const southQuestions = getSouthWordQuestions(questionsRef.current, answerKeysRef.current)
    const missingAnswer = [...northQuestions, ...southQuestions].some((question) => {
      const answer = answerKeysRef.current[question.id]
      return !answer || ('options' in question
        ? !question.options.some((option) => isNorthOptionCorrect(option.text, answer))
        : false)
    })
    if (missingAnswer) {
      setAdminError('Thiếu đáp án trong ngân hàng cho ít nhất một câu hỏi.')
      return
    }
    if (southQuestions.some((question) => question.unlockCost <= 0)) {
      setAdminError('Mỗi câu hỏi Miền Nam cần có giá mở khóa lớn hơn 0.')
      return
    }

    const northLobby = createNorthGameState(
      northQuestions,
      playersRef.current
        .filter((player) => player.team === 'north')
        .map((player) => player.profileId),
    )
    const southReady = createWordGameState(southQuestions)

    if (northLobby.status !== 'lobby' || southReady.status !== 'ready'
      || southCount === 0 || northCount === 0) {
      const message = northLobby.status === 'error'
        ? northLobby.message
        : southReady.status === 'error'
          ? southReady.message
          : 'Cần ít nhất một người chơi cho mỗi đội.'
      setAdminError(message)
      return
    }

    const nextNorth = transitionNorthGame(northLobby, { type: 'ADMIN_START' }, adminActor)
    const nextSouth = southReady
    const southProgress = Object.fromEntries(playersRef.current
      .filter((player) => player.team === 'south')
      .map((player) => [player.profileId, {
        game: nextSouth,
        walletBalance: 0,
        lastAid: 0,
        unlockedQuestionIds: [],
        completedQuestionIds: [],
      }])) as Record<string, SouthPlayerProgress>
    const emptyWallet: SouthWallet = {
      balance: 0,
      lastAid: 0,
      unlockedQuestionIds: [],
      completedQuestionIds: [],
    }
    southWalletRef.current = emptyWallet
    southPlayerProgressRef.current = southProgress
    setSouthPlayerProgress(southProgress)
    setSouthWallet(emptyWallet)
    northGameRef.current = nextNorth
    southGameRef.current = nextSouth
    setNorthGame(nextNorth)
    setSouthGame(nextSouth)
    sessionStatusRef.current = 'active'
    setSessionStatus('active')
    void broadcastHostState({
      northGame: nextNorth,
      southGame: getPublicSouthGameSnapshot(nextSouth, emptyWallet.unlockedQuestionIds),
      southWallet: emptyWallet,
      southPlayerProgress: getPublicSouthPlayerProgress(southProgress),
      status: 'active',
    })
  }

  const submitNorthAnswer = async () => {
    const currentQuestion = northGame?.context.questions[northGame.context.currentIndex]
    const player = pendingPlayer
    const channel = playerChannelRef.current
    if (!currentQuestion || !player || !channel || !selectedOptionId || northGame?.status !== 'question_active') return

    try {
      await sendRoomEvent(channel, {
        type: 'north-answer',
        requestId: globalThis.crypto.randomUUID(),
        playerId: player.profileId,
        questionId: currentQuestion.id,
        optionId: selectedOptionId,
      })
    } catch (error) {
      setJoinError(getRoomServiceErrorMessage(error, 'Không gửi được câu trả lời.'))
    }
  }

  const submitSouthAnswer = async () => {
    const game = southGame
    const question = game?.status === 'answering'
      ? game.context.questions[game.context.currentIndex]
      : undefined
    const player = pendingPlayer
    const channel = playerChannelRef.current
    if (!question || !player || player.team !== 'south' || !channel || !southDraftAnswer.trim()) return

    try {
      await sendRoomEvent(channel, {
        type: 'south-answer',
        requestId: globalThis.crypto.randomUUID(),
        playerId: player.profileId,
        questionId: question.id,
        answer: southDraftAnswer,
      })
    } catch (error) {
      setJoinError(getRoomServiceErrorMessage(error, 'Không gửi được câu trả lời.'))
    }
  }

  const requestSouthUnlock = async (questionId: string) => {
    const player = pendingPlayer
    const channel = playerChannelRef.current
    if (!player || player.team !== 'south' || !channel) return

    try {
      await sendRoomEvent(channel, {
        type: 'south-unlock',
        requestId: globalThis.crypto.randomUUID(),
        playerId: player.profileId,
        questionId,
      })
    } catch (error) {
      setJoinError(getRoomServiceErrorMessage(error, 'Không thể mở khóa câu hỏi.'))
    }
  }

  const returnSouthToCards = async () => {
    const player = pendingPlayer
    const channel = playerChannelRef.current
    if (!player || player.team !== 'south' || !channel) return

    try {
      await sendRoomEvent(channel, {
        type: 'south-return-cards',
        requestId: globalThis.crypto.randomUUID(),
        playerId: player.profileId,
      })
    } catch (error) {
      setJoinError(getRoomServiceErrorMessage(error, 'Không thể quay lại màn hình chọn câu hỏi.'))
    }
  }

  const dispatchNorthGame = (event: NorthGameEvent, actor: NorthGameActor = adminActor) => {
    const currentGame = northGameRef.current
    if (!currentGame) return

    const nextGame = transitionNorthGame(currentGame, event, actor)
    if (nextGame === currentGame) return

    let updatedWallet = southWalletRef.current
    if (event.type === 'SUBMIT_ANSWER' && actor.role === 'player'
      && !currentGame.context.answers.some((answer) =>
        answer.playerId === actor.id && answer.questionId === event.questionId)) {
      const awardedPoints = nextGame.context.answers.find((answer) =>
        answer.playerId === actor.id && answer.questionId === event.questionId)?.pointsAwarded ?? 0
      if (awardedPoints > 0) {
        const nextProgress = Object.fromEntries(Object.entries(southPlayerProgressRef.current).map(([playerId, progress]) => [playerId, {
          ...progress,
          walletBalance: progress.walletBalance + awardedPoints,
          lastAid: awardedPoints,
        }])) as Record<string, SouthPlayerProgress>
        const newTotalBalance = Object.values(nextProgress).reduce((total, progress) => total + progress.walletBalance, 0)
        updatedWallet = { ...updatedWallet, balance: newTotalBalance, lastAid: awardedPoints }
        southPlayerProgressRef.current = nextProgress
        setSouthPlayerProgress(nextProgress)
        southWalletRef.current = updatedWallet
        setSouthWallet(updatedWallet)
      }
    }

    northGameRef.current = nextGame
    setNorthGame(nextGame)
    const nextSessionStatus = nextGame.status === 'question_active' || southGameRef.current?.status === 'answering'
      ? 'active'
      : nextGame.status === 'paused'
        ? 'paused'
        : 'waiting'
    sessionStatusRef.current = nextSessionStatus
    setSessionStatus(nextSessionStatus)
    questionNumberRef.current = nextGame.context.currentIndex + 1
    void broadcastHostState({
      northGame: nextGame,
      southWallet: updatedWallet,
      status: nextSessionStatus,
      questionNumber: questionNumberRef.current,
    })
  }

  const dispatchSouthGame = (event: Parameters<typeof transitionWordGame>[1]) => {
    const currentGame = southGameRef.current
    if (!currentGame) return

    const nextGame = transitionWordGame(currentGame, event)
    if (nextGame === currentGame) return

    southGameRef.current = nextGame
    setSouthGame(nextGame)
    const nextSessionStatus = northGameRef.current?.status === 'question_active' || nextGame.status === 'answering'
      ? 'active'
      : northGameRef.current?.status === 'paused'
        ? 'paused'
        : 'waiting'
    sessionStatusRef.current = nextSessionStatus
    setSessionStatus(nextSessionStatus)
    void broadcastHostState({
      southGame: getPublicSouthGameSnapshot(nextGame, southWalletRef.current.unlockedQuestionIds),
      status: nextSessionStatus,
    })
  }

  const handleHostMessage = (message: RoomMessage) => {
    const channel = hostChannelRef.current
    if (!channel) return

    if (message.type === 'south-answer' && message.playerId && message.questionId
      && typeof message.answer === 'string'
      && playersRef.current.some((player) => player.profileId === message.playerId && player.team === 'south')) {
      const playerProgress = southPlayerProgressRef.current[message.playerId]
      const currentGame = playerProgress?.game
      const question = currentGame?.status === 'answering'
        ? currentGame.context.questions[currentGame.context.currentIndex]
        : undefined
      if (!currentGame || !question || question.id !== message.questionId) return
      if (!playerProgress.unlockedQuestionIds.includes(question.id)) return

      const withDraft = transitionWordGame(currentGame, { type: 'ANSWER_CHANGED', value: message.answer })
      const nextGame = transitionWordGame(withDraft, { type: 'SUBMIT_ANSWER' })
      if (nextGame !== currentGame && nextGame.status === 'feedback') {
        const nextPlayerProgress = {
          ...playerProgress,
          game: nextGame,
          completedQuestionIds: nextGame.lastResult.correct
            ? [...new Set([...playerProgress.completedQuestionIds, question.id])]
            : playerProgress.completedQuestionIds,
        }
        const nextProgress = { ...southPlayerProgressRef.current, [message.playerId]: nextPlayerProgress }
        const nextCompleted = [...new Set(Object.values(nextProgress).flatMap((item) => item.completedQuestionIds))]
        const nextWallet = { ...southWalletRef.current, completedQuestionIds: nextCompleted }
        southPlayerProgressRef.current = nextProgress
        setSouthPlayerProgress(nextProgress)
        southWalletRef.current = nextWallet
        setSouthWallet(nextWallet)
        void broadcastHostState({
          southPlayerProgress: getPublicSouthPlayerProgress(nextProgress),
          southWallet: nextWallet,
          status: northGameRef.current?.status === 'question_active'
            || Object.values(nextProgress).some((item) => item.game.status === 'answering') ? 'active' : 'waiting',
        })
      }
      return
    }

    if (message.type === 'south-unlock' && message.playerId && message.questionId
      && message.requestId
      && playersRef.current.some((player) => player.profileId === message.playerId && player.team === 'south')) {
      const playerProgress = southPlayerProgressRef.current[message.playerId]
      const currentGame = playerProgress?.game
      if (!currentGame) return

      const question = currentGame.context.questions.find((q) => q.id === message.questionId)
      if (!question) return

      const unlock = applySouthUnlock({
        southTeamPoints: playerProgress.walletBalance,
        unlockCost: question.unlockCost,
        questionId: question.id,
        unlockedQuestionIds: playerProgress.unlockedQuestionIds,
        sessionActive: true,
      })
      if (!unlock.allowed) return

      const nextGame = transitionWordGame(currentGame, { type: 'SELECT_QUESTION', questionId: question.id })
      if (nextGame.status !== 'answering') return

      const nextPlayerProgress = {
        ...playerProgress,
        game: nextGame,
        walletBalance: unlock.updatedPoints,
        unlockedQuestionIds: [...new Set([...playerProgress.unlockedQuestionIds, question.id])],
      }
      const nextProgress = { ...southPlayerProgressRef.current, [message.playerId]: nextPlayerProgress }
      const newTotalBalance = Object.values(nextProgress).reduce((total, progress) => total + progress.walletBalance, 0)
      const nextWallet = { ...southWalletRef.current, balance: newTotalBalance }
      southWalletRef.current = nextWallet
      southPlayerProgressRef.current = nextProgress
      setSouthPlayerProgress(nextProgress)
      setSouthWallet(nextWallet)
      void broadcastHostState({
        southPlayerProgress: getPublicSouthPlayerProgress(nextProgress),
        southWallet: nextWallet,
        status: northGameRef.current?.status === 'question_active' ? 'active' : 'waiting',
      })
      return
    }

    if (message.type === 'south-return-cards' && message.playerId
      && playersRef.current.some((player) => player.profileId === message.playerId && player.team === 'south')) {
      const playerProgress = southPlayerProgressRef.current[message.playerId]
      const currentGame = playerProgress?.game
      if (!currentGame) return

      const nextGame = transitionWordGame(currentGame, { type: 'RETURN_TO_CARDS' })
      const nextPlayerProgress = { ...playerProgress, game: nextGame, unlockedQuestionIds: [] }
      const nextProgress = { ...southPlayerProgressRef.current, [message.playerId]: nextPlayerProgress }
      southPlayerProgressRef.current = nextProgress
      setSouthPlayerProgress(nextProgress)
      void broadcastHostState({
        southPlayerProgress: getPublicSouthPlayerProgress(nextProgress),
        status: northGameRef.current?.status === 'question_active' ? 'active' : 'waiting',
      })
      return
    }

    if (message.type === 'north-answer' && message.playerId && message.questionId
      && message.optionId && message.requestId
      && playersRef.current.some((player) => player.profileId === message.playerId)) {
      const currentGame = northGameRef.current
      const question = currentGame?.status === 'question_active'
        ? currentGame.context.questions[currentGame.context.currentIndex]
        : undefined
      const selectedOption = question?.options.find((option) => option.id === message.optionId)
      const answerKey = question ? answerKeysRef.current[question.id] : undefined

      if (!question || !selectedOption || !answerKey) {
        setAdminError('Không thể kiểm tra đáp án; hãy kiểm tra dữ liệu ngân hàng Miền Bắc.')
        return
      }

      dispatchNorthGame({
        type: 'SUBMIT_ANSWER',
        questionId: message.questionId,
        optionId: message.optionId,
        requestId: message.requestId,
        isCorrect: isNorthOptionCorrect(selectedOption.text, answerKey),
      }, { role: 'player', id: message.playerId })
      return
    }

    if (message.type === 'room-probe' && message.requestId) {
      void sendRoomEvent(channel, { type: 'room-found', requestId: message.requestId })
      void broadcastHostState()
      return
    }

    if (message.type === 'join-request' && message.requestId && northGameRef.current
      && northGameRef.current.status !== 'lobby') {
      void sendRoomEvent(channel, {
        type: 'join-rejected',
        requestId: message.requestId,
        errorMessage: 'Trận đã bắt đầu, chủ phòng không nhận thêm người chơi.',
      })
      return
    }

    if (message.type !== 'join-request' || !message.player) return

    const nextPlayers = [
      ...playersRef.current.filter((player) => player.profileId !== message.player?.profileId),
      message.player,
    ]
    playersRef.current = nextPlayers
    setPlayers(nextPlayers)

    void (async () => {
      await broadcastHostState({ players: nextPlayers })
      if (message.requestId) {
        await sendRoomEvent(channel, { type: 'join-accepted', requestId: message.requestId })
      }
    })()
  }

  const handlePlayerMessage = (message: RoomMessage) => {
    if (message.type === 'room-state' && message.state) {
      playersRef.current = message.state.players
      sessionStatusRef.current = message.state.status
      questionNumberRef.current = message.state.questionNumber
      questionsRef.current = message.state.questions
      setPlayers(message.state.players)
      setSessionStatus(message.state.status)
      setQuestions(message.state.questions)
      if (message.state.northGame !== undefined) {
        const currentGame = northGameRef.current
        if (message.state.northGame && currentGame
          && message.state.northGame.context.currentIndex !== currentGame.context.currentIndex) {
          setSelectedOptionId('')
        }
        northGameRef.current = message.state.northGame
        setNorthGame(message.state.northGame)
      }
      if (message.state.southGame !== undefined) {
        const currentGame = southGameRef.current
        if (message.state.southGame?.status === 'answering'
          && (!currentGame || currentGame.status !== 'answering'
            || message.state.southGame.context.currentIndex !== currentGame.context.currentIndex)) {
          setSouthDraftAnswer('')
        }
        if (message.state.southGame?.status === 'ready') {
          setSouthDraftAnswer('')
        }
        southGameRef.current = message.state.southGame
        setSouthGame(message.state.southGame)
      }
      if (message.state.southPlayerProgress !== undefined) {
        const progress = message.state.southPlayerProgress
        setSouthPlayerProgress(progress)
        const currentPlayer = pendingPlayerRef.current
        const personalProgress = currentPlayer ? progress[currentPlayer.profileId] : undefined
        if (personalProgress) {
          southGameRef.current = personalProgress.game
          setSouthGame(personalProgress.game)
          if (message.state.southWallet) {
            const personalWallet = {
              ...message.state.southWallet,
              balance: personalProgress.walletBalance,
              lastAid: personalProgress.lastAid,
              unlockedQuestionIds: personalProgress.unlockedQuestionIds,
              completedQuestionIds: personalProgress.completedQuestionIds,
            }
            southWalletRef.current = personalWallet
            setSouthWallet(personalWallet)
          }
        }
      }
      if (message.state.southWallet) {
        const currentPlayer = pendingPlayerRef.current
        if (!currentPlayer || currentPlayer.team !== 'south' || !message.state.southPlayerProgress) {
          southWalletRef.current = message.state.southWallet
          setSouthWallet(message.state.southWallet)
        }
      }
    }

    const pendingJoin = pendingJoinRef.current
    if (pendingJoin && message.type === 'join-accepted' && message.requestId === pendingJoin.requestId) {
      pendingJoin.resolve()
      pendingJoinRef.current = null
    }
    if (pendingJoin && message.type === 'join-rejected' && message.requestId === pendingJoin.requestId) {
      pendingJoin.reject(new Error(message.errorMessage ?? 'Chủ phòng từ chối lượt tham gia.'))
      pendingJoinRef.current = null
    }
  }

  const handleJoinRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setJoinError('')

    const normalizedCode = enteredRoomCode.trim().toUpperCase()
    if (normalizedCode.length !== 6) {
      setJoinError('Mã phòng cần có 6 ký tự.')
      return
    }

    setIsCheckingRoom(true)
    try {
      const connection = await connectPlayerToRoom(normalizedCode, handlePlayerMessage)
      playerChannelRef.current = connection.channel
      setCreatedRoomCode(connection.roomCode)
      const nextPendingPlayer = {
        profileId: globalThis.crypto.randomUUID(),
        displayName: playerName.trim(),
        team: 'north',
        isAdmin: false,
      } satisfies LobbyMember
      pendingPlayerRef.current = nextPendingPlayer
      setPendingPlayer(nextPendingPlayer)
      setPlayerStep('team')
    } catch (error) {
      setJoinError(getRoomServiceErrorMessage(error, 'Không tìm thấy phòng đang mở với mã này.'))
    } finally {
      setIsCheckingRoom(false)
    }
  }

  const joinTeam = async (team: LobbyTeam) => {
    const channel = playerChannelRef.current
    if (!pendingPlayer || !channel) return

    setJoinError('')
    setIsJoiningTeam(true)
    const requestId = globalThis.crypto.randomUUID()
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          pendingJoinRef.current = null
          reject(new Error('Chủ phòng chưa xác nhận lượt tham gia. Vui lòng thử lại.'))
        }, 5000)
        pendingJoinRef.current = {
          requestId,
          resolve: () => {
            window.clearTimeout(timeout)
            resolve()
          },
          reject: (error) => {
            window.clearTimeout(timeout)
            reject(error)
          },
        }
        void sendRoomEvent(channel, {
          type: 'join-request',
          requestId,
          player: { ...pendingPlayer, team },
        }).catch((error: unknown) => pendingJoinRef.current?.reject(
          error instanceof Error ? error : new Error('Không gửi được yêu cầu vào phòng.'),
        ))
      })

      const joinedPlayer = { ...pendingPlayer, team }
      pendingPlayerRef.current = joinedPlayer
      setPendingPlayer(joinedPlayer)
      setPlayerStep('waiting')
    } catch (error) {
      setJoinError(getRoomServiceErrorMessage(error, 'Không thể vào phòng. Vui lòng thử lại.'))
    } finally {
      setIsJoiningTeam(false)
    }
  }

  const generateRoom = async () => {
    setAdminError('')
    setIsCreatingRoom(true)
    try {
      await closeRoomChannel(hostChannelRef.current)
      await closeRoomChannel(playerChannelRef.current)
      hostChannelRef.current = null
      playerChannelRef.current = null

      const bankQuestions = await loadQuestionBank()
      const answerQuestionIds = bankQuestions
        .filter((question) =>
          question.owner_team === 'north' && question.kind === 'multiple_choice'
          || question.owner_team === 'south' && question.kind === 'fill_blank',
        )
        .map((question) => question.id)
      const answerKeys = await loadQuestionAnswerKeys(answerQuestionIds)
      const answerKeyMap = Object.fromEntries(
        answerKeys.map((answer) => [answer.question_id, answer.correct_answer]),
      )
      answerKeysRef.current = answerKeyMap
      setAnswerKeys(answerKeyMap)
      questionsRef.current = bankQuestions
      setQuestions(bankQuestions)
      northGameRef.current = null
      setNorthGame(null)
      southGameRef.current = null
      setSouthGame(null)
      southPlayerProgressRef.current = {}
      setSouthPlayerProgress({})
      const emptyWallet: SouthWallet = { balance: 0, lastAid: 0, unlockedQuestionIds: [] }
      southWalletRef.current = emptyWallet
      setSouthWallet(emptyWallet)
      playersRef.current = []
      sessionStatusRef.current = 'waiting'
      questionNumberRef.current = bankQuestions.length > 0 ? 1 : 0

      const room = await createHostRoom(handleHostMessage)
      hostChannelRef.current = room.channel
      setCreatedRoomCode(room.roomCode)
      setPlayers([])
      setSessionStatus('waiting')
      setPlayerStep('join')
      pendingPlayerRef.current = null
      setPendingPlayer(null)
      await broadcastHostState()
    } catch (error) {
      setAdminError(getRoomServiceErrorMessage(error, 'Không thể tạo phòng. Vui lòng thử lại.'))
    } finally {
      setIsCreatingRoom(false)
    }
  }

  const northCount = getTeamMemberCount(players, 'north')
  const southCount = getTeamMemberCount(players, 'south')
  const currentNorthQuestion = northGame?.context.questions[northGame.context.currentIndex]
  const currentSouthQuestion = southGame?.context.questions[southGame.context.currentIndex]
  const personalSouthProgress = pendingPlayer?.team === 'south'
    ? southPlayerProgress[pendingPlayer.profileId]
    : undefined
  const completedSouthQuestionIds = personalSouthProgress?.completedQuestionIds
    ?? southWallet.completedQuestionIds
    ?? southGame?.context.completedQuestionIds
    ?? []
  const correctNorthOptionId = currentNorthQuestion
    ? currentNorthQuestion.options.find((option) =>
        isNorthOptionCorrect(option.text, answerKeys[currentNorthQuestion.id] ?? ''),
      )?.id
    : undefined
  const currentNorthResolution = northGame?.context.resolutions.find(
    (resolution) => resolution.questionId === currentNorthQuestion?.id,
  )
  const playerNorthAnswer = northGame?.context.answers.find(
    (answer) => answer.playerId === pendingPlayer?.profileId && answer.questionId === currentNorthQuestion?.id,
  )
  const remainingMs = northGame?.status === 'question_active'
    ? (northGame.context.questionDeadline ?? clockNow) - clockNow
    : northGame?.status === 'intermission'
      ? (northGame.context.intermissionDeadline ?? clockNow) - clockNow
      : northGame?.status === 'answer_revealed'
        ? (northGame.context.feedbackDeadline ?? clockNow) - clockNow
        : 0
  const northGameStatusLabel = northGame?.status === 'question_active'
    ? 'Câu hỏi đang mở'
    : northGame?.status === 'answer_revealed'
      ? 'Đã công bố đáp án'
      : northGame?.status === 'intermission'
        ? 'Chuyển câu hỏi'
        : northGame?.status === 'paused'
          ? 'Đã tạm dừng'
          : northGame?.status === 'completed'
            ? 'Đã hoàn thành'
            : northGame?.status === 'error'
              ? 'Cần kiểm tra'
              : 'Sảnh chờ'
  const southGameStatusLabel = Object.values(southPlayerProgress).some((progress) => progress.game.status === 'answering')
    ? 'Câu hỏi đang mở'
    : Object.values(southPlayerProgress).some((progress) => progress.game.status === 'feedback')
      ? 'Đã nhận câu trả lời'
      : Object.values(southPlayerProgress).length > 0 && Object.values(southPlayerProgress).every((progress) => progress.game.status === 'completed')
        ? 'Đã hoàn thành'
      : southGame?.status === 'ready'
        ? 'Chọn câu hỏi'
        : southGame?.status === 'error'
          ? 'Cần kiểm tra'
          : 'Sảnh chờ'
  const playerNorthStatus = northGame?.status === 'question_active'
    ? 'Trận đang diễn ra.'
    : northGame?.status === 'answer_revealed'
      ? 'Chủ phòng đang công bố kết quả câu hỏi.'
      : northGame?.status === 'intermission'
        ? 'Đang chuẩn bị câu hỏi tiếp theo.'
        : northGame?.status === 'paused'
          ? 'Trận đấu đang tạm dừng.'
          : northGame?.status === 'completed'
            ? 'Trận đấu đã kết thúc.'
            : sessionStatus === 'active'
              ? 'Trận đang diễn ra.'
              : 'Đang chờ chủ phòng bắt đầu.'
  const playerGameStatus = pendingPlayer?.team === 'south'
    ? southGame?.status === 'answering'
      ? 'Câu hỏi Miền Nam đang mở.'
      : southGame?.status === 'feedback'
        ? 'Đã ghi nhận câu trả lời Miền Nam.'
        : southGame?.status === 'completed'
          ? 'Trận Miền Nam đã hoàn thành.'
          : 'Đang chờ chủ phòng bắt đầu.'
    : playerNorthStatus
  const pageTitle = mode === 'admin'
    ? 'Phòng chờ quản trị'
    : playerStep === 'join'
      ? 'Vào phòng'
      : playerStep === 'team'
        ? 'Chọn đội'
        : 'Đã vào phòng'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="eyebrow">Tương Trợ · Bắc Nam</p>
          <h1>Hợp sức Bắc - Nam</h1>
        </div>

        <div className="mode-switch">
          <span className="mode-label">{mode === 'admin' ? 'Khu vực quản trị' : 'Khu vực người chơi'}</span>
          <button type="button" className="nav-button" onClick={() => navigate(mode === 'admin' ? 'player' : 'admin')}>
            {mode === 'admin' ? 'Giao diện người chơi' : 'Dành cho chủ phòng'}
          </button>
        </div>
      </aside>

      <main className="content-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">{mode === 'admin' ? 'Chủ phòng' : 'Người chơi'}</p>
            <h2>{pageTitle}</h2>
          </div>
          {createdRoomCode && (
            <span className="session-chip">Mã phòng: <strong>{createdRoomCode}</strong></span>
          )}
        </header>

        {mode === 'player' && playerStep === 'join' && (
          <section className="panel-card player-card">
            <p className="section-kicker">Bắt đầu hành trình</p>
            <h3>Nhập mã phòng</h3>
            <p className="muted">Nhập mã chủ phòng gửi cho bạn và tên hiển thị để vào trận.</p>
            <form className="join-form" onSubmit={handleJoinRoom}>
              <label>
                <span>Mã phòng</span>
                <input
                  autoComplete="off"
                  maxLength={6}
                  onChange={(event) => setEnteredRoomCode(event.target.value.toUpperCase())}
                  placeholder="VD: AB12CD"
                  required
                  value={enteredRoomCode}
                />
              </label>
              <label>
                <span>Tên hiển thị</span>
                <input
                  autoComplete="name"
                  maxLength={30}
                  onChange={(event) => setPlayerName(event.target.value)}
                  placeholder="Tên của bạn"
                  required
                  value={playerName}
                />
              </label>
              {joinError && <p className="form-error" role="alert">{joinError}</p>}
              <div className="action-row">
                <button className="primary-button" disabled={isCheckingRoom} type="submit">
                  {isCheckingRoom ? 'Đang kiểm tra mã…' : 'Tiếp tục'}
                </button>
              </div>
            </form>
          </section>
        )}

        {mode === 'player' && playerStep === 'team' && (
          <section className="panel-card player-card">
            <p className="section-kicker">Chào {pendingPlayer?.displayName}</p>
            <h3>Chọn đội của bạn</h3>
            <p className="muted">Bạn sẽ được xếp vào danh sách phòng chờ của đội đã chọn.</p>
            <div className="team-pick-grid">
              {(['north', 'south'] as const).map((team) => (
                <button
                  className={`team-choice ${team}`}
                  disabled={isJoiningTeam}
                  key={team}
                  onClick={() => joinTeam(team)}
                  type="button"
                >
                  <span className="team-mark" aria-hidden="true">{team === 'north' ? 'B' : 'N'}</span>
                  <strong>{teamNames[team]}</strong>
                  <span>Chọn đội này</span>
                </button>
              ))}
            </div>
            {joinError && <p className="form-error" role="alert">{joinError}</p>}
          </section>
        )}

        {mode === 'player' && playerStep === 'waiting' && pendingPlayer && (
          <section className="panel-card player-card waiting-card">
            <p className="section-kicker">Mã phòng · {createdRoomCode}</p>
            <h3>Bạn đã vào phòng</h3>
            <div className="joined-status">
              <span className="status-dot" aria-hidden="true" />
              <div>
                <strong>Đã tham gia · {teamNames[pendingPlayer.team]}</strong>
                <span>{playerGameStatus}</span>
              </div>
            </div>
            <div className="player-summary">
              <span>{pendingPlayer.displayName}</span>
              <strong>{teamNames[pendingPlayer.team]}</strong>
            </div>
            {pendingPlayer.team === 'north' && northGame && (
              <div className="question-placeholder north-question-view">
                {northGame.status === 'question_active' && currentNorthQuestion && (
                  <>
                    <div className="progress-label">
                      <strong>Câu {northGame.context.currentIndex + 1}</strong>
                      <span>Còn {Math.max(0, Math.ceil(remainingMs / 1000))} giây</span>
                    </div>
                    <p>{currentNorthQuestion.prompt}</p>
                    <div className="north-answer-options">
                      {currentNorthQuestion.options.map((option) => (
                        <button
                          aria-pressed={selectedOptionId === option.id}
                          className={selectedOptionId === option.id ? 'north-answer-option selected' : 'north-answer-option'}
                          disabled={Boolean(playerNorthAnswer)}
                          key={option.id}
                          onClick={() => setSelectedOptionId(option.id)}
                          type="button"
                        >
                          <strong>{option.label}</strong>
                          <span>{option.text}</span>
                        </button>
                      ))}
                    </div>
                    {playerNorthAnswer ? (
                      <p className={playerNorthAnswer.correct ? 'lobby-status ready' : 'lobby-status waiting'}>
                        {playerNorthAnswer.correct
                          ? `Chính xác · +${playerNorthAnswer.pointsAwarded} điểm.`
                          : 'Chưa chính xác · 0 điểm.'}
                      </p>
                    ) : (
                      <button
                        className="primary-button"
                        disabled={!selectedOptionId}
                        onClick={submitNorthAnswer}
                        type="button"
                      >
                        Gửi câu trả lời
                      </button>
                    )}
                  </>
                )}
                {northGame.status === 'answer_revealed' && (
                  <>
                    <strong>{currentNorthResolution?.reason === 'timeout' ? 'Đã hết thời gian' : 'Đáp án đã công bố'}</strong>
                    {currentNorthResolution?.correctOptionId
                      ? <p>Đáp án đúng: {currentNorthQuestion?.options.find((option) => option.id === currentNorthResolution.correctOptionId)?.text}</p>
                      : <p>Chủ phòng đang xác nhận đáp án.</p>}
                  </>
                )}
                {northGame.status === 'intermission' && (
                  <p>Câu tiếp theo sau {Math.max(0, Math.ceil(remainingMs / 1000))} giây.</p>
                )}
                {northGame.status === 'paused' && <p>Trận đấu đang tạm dừng.</p>}
                {northGame.status === 'completed' && <p>Trận đấu đã kết thúc.</p>}
                <p>Điểm của bạn: {northGame.context.scores[pendingPlayer.profileId] ?? 0}</p>
              </div>
            )}
            {pendingPlayer.team === 'south' && southGame && (
              <div className="south-player-container">
                <div className="south-hud panel-card">
                  <div className="south-hud-row">
                    <div>
                      <p className="section-kicker">Mặt trận Miền Nam — Tiền tuyến</p>
                      <h3>Giải mã mật mã</h3>
                    </div>
                    <div className="south-points-badge">
                      <span>Điểm viện trợ Miền Bắc</span>
                      <strong>{southWallet.balance} điểm</strong>
                    </div>
                  </div>
                  {aidNotification !== null && (
                    <p className="lobby-status ready aid-notice">+{aidNotification} điểm viện trợ vừa chuyển từ Miền Bắc</p>
                  )}
                  <div className="south-progress-bar-container">
                    <div className="south-progress-label">
                      <span>Tiến độ hoàn thành:</span>
                      <strong>{completedSouthQuestionIds.length} / {southGame.context.questions.length} câu</strong>
                    </div>
                    <div className="south-progress-track">
                      <div
                        className="south-progress-fill"
                        style={{
                          width: `${calculateWordGameCompletion(completedSouthQuestionIds.length, southGame.context.questions.length)}%`
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* 1. SELECTION SCREEN (CARDS) */}
                {southGame.status === 'ready' && (
                  <div className="south-cards-section">
                    <div className="south-cards-heading">
                      <h4>Chọn mật mã câu hỏi</h4>
                      <p>Dùng điểm viện trợ từ Miền Bắc để mở khóa mật mã. Trả lời đúng để ghi nhận hoàn thành. Nếu trả lời sai, mật mã sẽ ẩn lại và điểm bị tiêu hao.</p>
                    </div>

                    <div className="south-cards-grid">
                      {southGame.context.questions.map((question, index) => {
                        const isCompleted = completedSouthQuestionIds.includes(question.id)
                        const canAfford = southWallet.balance >= question.unlockCost
                        const missingPoints = Math.max(0, question.unlockCost - southWallet.balance)

                        return (
                          <div
                            key={question.id}
                            className={`south-card ${isCompleted ? 'completed' : 'locked'}`}
                          >
                            <div className="south-card-header">
                              <span className="south-card-index">Mật mã #{index + 1}</span>
                              {isCompleted ? (
                                <span className="south-badge completed" title="Đã hoàn thành">
                                  ✓ Đã hoàn thành
                                </span>
                              ) : (
                                <span className="south-badge locked" title="Nội dung đang ẩn">
                                  🔒 Chưa mở
                                </span>
                              )}
                            </div>

                            <div className="south-card-body">
                              <div className="south-card-cost">
                                <span className="cost-label">Giá mở khóa:</span>
                                <strong className="cost-value">{question.unlockCost} điểm</strong>
                              </div>
                              <p className="south-card-status-text">
                                {isCompleted
                                  ? 'Mật mã đã hoàn tất. Có thể mua lại để giải lại.'
                                  : 'Nội dung câu hỏi đang ẩn. Mở khóa để xem câu hỏi và điền từ.'}
                              </p>
                            </div>

                            <div className="south-card-footer">
                              <button
                                className={isCompleted ? 'secondary-button' : 'primary-button'}
                                disabled={!canAfford}
                                onClick={() => requestSouthUnlock(question.id)}
                                type="button"
                              >
                                {isCompleted
                                  ? `Làm lại (${question.unlockCost} điểm)`
                                  : `Mở khóa (${question.unlockCost} điểm)`}
                              </button>
                              {!canAfford && (
                                <p className="control-note">Cần thêm {missingPoints} điểm viện trợ từ Miền Bắc.</p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* 2. ANSWERING SCREEN */}
                {southGame.status === 'answering' && currentSouthQuestion && (
                  <div className="panel-card south-active-question-card">
                    <div className="south-active-header">
                      <div>
                        <span className="eyebrow">Đang giải mật mã #{southGame.context.currentIndex + 1}</span>
                        <h3 className="south-question-prompt">{currentSouthQuestion.prompt}</h3>
                      </div>
                      <button
                        className="secondary-button south-back-button"
                        onClick={returnSouthToCards}
                        type="button"
                      >
                        ← Danh sách câu hỏi
                      </button>
                    </div>

                    <label className="south-answer-field">
                      <span>Đáp án từng ký tự</span>
                      <SouthAnswerInput
                        answerPattern={currentSouthQuestion.answerPattern ?? []}
                        onChange={setSouthDraftAnswer}
                        value={southDraftAnswer}
                      />
                    </label>

                    <div className="action-row south-answer-actions">
                      <button
                        className="primary-button"
                        disabled={!southDraftAnswer.trim()}
                        onClick={submitSouthAnswer}
                        type="button"
                      >
                        Gửi câu trả lời
                      </button>
                      <button
                        className="secondary-button"
                        onClick={returnSouthToCards}
                        type="button"
                      >
                        Tạm dừng (Ẩn lại)
                      </button>
                    </div>
                    <p className="control-note">
                      Điểm mở khóa ({currentSouthQuestion.unlockCost} điểm) đã được trừ.
                    </p>
                  </div>
                )}

                {/* 3. FEEDBACK SCREEN */}
                {southGame.status === 'feedback' && (
                  <div className="panel-card south-feedback-card">
                    <div className={`feedback-banner ${southGame.lastResult.correct ? 'success' : 'failure'}`}>
                      <h4>
                        {southGame.lastResult.correct ? '🎉 Đáp án chính xác!' : '❌ Đáp án chưa chính xác!'}
                      </h4>
                      <p>
                        {southGame.lastResult.correct
                          ? 'Mật mã này đã được đánh dấu hoàn thành! Điểm mở khóa đã tiêu hao. Câu hỏi sẽ ẩn lại trên màn hình chọn.'
                          : 'Điểm mở khóa đã bị tiêu hao. Mật mã sẽ được ẩn lại và bạn cần mua lại nếu muốn thử lại.'}
                      </p>
                    </div>

                    <div className="action-row host-actions">
                      <button
                        className="primary-button"
                        onClick={returnSouthToCards}
                        type="button"
                      >
                        Quay lại danh sách câu hỏi
                      </button>
                    </div>
                  </div>
                )}

                {/* 4. COMPLETED OR ERROR */}
                {southGame.status === 'completed' && (
                  <div className="panel-card south-completed-card">
                    <h4>Đội Miền Nam đã hoàn thành toàn bộ câu hỏi!</h4>
                    <p>Chúc mừng hai miền đã phối hợp chi viện và giải mã thành công.</p>
                    <button
                      className="secondary-button"
                      onClick={returnSouthToCards}
                      type="button"
                    >
                      Xem lại danh sách câu hỏi
                    </button>
                  </div>
                )}

                {southGame.status === 'error' && <p className="form-error">{southGame.message}</p>}
              </div>
            )}
          </section>
        )}

        {mode === 'admin' && (
          <div className="admin-dashboard">
            <section className="panel-card room-panel">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">Điều phối trận đấu</p>
                  <h3>Phòng chờ</h3>
                </div>
                <button className="secondary-button" disabled={isCreatingRoom} onClick={generateRoom} type="button">
                  {isCreatingRoom ? 'Đang tạo…' : createdRoomCode ? 'Tạo mã mới' : 'Tạo mã phòng'}
                </button>
              </div>
              {!hasSupabaseConfig && (
                <p className="form-error" role="alert">
                  Cấu hình Supabase chưa hoàn tất. Không thể tải câu hỏi hoặc đồng bộ phòng.
                </p>
              )}
              {hasSupabaseConfig && questions.length === 0 && createdRoomCode && (
                <p className="control-note">Ngân hàng chưa có câu hỏi đang mở; hãy thêm câu hỏi trước khi bắt đầu.</p>
              )}
              {adminError && <p className="form-error" role="alert">{adminError}</p>}
              <div className="room-code-display">
                <span>Mã phòng</span>
                <strong>{createdRoomCode || '------'}</strong>
                <span className="room-state">{createdRoomCode ? 'Sẵn sàng đón người chơi' : 'Chưa tạo phòng'}</span>
              </div>
              <div className="stat-grid">
                <div className="stat-box">
                  <span>Tổng người chơi</span>
                  <strong>{players.length}</strong>
                </div>
                <div className="stat-box">
                  <span>Miền Bắc</span>
                  <strong>{northCount}</strong>
                </div>
                <div className="stat-box">
                  <span>Miền Nam</span>
                  <strong>{southCount}</strong>
                </div>
                <div className="stat-box">
                  <span>Câu hỏi</span>
                  <strong>{questions.length}</strong>
                </div>
              </div>
            </section>

            <section className="lobby-layout admin-roster" aria-label="Danh sách người chơi">
              {(['north', 'south'] as const).map((team) => {
                const teamPlayers = players.filter((player) => player.team === team)

                return (
                  <div className="team-column" key={team}>
                    <div className="team-heading">
                      <h4>{teamNames[team]}</h4>
                      <span>{teamPlayers.length} người</span>
                    </div>
                    {teamPlayers.length > 0 ? (
                      <ul className="member-list">
                        {teamPlayers.map((player) => (
                          <li className="member-row" key={player.profileId}>
                            <span>{player.displayName}</span>
                            <em>Đã tham gia</em>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="empty-team">Chưa có người chơi</p>
                    )}
                  </div>
                )
              })}
            </section>

            <section className="panel-card host-controls">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">Quản lý Miền Bắc</p>
                  <h3>Điều khiển trắc nghiệm</h3>
                </div>
                <span className={`session-state ${northGame?.status ?? 'lobby'}`}>{northGameStatusLabel}</span>
              </div>
              <div className="question-counter">
                <span>{northGame && northGame.status !== 'lobby' && northGame.context.questions.length > 0
                  ? `Câu ${northGame.context.currentIndex + 1} / ${northGame.context.questions.length}`
                  : `${getNorthMultipleChoiceQuestions(questions).length} câu trắc nghiệm Miền Bắc`}</span>
                <strong>{northGame?.status === 'question_active'
                  ? `${Math.max(0, Math.ceil(remainingMs / 1000))} giây`
                  : northGame?.status === 'intermission'
                    ? `${Math.max(0, Math.ceil(remainingMs / 1000))} giây`
                    : '—'}</strong>
              </div>
              {northGame?.status === 'error' && <p className="form-error" role="alert">{northGame.message}</p>}
              {currentNorthQuestion && (
                <div className="question-placeholder">
                  <strong>{currentNorthQuestion.prompt}</strong>
                  {currentNorthQuestion.options.map((option) => (
                    <p key={option.id}>{option.label}. {option.text}</p>
                  ))}
                </div>
              )}
              {northGame && currentNorthQuestion && northGame.context.answers.some((answer) => answer.questionId === currentNorthQuestion.id) && (
                <div className="answer-records">
                  <h4>Câu trả lời đã nhận</h4>
                  {northGame.context.answers
                    .filter((answer) => answer.questionId === currentNorthQuestion.id)
                    .map((answer) => {
                      const answeringPlayer = players.find((player) => player.profileId === answer.playerId)
                      const option = currentNorthQuestion.options.find((item) => item.id === answer.selectedOptionId)
                      return (
                        <div className="player-summary" key={answer.playerId}>
                          <span>
                            {answeringPlayer?.displayName ?? 'Người chơi'} · {option?.label ?? '—'} · {answer.correct ? 'Đúng' : 'Sai'}
                          </span>
                          <strong>+{answer.pointsAwarded} · Tổng {northGame.context.scores[answer.playerId] ?? 0} điểm</strong>
                        </div>
                      )
                    })}
                </div>
              )}
              <div className="action-row host-actions">
                {(!northGame || northGame.status === 'lobby' || northGame.status === 'error') && (
                  <button
                    className="primary-button"
                    disabled={!createdRoomCode || northCount === 0 || southCount === 0
                      || getNorthMultipleChoiceQuestions(questions).length === 0
                      || getSouthWordQuestions(questions, answerKeys).length === 0}
                    onClick={startBothGames}
                    type="button"
                  >
                    Bắt đầu hai đội
                  </button>
                )}
                {northGame?.status === 'question_active' && (
                  <>
                    <button className="secondary-button" onClick={() => dispatchNorthGame({ type: 'ADMIN_PAUSE' })} type="button">Tạm dừng</button>
                    <button className="secondary-button" onClick={() => dispatchNorthGame({ type: 'ADMIN_SKIP_QUESTION' })} type="button">Bỏ qua câu hỏi</button>
                  </>
                )}
                {northGame?.status === 'paused' && (
                  <button className="primary-button" onClick={() => dispatchNorthGame({ type: 'ADMIN_RESUME' })} type="button">Tiếp tục</button>
                )}
                {northGame?.status === 'intermission' && (
                  <>
                    <button className="secondary-button" onClick={() => dispatchNorthGame({ type: 'ADMIN_PAUSE' })} type="button">Tạm dừng</button>
                    <button className="secondary-button" onClick={() => dispatchNorthGame({ type: 'ADMIN_SKIP_INTERMISSION' })} type="button">Qua phần nghỉ</button>
                  </>
                )}
                {northGame?.status === 'completed' && (
                  <button className="primary-button" onClick={() => dispatchNorthGame({ type: 'ADMIN_RESTART' })} type="button">Chơi lại</button>
                )}
                {northGame && ['question_active', 'answer_revealed', 'intermission', 'paused'].includes(northGame.status) && (
                  <button
                    className="secondary-button"
                    onClick={() => dispatchNorthGame({ type: 'ADMIN_END_GAME', reason: 'Chủ phòng kết thúc trận' })}
                    type="button"
                  >
                    Kết thúc trận
                  </button>
                )}
              </div>
              {(northGame?.status === 'question_active'
                || northGame?.status === 'answer_revealed' && currentNorthResolution?.reason === 'timeout') && currentNorthQuestion && (
                <div className="admin-tools">
                  <button
                    className="secondary-button"
                    disabled={!correctNorthOptionId}
                    onClick={() => correctNorthOptionId && dispatchNorthGame({
                      type: 'ADMIN_REVEAL_ANSWER',
                      correctOptionId: correctNorthOptionId,
                    })}
                    type="button"
                  >
                    Công bố đáp án từ ngân hàng
                  </button>
                </div>
              )}
              <p className="control-note">
                Đáp án được kiểm tra tự động; điểm cộng ngay khi người chơi gửi câu trả lời.
              </p>
            </section>

            <section className="panel-card host-controls">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">Quản lý Miền Nam</p>
                  <h3>Điều khiển điền từ</h3>
                </div>
                <span className={`session-state ${southGame?.status ?? 'lobby'}`}>{southGameStatusLabel}</span>
              </div>
              <div className="question-counter">
                <span>Tổng điểm còn trong các ví Miền Nam: {southWallet.balance} điểm</span>
                <strong>{(southWallet.completedQuestionIds ?? []).length} / {southGame?.context.questions.length ?? 0} mật mã đã giải</strong>
              </div>
              {currentSouthQuestion && (
                <div className="question-placeholder">
                  <strong>{currentSouthQuestion.prompt || `Mật mã #${southGame?.context.currentIndex ? southGame.context.currentIndex + 1 : 1} (Đang ẩn)`}</strong>
                  <p>Chi phí mở khóa: {currentSouthQuestion.unlockCost} điểm</p>
                  {southGame?.status === 'feedback' && (
                    <p>
                      {southGame.lastResult.correct ? 'Đáp án chính xác.' : 'Đáp án chưa chính xác.'}
                      {' '}Đáp án: {answerKeys[currentSouthQuestion.id] ?? 'Chưa cấu hình'}
                    </p>
                  )}
                </div>
              )}
              {southGame?.status === 'error' && <p className="form-error" role="alert">{southGame.message}</p>}
              <div className="south-admin-questions-summary">
                <h4>Tiến độ từng người chơi Miền Nam</h4>
                {players.filter((player) => player.team === 'south').length > 0 ? (
                  <div className="south-admin-card-list">
                    {players.filter((player) => player.team === 'south').map((player) => {
                      const progress = southPlayerProgress[player.profileId]
                      const game = progress?.game
                      const currentQuestion = game?.context.questions[game.context.currentIndex]
                      const completedCount = progress?.completedQuestionIds.length ?? 0
                      const totalCount = game?.context.questions.length ?? southGame?.context.questions.length ?? 0
                      const status = totalCount > 0 && completedCount >= totalCount
                        ? 'Hoàn thành'
                        : game?.status === 'answering'
                        ? 'Đang giải'
                        : game?.status === 'feedback'
                          ? game.lastResult.correct ? 'Đã trả lời đúng' : 'Đã trả lời sai'
                            : game?.status === 'ready'
                              ? 'Đang chọn câu'
                              : 'Chưa bắt đầu'
                      const questionIndex = currentQuestion
                        ? (game?.context.questions.findIndex((question) => question.id === currentQuestion.id) ?? -1) + 1
                        : 0

                      return (
                        <div className="player-summary south-player-progress-row" key={player.profileId}>
                          <span>
                            <strong>{player.displayName}</strong>
                            <small>{status}{questionIndex ? ` · Mật mã #${questionIndex}` : ''}</small>
                          </span>
                          <strong>{progress?.walletBalance ?? 0} điểm · {completedCount}/{totalCount} hoàn thành</strong>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="empty-team">Chưa có người chơi Miền Nam</p>
                )}
              </div>
              <div className="action-row host-actions">
                {southGame?.status === 'feedback' && (
                  <button
                    className="primary-button"
                    onClick={() => {
                      setSouthDraftAnswer('')
                      const nextWallet = { ...southWalletRef.current, unlockedQuestionIds: [] }
                      southWalletRef.current = nextWallet
                      setSouthWallet(nextWallet)
                      dispatchSouthGame({ type: 'RETURN_TO_CARDS' })
                    }}
                    type="button"
                  >
                    Về danh sách thẻ câu hỏi
                  </button>
                )}
                {southGame?.status === 'completed' && <strong>Miền Nam đã hoàn thành.</strong>}
              </div>
              <div className="south-admin-questions-summary">
                <h4>Danh sách mật mã Miền Nam</h4>
                <div className="south-admin-card-list">
                  {southGame?.context.questions.map((q, idx) => {
                    const isDone = completedSouthQuestionIds.includes(q.id)
                    const isUnlocked = southWallet.unlockedQuestionIds.includes(q.id)
                    return (
                      <div className="player-summary" key={q.id}>
                        <span>Mật mã #{idx + 1} · Giá: {q.unlockCost} điểm</span>
                        <strong>{isDone ? '✓ Đã hoàn thành' : isUnlocked ? '🔓 Đang mở' : '🔒 Chưa mở'}</strong>
                      </div>
                    )
                  })}
                </div>
              </div>
              <p className="control-note">Miền Nam tiến triển độc lập với đồng hồ trắc nghiệm Miền Bắc.</p>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
