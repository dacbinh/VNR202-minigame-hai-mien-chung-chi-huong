import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getTeamMemberCount, type LobbyMember, type LobbyTeam } from './domain/lobbyRules'
import {
  createNorthGameState,
  transitionNorthGame,
  type MultipleChoiceQuestion,
  type NorthGameActor,
  type NorthGameEvent,
  type NorthGameState,
} from './domain/northMultipleChoice'
import {
  closeRoomChannel,
  connectPlayerToRoom,
  createHostRoom,
  getRoomServiceErrorMessage,
  loadQuestionBank,
  sendRoomEvent,
  type BankQuestion,
  type RoomMessage,
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
  const [northGame, setNorthGame] = useState<NorthGameState | null>(null)
  const [selectedOptionId, setSelectedOptionId] = useState('')
  const [revealOptionId, setRevealOptionId] = useState('')
  const [scoreTargetId, setScoreTargetId] = useState('')
  const [scoreAmount, setScoreAmount] = useState(1)
  const [scoreReason, setScoreReason] = useState('')
  const [clockNow, setClockNow] = useState(() => Date.now())
  const hostChannelRef = useRef<RealtimeChannel | null>(null)
  const playerChannelRef = useRef<RealtimeChannel | null>(null)
  const playersRef = useRef<LobbyMember[]>([])
  const sessionStatusRef = useRef<SessionStatus>('waiting')
  const questionNumberRef = useRef(1)
  const questionsRef = useRef<BankQuestion[]>([])
  const northGameRef = useRef<NorthGameState | null>(null)
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
      const nextGame = transitionNorthGame(currentGame, { type: 'TICK', now: Date.now() }, adminActor)
      if (nextGame === currentGame) return

      if (nextGame.context.currentIndex !== currentGame.context.currentIndex) setRevealOptionId('')
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
            questions: questionsRef.current,
            northGame: nextGame,
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
        questions: questionsRef.current,
        northGame: northGameRef.current,
        ...overrides,
      },
    })
  }

  const startNorthGame = () => {
    const game = createNorthGameState(
      getNorthMultipleChoiceQuestions(questionsRef.current),
      playersRef.current
        .filter((player) => player.team === 'north')
        .map((player) => player.profileId),
    )
    northGameRef.current = game
    setNorthGame(game)
    if (game.status === 'lobby') dispatchNorthGame({ type: 'ADMIN_START' })
    else setAdminError(game.status === 'error' ? game.message : 'Không thể bắt đầu trận.')
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

  const dispatchNorthGame = (event: NorthGameEvent, actor: NorthGameActor = adminActor) => {
    const currentGame = northGameRef.current
    if (!currentGame) return

    const nextGame = transitionNorthGame(currentGame, event, actor)
    if (nextGame === currentGame) return

    if (nextGame.context.currentIndex !== currentGame.context.currentIndex) setRevealOptionId('')
    northGameRef.current = nextGame
    setNorthGame(nextGame)
    const nextSessionStatus = nextGame.status === 'question_active'
      ? 'active'
      : nextGame.status === 'paused'
        ? 'paused'
        : 'waiting'
    sessionStatusRef.current = nextSessionStatus
    setSessionStatus(nextSessionStatus)
    questionNumberRef.current = nextGame.context.currentIndex + 1
    void broadcastHostState({
      northGame: nextGame,
      status: nextSessionStatus,
      questionNumber: questionNumberRef.current,
    })
  }

  const handleHostMessage = (message: RoomMessage) => {
    const channel = hostChannelRef.current
    if (!channel) return

    if (message.type === 'north-answer' && message.playerId && message.questionId
      && message.optionId && message.requestId
      && playersRef.current.some((player) => player.profileId === message.playerId)) {
      dispatchNorthGame({
        type: 'SUBMIT_ANSWER',
        questionId: message.questionId,
        optionId: message.optionId,
        requestId: message.requestId,
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

    if (message.type === 'north-answer' && message.playerId && message.questionId
      && message.optionId && message.requestId
      && playersRef.current.some((player) => player.profileId === message.playerId)) {
      dispatchNorthGame({
        type: 'SUBMIT_ANSWER',
        questionId: message.questionId,
        optionId: message.optionId,
        requestId: message.requestId,
      }, { role: 'player', id: message.playerId })
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
      setPendingPlayer({
        profileId: globalThis.crypto.randomUUID(),
        displayName: playerName.trim(),
        team: 'north',
        isAdmin: false,
      })
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
      questionsRef.current = bankQuestions
      setQuestions(bankQuestions)
      northGameRef.current = null
      setNorthGame(null)
      playersRef.current = []
      sessionStatusRef.current = 'waiting'
      questionNumberRef.current = bankQuestions.length > 0 ? 1 : 0

      const room = await createHostRoom(handleHostMessage)
      hostChannelRef.current = room.channel
      setCreatedRoomCode(room.roomCode)
      setPlayers([])
      setSessionStatus('waiting')
      setPlayerStep('join')
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
  const playerGameStatus = northGame?.status === 'question_active'
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
          <p className="eyebrow">Trận chiến · Bắc Nam</p>
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
                      <p className="lobby-status ready">Đã ghi nhận câu trả lời của bạn.</p>
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
            {pendingPlayer.team === 'south' && northGame?.status === 'question_active' && (
              <div className="question-placeholder"><p>Đội Miền Bắc đang trả lời câu hỏi.</p></div>
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
                          <span>{answeringPlayer?.displayName ?? 'Người chơi'} · {option?.label ?? '—'}</span>
                          <strong>{northGame.context.scores[answer.playerId] ?? 0} điểm</strong>
                        </div>
                      )
                    })}
                </div>
              )}
              <div className="action-row host-actions">
                {(!northGame || northGame.status === 'lobby' || northGame.status === 'error') && (
                  <button
                    className="primary-button"
                    disabled={!createdRoomCode || northCount === 0 || getNorthMultipleChoiceQuestions(questions).length === 0}
                    onClick={startNorthGame}
                    type="button"
                  >
                    Bắt đầu trận
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
                  <label>
                    <span>Đáp án do chủ phòng xác nhận</span>
                    <select value={revealOptionId} onChange={(event) => setRevealOptionId(event.target.value)}>
                      <option value="">Chọn đáp án</option>
                      {currentNorthQuestion.options.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}. {option.text}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="secondary-button"
                    disabled={!revealOptionId}
                    onClick={() => dispatchNorthGame({ type: 'ADMIN_REVEAL_ANSWER', correctOptionId: revealOptionId })}
                    type="button"
                  >
                    Công bố đáp án
                  </button>
                </div>
              )}
              {northGame && !['lobby', 'completed', 'error'].includes(northGame.status) && (
                <div className="admin-tools">
                  <label>
                    <span>Người nhận điểm</span>
                    <select value={scoreTargetId} onChange={(event) => setScoreTargetId(event.target.value)}>
                      <option value="">Chọn người chơi</option>
                      {players.filter((player) => player.team === 'north').map((player) => (
                        <option key={player.profileId} value={player.profileId}>{player.displayName}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Số điểm</span>
                    <input min="1" onChange={(event) => setScoreAmount(Number(event.target.value))} type="number" value={scoreAmount} />
                  </label>
                  <label>
                    <span>Lý do</span>
                    <input onChange={(event) => setScoreReason(event.target.value)} value={scoreReason} />
                  </label>
                  <div className="action-row host-actions">
                    <button
                      className="secondary-button"
                      disabled={!scoreTargetId || !scoreReason.trim() || scoreAmount <= 0}
                      onClick={() => {
                        dispatchNorthGame({
                          type: 'ADMIN_GRANT_POINTS', targetId: scoreTargetId, amount: scoreAmount,
                          reason: scoreReason, requestId: globalThis.crypto.randomUUID(),
                        })
                        setScoreReason('')
                      }}
                      type="button"
                    >
                      Cộng điểm
                    </button>
                    <button
                      className="secondary-button"
                      disabled={!scoreTargetId || !scoreReason.trim() || scoreAmount <= 0}
                      onClick={() => {
                        dispatchNorthGame({
                          type: 'ADMIN_DEDUCT_POINTS', targetId: scoreTargetId, amount: scoreAmount,
                          reason: scoreReason, requestId: globalThis.crypto.randomUUID(),
                        })
                        setScoreReason('')
                      }}
                      type="button"
                    >
                      Trừ điểm
                    </button>
                  </div>
                </div>
              )}
              <p className="control-note">
                Câu trả lời do người chơi gửi; chủ phòng xác nhận đáp án và điều chỉnh điểm.
              </p>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
