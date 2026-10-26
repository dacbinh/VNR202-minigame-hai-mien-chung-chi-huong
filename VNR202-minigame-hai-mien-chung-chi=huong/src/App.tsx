import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getTeamMemberCount, type LobbyMember, type LobbyTeam } from './domain/lobbyRules'
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
  const [questionNumber, setQuestionNumber] = useState(1)
  const [questions, setQuestions] = useState<BankQuestion[]>([])
  const hostChannelRef = useRef<RealtimeChannel | null>(null)
  const playerChannelRef = useRef<RealtimeChannel | null>(null)
  const playersRef = useRef<LobbyMember[]>([])
  const sessionStatusRef = useRef<SessionStatus>('waiting')
  const questionNumberRef = useRef(1)
  const questionsRef = useRef<BankQuestion[]>([])
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
        ...overrides,
      },
    })
  }

  const handleHostMessage = (message: RoomMessage) => {
    const channel = hostChannelRef.current
    if (!channel) return

    if (message.type === 'room-probe' && message.requestId) {
      void sendRoomEvent(channel, { type: 'room-found', requestId: message.requestId })
      void broadcastHostState()
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
      setQuestionNumber(message.state.questionNumber)
      setQuestions(message.state.questions)
    }

    const pendingJoin = pendingJoinRef.current
    if (pendingJoin && message.type === 'join-accepted' && message.requestId === pendingJoin.requestId) {
      pendingJoin.resolve()
      pendingJoinRef.current = null
    }
  }

  const updateSessionStatus = (nextStatus: SessionStatus) => {
    sessionStatusRef.current = nextStatus
    setSessionStatus(nextStatus)
    void broadcastHostState({ status: nextStatus })
  }

  const skipQuestion = () => {
    const questionCount = questionsRef.current.length
    if (questionCount === 0) return

    const nextQuestion = (questionNumberRef.current % questionCount) + 1
    questionNumberRef.current = nextQuestion
    setQuestionNumber(nextQuestion)
    void broadcastHostState({ questionNumber: nextQuestion })
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
      playersRef.current = []
      sessionStatusRef.current = 'waiting'
      questionNumberRef.current = bankQuestions.length > 0 ? 1 : 0

      const room = await createHostRoom(handleHostMessage)
      hostChannelRef.current = room.channel
      setCreatedRoomCode(room.roomCode)
      setPlayers([])
      setSessionStatus('waiting')
      setQuestionNumber(bankQuestions.length > 0 ? 1 : 0)
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
  const currentQuestion = questions[questionNumber - 1]
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
                <span>{sessionStatus === 'active' ? 'Chủ phòng đã bắt đầu trận.' : 'Đang chờ chủ phòng bắt đầu.'}</span>
              </div>
            </div>
            <div className="player-summary">
              <span>{pendingPlayer.displayName}</span>
              <strong>{teamNames[pendingPlayer.team]}</strong>
            </div>
            {sessionStatus === 'active' && currentQuestion && (
              <div className="question-placeholder">
                <strong>Câu {questionNumber}</strong>
                <p>{currentQuestion.prompt}</p>
                {currentQuestion.choices.map((choice) => <p key={choice}>{choice}</p>)}
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
                  <p className="section-kicker">Quản lý phiên</p>
                  <h3>Điều khiển trận</h3>
                </div>
                <span className={`session-state ${sessionStatus}`}>
                  {sessionStatus === 'waiting' ? 'Đang chờ' : sessionStatus === 'active' ? 'Đang diễn ra' : 'Đã tạm dừng'}
                </span>
              </div>
              <div className="question-counter">
                <span>{questions.length > 0 ? `Câu hỏi ${questionNumber} / ${questions.length}` : 'Chưa có câu hỏi'}</span>
                <strong>{currentQuestion?.owner_team === 'north' ? 'Bắc' : currentQuestion?.owner_team === 'south' ? 'Nam' : '—'}</strong>
              </div>
              {currentQuestion && (
                <div className="question-placeholder">
                  <strong>{currentQuestion.kind === 'multiple_choice' ? 'Trắc nghiệm' : 'Điền đáp án'}</strong>
                  <p>{currentQuestion.prompt}</p>
                  {currentQuestion.choices.map((choice) => <p key={choice}>{choice}</p>)}
                </div>
              )}
              <div className="action-row host-actions">
                {sessionStatus === 'waiting' && (
                  <button
                    className="primary-button"
                    disabled={!createdRoomCode || players.length === 0 || questions.length === 0}
                    onClick={() => updateSessionStatus('active')}
                    type="button"
                  >
                    Bắt đầu trận
                  </button>
                )}
                {sessionStatus === 'active' && (
                  <button className="secondary-button" onClick={() => updateSessionStatus('paused')} type="button">
                    Tạm dừng
                  </button>
                )}
                {sessionStatus === 'paused' && (
                  <button className="primary-button" onClick={() => updateSessionStatus('active')} type="button">
                    Tiếp tục trận
                  </button>
                )}
                <button
                  className="secondary-button"
                  disabled={sessionStatus !== 'active' || questions.length === 0}
                  onClick={skipQuestion}
                  type="button"
                >
                  Bỏ qua câu hỏi
                </button>
              </div>
              <p className="control-note">
                Chủ phòng chủ động bắt đầu sau khi danh sách người chơi đã đầy đủ.
              </p>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
