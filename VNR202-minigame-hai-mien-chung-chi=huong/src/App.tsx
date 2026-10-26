import { useEffect, useState, type FormEvent } from 'react'
import { getTeamMemberCount, type LobbyMember, type LobbyTeam } from './domain/lobbyRules'
import {
  createLobbyRoom,
  getRoomMembers,
  getRoomServiceErrorMessage,
  joinLobbyRoom,
} from './lib/roomService'
import { hasSupabaseConfig, supabaseClient } from './lib/supabase'
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
  const [activeSessionId, setActiveSessionId] = useState('')
  const [enteredRoomCode, setEnteredRoomCode] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [joinError, setJoinError] = useState('')
  const [adminError, setAdminError] = useState('')
  const [isCreatingRoom, setIsCreatingRoom] = useState(false)
  const [pendingPlayer, setPendingPlayer] = useState<LobbyMember | null>(null)
  const [players, setPlayers] = useState<LobbyMember[]>([])
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('waiting')
  const [questionNumber, setQuestionNumber] = useState(1)

  useEffect(() => {
    const handleHashChange = () => setMode(getModeFromHash(window.location.hash))

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => {
    const client = supabaseClient
    if (!activeSessionId || mode !== 'admin' || !client) return

    let isDisposed = false
    const refreshMembers = async () => {
      try {
        const members = await getRoomMembers(activeSessionId)
        if (!isDisposed) setPlayers(members)
      } catch (error) {
        if (!isDisposed) {
          setAdminError(error instanceof Error ? error.message : 'Không thể tải danh sách người chơi.')
        }
      }
    }

    const channel = client
      .channel(`lobby-members-${activeSessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_members',
          filter: `session_id=eq.${activeSessionId}`,
        },
        () => void refreshMembers(),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void refreshMembers()
      })

    void refreshMembers()

    return () => {
      isDisposed = true
      void client.removeChannel(channel)
    }
  }, [activeSessionId, mode])

  const navigate = (nextMode: AppMode) => {
    window.history.replaceState(null, '', `#${nextMode}`)
    setMode(nextMode)
  }

  const handleJoinRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setJoinError('')

    const normalizedCode = enteredRoomCode.trim().toUpperCase()
    if (normalizedCode.length !== 6) {
      setJoinError('Mã phòng cần có 6 ký tự.')
      return
    }

    setPendingPlayer({
      profileId: 'pending',
      displayName: playerName.trim(),
      team: 'north',
      isAdmin: false,
    })
    setPlayerStep('team')
  }

  const joinTeam = async (team: LobbyTeam) => {
    if (!pendingPlayer) return

    setJoinError('')
    try {
      const room = await joinLobbyRoom(enteredRoomCode, pendingPlayer.displayName, team)
      const joinedPlayer = { ...pendingPlayer, profileId: room.profileId, team }
      setPendingPlayer(joinedPlayer)
      setActiveSessionId(room.sessionId)
      setCreatedRoomCode(room.roomCode)
      setPlayers([joinedPlayer])
      setPlayerStep('waiting')
    } catch (error) {
      setJoinError(getRoomServiceErrorMessage(error, 'Không thể vào phòng. Vui lòng thử lại.'))
    }
  }

  const generateRoom = async () => {
    setAdminError('')
    setIsCreatingRoom(true)
    try {
      const room = await createLobbyRoom()
      setCreatedRoomCode(room.roomCode)
      setActiveSessionId(room.sessionId)
      setPlayers([])
      setSessionStatus('waiting')
      setQuestionNumber(1)
      setPlayerStep('join')
      setPendingPlayer(null)
    } catch (error) {
      setAdminError(getRoomServiceErrorMessage(error, 'Không thể tạo phòng. Vui lòng thử lại.'))
    } finally {
      setIsCreatingRoom(false)
    }
  }

  const northCount = getTeamMemberCount(players, 'north')
  const southCount = getTeamMemberCount(players, 'south')
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
                <button className="primary-button" type="submit">Tiếp tục</button>
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
                  Cấu hình Supabase chưa hoàn tất. Phòng không thể được lưu hoặc chia sẻ.
                </p>
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
                <span>Câu hỏi hiện tại</span>
                <strong>{questionNumber}</strong>
              </div>
              <div className="action-row host-actions">
                {sessionStatus === 'waiting' && (
                  <button
                    className="primary-button"
                    disabled={!createdRoomCode || players.length === 0}
                    onClick={() => setSessionStatus('active')}
                    type="button"
                  >
                    Bắt đầu trận
                  </button>
                )}
                {sessionStatus === 'active' && (
                  <button className="secondary-button" onClick={() => setSessionStatus('paused')} type="button">
                    Tạm dừng
                  </button>
                )}
                {sessionStatus === 'paused' && (
                  <button className="primary-button" onClick={() => setSessionStatus('active')} type="button">
                    Tiếp tục trận
                  </button>
                )}
                <button
                  className="secondary-button"
                  disabled={sessionStatus !== 'active'}
                  onClick={() => setQuestionNumber((currentQuestion) => currentQuestion + 1)}
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
