const fs = require('fs')
const path = require('path')

const filePath = path.join(__dirname, 'src', 'App.tsx')
let content = fs.readFileSync(filePath, 'utf8')

// ── Change 1: Add playerCompletions state + ref after aidNotification state ──
const stateAnchor = "  const [aidNotification, setAidNotification] = useState<number | null>(null)"
const stateReplacement = `  const [aidNotification, setAidNotification] = useState<number | null>(null)
  const [playerCompletions, setPlayerCompletions] = useState<Record<string, string[]>>({})
  const playerCompletionsRef = useRef<Record<string, string[]>>({})`

if (!content.includes(stateAnchor)) {
  console.error('FAILED: state anchor not found')
  process.exit(1)
}
content = content.replace(stateAnchor, stateReplacement)
console.log('✓ Change 1: added playerCompletions state')

// ── Change 2: Reset playerCompletions in startBothGames (after setSouthWallet in that block) ──
const startResetAnchor = `    southWalletRef.current = emptyWallet
    setSouthWallet(emptyWallet)
    northGameRef.current = nextNorth
    southGameRef.current = nextSouth`
const startResetReplacement = `    southWalletRef.current = emptyWallet
    setSouthWallet(emptyWallet)
    playerCompletionsRef.current = {}
    setPlayerCompletions({})
    northGameRef.current = nextNorth
    southGameRef.current = nextSouth`

if (!content.includes(startResetAnchor)) {
  console.error('FAILED: startBothGames anchor not found')
  process.exit(1)
}
content = content.replace(startResetAnchor, startResetReplacement)
console.log('✓ Change 2: reset playerCompletions in startBothGames')

// ── Change 3: Reset playerCompletions in generateRoom ──
const generateResetAnchor = `      southWalletRef.current = emptyWallet
      setSouthWallet(emptyWallet)
      playersRef.current = []`
const generateResetReplacement = `      southWalletRef.current = emptyWallet
      setSouthWallet(emptyWallet)
      playerCompletionsRef.current = {}
      setPlayerCompletions({})
      playersRef.current = []`

if (!content.includes(generateResetAnchor)) {
  console.error('FAILED: generateRoom anchor not found')
  process.exit(1)
}
content = content.replace(generateResetAnchor, generateResetReplacement)
console.log('✓ Change 3: reset playerCompletions in generateRoom')

// ── Change 4: Update south-answer handler to track per-player completions ──
const answerAnchor = `        const nextWallet: SouthWallet = {
          ...southWalletRef.current,
          completedQuestionIds: nextCompleted,
        }
        southWalletRef.current = nextWallet
        setSouthWallet(nextWallet)`
const answerReplacement = `        if (isCorrect && message.playerId) {
          const prevPlayerCompletions = playerCompletionsRef.current
          const playerPrevIds = prevPlayerCompletions[message.playerId] ?? []
          if (!playerPrevIds.includes(question.id)) {
            const nextPlayerCompletions = {
              ...prevPlayerCompletions,
              [message.playerId]: [...playerPrevIds, question.id],
            }
            playerCompletionsRef.current = nextPlayerCompletions
            setPlayerCompletions(nextPlayerCompletions)
          }
        }
        const nextWallet: SouthWallet = {
          ...southWalletRef.current,
          completedQuestionIds: nextCompleted,
        }
        southWalletRef.current = nextWallet
        setSouthWallet(nextWallet)`

if (!content.includes(answerAnchor)) {
  console.error('FAILED: south-answer handler anchor not found')
  process.exit(1)
}
content = content.replace(answerAnchor, answerReplacement)
console.log('✓ Change 4: per-player tracking in south-answer handler')

// ── Change 5: Replace the admin south questions summary section ──
const summaryAnchor = `              <div className="south-admin-questions-summary">
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
              </div>`

const summaryReplacement = `              <div className="south-admin-questions-summary">
                <div className="section-heading" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h4 style={{ margin: 0 }}>Tiến độ đội Miền Nam</h4>
                  {(() => {
                    const totalQ = southGame?.context.questions.length ?? 0
                    const totalPossible = totalQ * southCount
                    const teamActual = Object.values(playerCompletions).reduce((sum, arr) => sum + arr.length, 0)
                    const teamPct = totalPossible > 0 ? Math.round((teamActual / totalPossible) * 100) : 0
                    return (
                      <span className={\`south-badge \${teamActual === totalPossible && totalPossible > 0 ? 'completed' : 'active'}\`}>
                        {teamActual} / {totalPossible} hoàn thành
                      </span>
                    )
                  })()}
                </div>
                {(() => {
                  const totalQ = southGame?.context.questions.length ?? 0
                  const totalPossible = totalQ * southCount
                  const teamActual = Object.values(playerCompletions).reduce((sum, arr) => sum + arr.length, 0)
                  const teamPct = totalPossible > 0 ? Math.round((teamActual / totalPossible) * 100) : 0
                  return (
                    <div style={{ marginTop: '0.75rem' }}>
                      <div className="south-progress-label">
                        <span>Tổng tiến độ ({southCount} người · {totalQ} mật mã)</span>
                        <strong>{teamPct}%</strong>
                      </div>
                      <div className="south-progress-track">
                        <div className="south-progress-fill" style={{ width: \`\${teamPct}%\` }} />
                      </div>
                    </div>
                  )
                })()}
                <div className="south-admin-card-list" style={{ marginTop: '1rem' }}>
                  {players.filter((p) => p.team === 'south').map((player) => {
                    const playerDone = playerCompletions[player.profileId] ?? []
                    const totalQ = southGame?.context.questions.length ?? 0
                    const playerPct = totalQ > 0 ? Math.round((playerDone.length / totalQ) * 100) : 0
                    return (
                      <div
                        key={player.profileId}
                        style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', padding: '0.75rem', background: 'var(--color-surface-muted)', borderRadius: '6px', border: '1px solid var(--color-border)' }}
                      >
                        <div className="player-summary">
                          <span style={{ fontWeight: 600 }}>{player.displayName}</span>
                          <span className={\`south-badge \${playerDone.length === totalQ && totalQ > 0 ? 'completed' : 'locked'}\`}>
                            {playerDone.length} / {totalQ} câu
                          </span>
                        </div>
                        <div className="south-progress-track" style={{ height: '6px' }}>
                          <div className="south-progress-fill" style={{ width: \`\${playerPct}%\` }} />
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.25rem' }}>
                          {southGame?.context.questions.map((q, idx) => (
                            <span
                              key={q.id}
                              className={\`south-badge \${playerDone.includes(q.id) ? 'completed' : completedSouthQuestionIds.includes(q.id) ? 'active' : 'locked'}\`}
                              title={\`Mật mã #\${idx + 1}: \${playerDone.includes(q.id) ? 'Hoàn thành' : 'Chưa hoàn thành'}\`}
                            >
                              #{idx + 1}
                            </span>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                  {players.filter((p) => p.team === 'south').length === 0 && (
                    <p className="control-note">Chưa có người chơi Miền Nam.</p>
                  )}
                </div>
              </div>`

if (!content.includes(summaryAnchor)) {
  console.error('FAILED: summary section anchor not found')
  process.exit(1)
}
content = content.replace(summaryAnchor, summaryReplacement)
console.log('✓ Change 5: replaced admin south summary section with progress dashboard')

fs.writeFileSync(filePath, content, 'utf8')
console.log('\n✅ All changes applied successfully.')

