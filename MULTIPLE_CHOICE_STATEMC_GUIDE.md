# Multiple-Choice Minigame — State Machine and Admin Control Specification

**Document type:** Technical implementation guide  
**Target:** AI coding agents and frontend/backend developers  
**Language:** TypeScript  
**Architecture:** Finite State Machine (FSM)  
**Scope:** Multiple-choice gameplay, question timers, inter-question countdowns, administrative controls, scoring, and multiplayer synchronization.

---

# 1. Objectives

Implement a predictable state machine for a multiple-choice minigame with the following capabilities:

1. Each question has between two and four answer choices, with a maximum of four.
2. Players can select and submit answers while a question is active.
3. Questions have configurable time limits.
4. The game provides a countdown between questions.
5. Authorized administrators can skip questions.
6. Authorized administrators can reveal and announce the correct answer before the normal question timer expires.
7. Authorized administrators can grant or deduct points.
8. The game automatically transitions when a question or inter-question countdown expires.
9. The game prevents duplicate submissions, duplicate scoring, invalid transitions, and unauthorized administrative actions.
10. The game can pause and resume through authorized controls.
11. The game can be restarted or completed according to its defined lifecycle.
12. All clients observe a consistent game state.

The implementation must remain modular and testable. Do not introduce a complex workflow framework when a small, explicit state machine is sufficient.

## Core architecture

Separate responsibilities into three layers:

**State machine**
- Defines legal states and transitions.
- Determines which actions are permitted.
- Controls question progression.

**Game engine**
- Validates answers.
- Calculates points.
- Records question results.
- Manages question and intermission timing.

**UI**
- Displays the current question and choices.
- Displays timers, scores, and feedback.
- Sends player actions and administrative commands to the game engine.

For multiplayer gameplay, the authoritative game engine must run on the backend. The frontend must not independently decide whether an answer is correct, award authoritative points, or advance the shared game.

---

# 2. Game State Model

Use the following primary states.

| State | Purpose | Main permitted actions |
|---|---|---|
| `lobby` | Players are waiting for the game to begin. | Join, leave, configure game |
| `question_active` | Players can answer the current question. | Select answer, submit answer |
| `answer_revealed` | The correct answer has been announced and submissions are locked. | View result, wait for transition |
| `intermission` | A countdown runs before the next question. | View results, wait for countdown |
| `paused` | Gameplay and gameplay timers are suspended. | Resume, inspect state |
| `completed` | The game has ended. | View results, restart if authorized |
| `error` | A recoverable or unrecoverable game configuration or runtime error prevents normal progression. | Recover or return to a safe state |

The `error` state may be represented by the application's existing error-handling system if that is more appropriate.

Do not introduce additional states unless they represent genuinely different gameplay behavior.

## 2.1 `lobby`

The game is initialized but has not started.

Expected behavior:
- Players can join according to the existing membership rules.
- Administrators can configure the game.
- The current question is not answerable.
- The game timer is not running.

Transition:

`lobby → question_active`

Condition:
- An authorized administrator starts the game.
- The question set is valid and contains at least one question.
- The game configuration is valid.

## 2.2 `question_active`

The current question is available for answering.

Expected behavior:
- Display the question and its answer choices.
- Start or continue the question countdown.
- Accept valid submissions.
- Update the visible timer.
- Reject submissions after the deadline.
- Allow authorized administrators to skip or reveal the answer.

Possible transitions:

| Event | Next state |
|---|---|
| Question timer expires | `answer_revealed` |
| Authorized admin reveals the answer | `answer_revealed` |
| Authorized admin skips the question | `intermission` |
| Authorized admin pauses the game | `paused` |
| Final question is resolved | `intermission`, followed by `completed` |

The timer expiring should trigger the same resolution process as a normal question ending, except that the resolution reason is recorded as `timeout`.

**Important:** Do not automatically mark the question correct or incorrect merely because time expires. Evaluate only the submissions allowed by the game's answer rules.

## 2.3 `answer_revealed`

The correct answer has been made public.

Expected behavior:
- Display the correct answer.
- Display the question result if applicable.
- Prevent further answer submissions.
- Preserve any results already recorded.
- Wait for the next transition.

Transition:

`answer_revealed → intermission`

This can happen immediately or after a short feedback display, depending on the game design.

For this implementation, use a brief configurable feedback period before starting the inter-question countdown.

If the game needs an explicit announcement animation, keep the animation in the UI. Do not create a separate gameplay state solely for an animation.

## 2.4 `intermission`

The question has ended, and the game is waiting to advance.

Expected behavior:
- Display the previous question's result.
- Display the next question's countdown.
- Prevent answers to the previous question.
- Prepare the next question.
- Transition automatically when the countdown reaches zero.

Transitions:

- `intermission → question_active` when another question exists and the countdown expires.
- `intermission → completed` when the game has no remaining questions.
- `intermission → paused` when an authorized administrator pauses the game.

An administrator may also be allowed to skip the remaining intermission time and immediately advance to the next question.

This should be an explicit command rather than a side effect of skipping a question.

## 2.5 `paused`

The game is temporarily suspended.

Expected behavior:
- Reject new answer submissions.
- Suspend question and intermission countdowns.
- Preserve the current question and recorded results.
- Display the paused status.
- Permit only authorized resume or administrative actions.

Transition:

`paused → previousState`

The state machine must remember the state from which the game was paused.

For example:
- Paused during `question_active` → resume answering.
- Paused during `intermission` → resume the intermission countdown.

Do not reset a timer merely because the game was paused.

## 2.6 `completed`

The game has ended.

Expected behavior:
- Display the final results.
- Prevent further gameplay submissions.
- Prevent automatic question advancement.
- Permit an authorized restart if the application supports restarting.

Transition:

`completed → lobby`

Restarting must create a clean game session or explicitly reset all session-specific state.

Do not accidentally retain the previous game's question index, answers, timers, or scoring records.

---

# 3. State Transition Diagram

The normal lifecycle is:

```text
                    ┌─────────┐
                    │  lobby  │
                    └────┬────┘
                         │ ADMIN_START
                         ▼
                 ┌────────────────┐
          ┌─────►│ question_active│◄─────────┐
          │      └───────┬────────┘          │
          │              │                   │
          │        ANSWER REVEALED            │
          │        or TIMEOUT                 │
          │              ▼                   │
          │      ┌────────────────┐          │
          │      │answer_revealed │          │
          │      └───────┬────────┘          │
          │              │                   │
          │              ▼                   │
          │      ┌────────────────┐          │
          └──────┤  intermission  │──────────┘
                 └───────┬────────┘
                         │ NO QUESTIONS LEFT
                         ▼
                    ┌───────────┐
                    │ completed │
                    └───────────┘
```

Additional transitions:

```text
question_active ── ADMIN_SKIP ──► intermission

question_active ── ADMIN_PAUSE ─► paused

intermission ───── ADMIN_PAUSE ─► paused

paused ─────────── ADMIN_RESUME ► previousState
```

Administrative commands must not create arbitrary state changes.

For example, an administrator cannot directly move a completed game into `question_active` without executing a valid restart or session initialization.

---

# 4. Question Data Model

Each question must have a stable identifier and no more than four answer choices.

```ts
export interface MultipleChoiceOption {
  id: string;
  label: string;
  text: string;
}

export interface MultipleChoiceQuestion {
  id: string;
  prompt: string;
  options: MultipleChoiceOption[];
  correctOptionId: string;
  durationSeconds: number;
  points: number;
}
```

## Validation rules

Before the game starts, validate every question.

Requirements:
- Question IDs must be unique within the question set.
- Option IDs must be unique within each question.
- Every question must contain between two and four options.
- Every question must have exactly one correct option.
- `correctOptionId` must match an existing option ID.
- The question prompt must not be empty.
- Option labels and text must be valid.
- `durationSeconds` must be a positive, finite number.
- `points` must follow the game's configured scoring rules.

For a conventional multiple-choice game, use four options where available, but allow fewer when the question legitimately has fewer answers.

Do not pad a two-option question with fabricated choices.

Do not hardcode answer labels as the source of correctness. The correct answer must be identified through `correctOptionId`, not by assuming that option C or D is correct.

## Example question

```ts
const exampleQuestion: MultipleChoiceQuestion = {
  id: "question-001",
  prompt: "Thủ đô của Việt Nam là thành phố nào?",
  options: [
    { id: "a", label: "A", text: "Hà Nội" },
    { id: "b", label: "B", text: "Đà Nẵng" },
    { id: "c", label: "C", text: "Huế" },
    { id: "d", label: "D", text: "Cần Thơ" },
  ],
  correctOptionId: "a",
  durationSeconds: 15,
  points: 100,
};
```

This is a structural example for implementation testing. Use the project owner's approved question data for actual gameplay.

---

# 5. State and Context Types

Represent the current game status using a discriminated union.

```ts
export type GameStatus =
  | "lobby"
  | "question_active"
  | "answer_revealed"
  | "intermission"
  | "paused"
  | "completed"
  | "error";

export type ResolutionReason =
  | "all_answers_received"
  | "timeout"
  | "admin_reveal"
  | "admin_skip";
```

Define the question result:

```ts
export interface AnswerRecord {
  playerId: string;
  questionId: string;
  selectedOptionId: string;
  correct: boolean;
  submittedAt: number;
  pointsAwarded: number;
}
```

Define the resolved question:

```ts
export interface QuestionResolution {
  questionId: string;
  reason: ResolutionReason;
  correctOptionId: string;
  resolvedAt: number;
}
```

Define the shared game context:

```ts
export interface GameContext {
  gameId: string;

  questions: MultipleChoiceQuestion[];
  currentIndex: number;

  answers: AnswerRecord[];
  resolutions: QuestionResolution[];

  questionDeadline: number | null;
  intermissionDeadline: number | null;

  feedbackDurationSeconds: number;
  intermissionDurationSeconds: number;

  pausedFrom: "question_active" | "intermission" | null;
  pausedRemainingMs: number | null;

  errorMessage?: string;
}
```

The authoritative state should also include the appropriate player, team, and scoring information required by the existing game architecture.

Do not duplicate information unnecessarily. For example, if the current team's score is already stored in an authoritative score table, do not create an independent frontend score variable and treat it as authoritative.

---

# 6. Player Events and Administrative Commands

Separate player actions from administrative commands.

## 6.1 Player events

```ts
export type PlayerEvent =
  | {
      type: "SUBMIT_ANSWER";
      playerId: string;
      questionId: string;
      optionId: string;
      requestId: string;
    };
```

The submitted `questionId` is important. It prevents an answer intended for an old question from being accepted after the game advances.

The `requestId` allows the backend to detect duplicate requests.

The backend must still obtain the authenticated player's identity from the trusted authentication context rather than trusting an arbitrary client-supplied identity.

## 6.2 Administrative commands

```ts
export type AdminCommand =
  | {
      type: "ADMIN_START";
    }
  | {
      type: "ADMIN_SKIP_QUESTION";
      reason?: string;
    }
  | {
      type: "ADMIN_REVEAL_ANSWER";
      reason?: string;
    }
  | {
      type: "ADMIN_PAUSE";
      reason?: string;
    }
  | {
      type: "ADMIN_RESUME";
    }
  | {
      type: "ADMIN_SKIP_INTERMISSION";
    }
  | {
      type: "ADMIN_GRANT_POINTS";
      targetId: string;
      amount: number;
      reason: string;
      requestId: string;
    }
  | {
      type: "ADMIN_DEDUCT_POINTS";
      targetId: string;
      amount: number;
      reason: string;
      requestId: string;
    }
  | {
      type: "ADMIN_END_GAME";
      reason: string;
    }
  | {
      type: "ADMIN_RESTART";
    };
```

These events represent requested operations, not permission to execute them.

Before processing a command, the backend must:
1. Authenticate the actor.
2. Check the actor's permissions.
3. Validate the current game state.
4. Validate command arguments.
5. Apply the transition atomically.
6. Record the result in the audit log.
7. Notify connected clients of the resulting state.

An unauthorized command must not change the game state.

---

# 7. Administrative Permissions

Not every privileged user should automatically have every administrative capability.

Define permissions explicitly.

```ts
export type GamePermission =
  | "game.start"
  | "game.pause"
  | "game.resume"
  | "question.skip"
  | "question.reveal"
  | "intermission.skip"
  | "points.grant"
  | "points.deduct"
  | "game.end"
  | "game.restart";
```

A possible permission model:

| Action | Player | Moderator | Admin |
|---|---:|---:|---:|
| Submit answer | Yes | Yes | Yes, if participating |
| View announced answer | Yes | Yes | Yes |
| Start game | No | Optional | Yes |
| Pause/resume | No | Optional | Yes |
| Skip question | No | Optional | Yes |
| Reveal answer early | No | Optional | Yes |
| Skip intermission | No | Optional | Yes |
| Grant/deduct points | No | No by default | Yes |
| End game | No | Optional | Yes |
| Restart game | No | No by default | Yes |

This is an example policy. Adapt the roles to the existing authorization model.

## Security requirements

- Enforce permissions on the backend.
- Never rely on hidden buttons or frontend role checks as the only security mechanism.
- Validate the actor's current privileges for every command.
- Validate target IDs and point amounts.
- Prevent unauthorized users from granting points to themselves or others.
- Record the actor, target, amount, reason, timestamp, and result of administrative point adjustments.
- Reject invalid commands without partially modifying the game.

For a small multiplayer application, a centralized permission-checking function is preferable to scattered role comparisons throughout the codebase.

---

# 8. Answer Submission and Resolution

The backend must own the authoritative answer evaluation process.

## 8.1 Submission flow

When a player submits an answer:

1. Authenticate the player.
2. Confirm the game is in `question_active`.
3. Confirm the submitted question ID matches the active question.
4. Confirm the question deadline has not passed.
5. Confirm the selected option belongs to the question.
6. Confirm the player has not already submitted for this question, if the rules permit only one attempt.
7. Record the answer.
8. Calculate points according to the configured scoring rules.
9. Determine whether all eligible participants have answered, if that rule is enabled.
10. If the question should resolve, perform the resolution transition atomically.

The client must not decide whether a submitted answer earns points.

## 8.2 Duplicate submissions

For the default implementation, allow one answer per player per question.

Use a database uniqueness constraint or equivalent atomic mechanism to prevent duplicate submissions.

A repeated submission must not:
- Award points twice.
- Replace a previously accepted answer unless answer changes are explicitly allowed.
- Trigger duplicate question resolution.
- Advance the question index.

## 8.3 Resolve the question

Question resolution must happen exactly once.

Resolution reasons:

| Reason | Meaning |
|---|---|
| `all_answers_received` | All required participants submitted before the deadline |
| `timeout` | The question deadline expired |
| `admin_reveal` | An authorized administrator revealed the answer early |
| `admin_skip` | An authorized administrator skipped the question |

When resolving a question:
- Freeze the accepted answer set.
- Determine the correct option.
- Finalize the relevant scoring.
- Store the resolution reason.
- Prevent new submissions.
- Schedule the feedback and intermission transitions.

If the game requires every participant to answer, define who counts as eligible and how disconnected participants are handled. Do not let a disconnected player keep the game waiting indefinitely.

If the game uses first-valid-answer-wins or team-based answers instead, implement that rule explicitly.

---

# 9. Early Answer Announcement

An administrator may reveal the correct answer before the normal question timer expires.

This operation must be distinct from skipping the question.

## Expected behavior

When `ADMIN_REVEAL_ANSWER` is accepted:

1. Confirm the actor has `question.reveal`.
2. Confirm the game is in `question_active`.
3. Freeze the accepted answer set.
4. Finalize the scoring according to the early-reveal policy.
5. Record the resolution reason as `admin_reveal`.
6. Reveal the correct option to all authorized viewers.
7. Transition to `answer_revealed`.
8. Start the feedback period.

**Do not accept new answers after the correct answer is revealed.**

Otherwise, players who have not answered could exploit the revealed answer.

## Early-reveal scoring policy

The scoring behavior must be explicitly configured.

Possible policies:
- **Normal scoring:** Award points for valid answers submitted before the reveal.
- **No further scoring:** Preserve already-recorded points and award nothing for subsequent actions.
- **Admin-defined outcome:** Use an explicitly authorized resolution process when the game requires special handling.

For a competitive game, the recommended default is to preserve valid pre-reveal results and prevent new submissions after the reveal.

Do not silently award full points to players who did not answer.

---

# 10. Question Skipping

An authorized administrator can skip the active question.

Command:

`ADMIN_SKIP_QUESTION`

Expected behavior:

1. Verify the actor's permission.
2. Verify that the game is in `question_active`.
3. Record the skip reason and administrator identity.
4. Stop the question timer.
5. Freeze submissions.
6. Apply the configured scoring policy for skipped questions.
7. Record the question resolution.
8. Enter `intermission`.

For skipped questions, the default policy should be:

- Do not award ordinary answer points merely for skipping.
- Preserve valid results already recorded, unless the game's rules explicitly require a different treatment.
- Do not allow new answers after the skip.
- Do not count the skipped question as correctly answered by anyone.
- Record the skip as an administrative event.

The game must not silently jump to the next question while leaving the current question unresolved in storage.

## Last-question behavior

If the administrator skips the final question:
- Resolve the skip.
- Display the result if required.
- Transition through the appropriate feedback or intermission phase.
- Complete the game without trying to load a nonexistent next question.

---

# 11. Question Timer and Inter-Question Countdown

The system has two distinct timers.

## 11.1 Question timer

Controls how long players can answer the current question.

Example:
- Question duration: 15 seconds.
- Deadline: authoritative server timestamp plus 15 seconds.

When the deadline passes:
- Reject new submissions.
- Resolve the question.
- Reveal the correct answer.
- Begin the feedback period.

The frontend may display a continuously updating countdown, but the backend must enforce the deadline.

## 11.2 Inter-question countdown

Controls how long the game waits before showing the next question.

Example:
- Feedback duration: 2 seconds.
- Intermission duration: 3 seconds.

A normal sequence:

```text
Question becomes active
        |
        v
15-second question timer
        |
        v
Question resolved
        |
        v
Correct answer displayed
        |
        v
2-second feedback period
        |
        v
3-second intermission countdown
        |
        v
Next question becomes active
```

The feedback and intermission periods must be separate configuration values, even if one is set to zero.

This avoids coupling answer announcements to the time between questions.

## 11.3 Timer representation

Use absolute deadlines rather than repeatedly subtracting one second from a stored counter.

Recommended fields:

```ts
interface TimerContext {
  questionDeadline: number | null;
  intermissionDeadline: number | null;
}
```

Store timestamps as Unix milliseconds if that matches the project's conventions.

The frontend calculates the remaining display time from the deadline.

The backend independently determines whether the deadline has expired.

This avoids cumulative drift when browsers become inactive or network messages arrive late.

## 11.4 Timer pause and resume

When pausing a timed state:

1. Calculate the remaining time using the authoritative clock.
2. Store the remaining duration.
3. Stop the active deadline from triggering transitions.
4. Record the state from which the game was paused.

When resuming:
1. Restore the previous state.
2. Set a new deadline based on the stored remaining duration.
3. Continue the countdown.

Do not reset the question to its original duration unless that is an explicitly configured game rule.

---

# 12. Point Grants and Score Integrity

Administrative point adjustments must be separate from normal answer scoring.

Do not implement point grants by modifying a UI score counter.

## 12.1 Point adjustment record

```ts
export interface PointAdjustment {
  id: string;
  gameId: string;
  actorId: string;
  targetId: string;
  amount: number;
  reason: string;
  createdAt: number;
  requestId: string;
}
```

Use a positive amount for grants and a negative amount for deductions, or use separate grant and deduction event types consistently throughout the application.

Do not support both conventions inconsistently.

## 12.2 Validation

For every adjustment:
- Confirm the actor has the appropriate permission.
- Confirm the target exists and belongs to the correct game or scoring group.
- Require a nonzero integer amount.
- Enforce configured upper and lower bounds.
- Prevent accidental overflow.
- Require a meaningful reason.
- Prevent duplicate execution using the request ID.
- Record the adjustment in the audit log.

For a team-based game, the target should be the appropriate team or player according to the scoring model.

**Preserve the existing team rules.** If points are shared between teammates or transferred between teams, apply adjustments through the existing authoritative scoring system rather than creating a separate score model.

## 12.3 Score calculation

Keep these concepts separate:

1. **Answer points:** Points earned through normal gameplay.
2. **Administrative adjustments:** Authorized grants or deductions.
3. **Displayed total:** The result of combining all applicable scoring events.

A transparent scoring model should make it possible to explain why a participant or team has a particular score.

Do not delete or overwrite the original scoring events when an administrator grants or deducts points.

Instead, append an adjustment event.

For example:

```text
Initial answer score:        300
Administrative grant:        +50
Administrative deduction:    -20
Displayed total:              330
```

This is an illustrative calculation, not a fixed scoring rule.

For team-based scoring, the authoritative backend must calculate the applicable total from the existing team and scoring records.

---

# 13. Concurrency and Authoritative Backend

For a multiplayer game, multiple clients may submit answers or issue administrative commands at nearly the same time.

The backend must serialize conflicting transitions.

Examples:
- Two administrators attempt to skip the same question.
- A player submits an answer at the exact moment the timer expires.
- An answer arrives while an administrator reveals the correct answer.
- An administrator grants points while another command updates the score.
- Multiple clients receive the same transition event.

## Required protections

### Atomic transitions

The state check, state update, and associated result recording must be performed atomically.

A command must not validate against an old state and then modify a newer state.

### Version checks

Maintain a monotonically increasing game-state version or equivalent concurrency-control mechanism.

Each successful state transition increments the version.

Reject or safely reconcile commands based on stale state versions.

### Idempotency

Commands that may be retried over the network must have idempotency protection.

Examples:
- Answer submission.
- Question skip.
- Early answer reveal.
- Point adjustment.
- Game start.

A retry must not execute the same logical action twice.

### Timer race handling

If a submission and a timeout happen concurrently, the backend must apply one deterministic rule.

Recommended rule:
- Accept a submission only if the authoritative server receives and validates it before the deadline, using a consistent server-side time check.
- Resolve the question only once.
- Reject submissions after resolution.

Define the exact boundary behavior and test it.

### Client synchronization

The backend broadcasts accepted state changes to connected clients.

Clients must not invent their own authoritative transitions when a broadcast is delayed.

If a client reconnects:
1. Fetch the current authoritative game state.
2. Reconcile its local display.
3. Resume listening for updates.

---

# 14. State Machine Implementation Structure

Keep the state machine separate from UI components.

A possible project structure:

```text
src/
├── game/
│   ├── types.ts
│   ├── questionValidation.ts
│   ├── answerScoring.ts
│   ├── stateMachine.ts
│   ├── adminPermissions.ts
│   └── timerUtils.ts
├── components/
│   ├── game/
│   │   ├── QuestionPanel.tsx
│   │   ├── AnswerOptions.tsx
│   │   ├── QuestionTimer.tsx
│   │   ├── AnswerReveal.tsx
│   │   ├── IntermissionCountdown.tsx
│   │   └── GameResults.tsx
│   └── admin/
│       ├── AdminGameControls.tsx
│       ├── PointAdjustmentForm.tsx
│       └── GameEventLog.tsx
└── pages/
```

This structure is a recommendation, not a requirement to reorganize an existing repository.

If the project already has a backend and shared TypeScript contracts, keep authoritative state transitions and authorization on the backend.

The frontend may reuse the type definitions, but sharing types does not make the frontend authoritative.

---

# 15. Implementation Checkpoints

The AI agent must implement this system incrementally.

## Checkpoint 1 — Inspect the existing project

Before writing code:
1. Inspect the current game architecture.
2. Identify the existing game states.
3. Identify how questions and answers are stored.
4. Identify the scoring model.
5. Identify the authentication and role system.
6. Identify the timer implementation.
7. Identify the mechanism used to synchronize multiple clients.

**Acceptance criteria:** The agent reports which existing components and services will be reused.

Do not replace working infrastructure unnecessarily.

## Checkpoint 2 — Define types and validate questions

Implement:
- Question and option types.
- State types.
- Player events.
- Administrative commands.
- Question validation.

**Acceptance criteria:**
- Questions cannot contain more than four options.
- Invalid correct-answer references are rejected.
- Invalid timer values are rejected.
- TypeScript checks pass.

## Checkpoint 3 — Implement the pure transition logic

Implement the normal lifecycle:
- Lobby.
- Active question.
- Answer reveal.
- Intermission.
- Completion.

Add pause/resume and error handling after the core transitions work.

**Acceptance criteria:** Every transition can be tested without rendering the UI.

## Checkpoint 4 — Implement answer processing and scoring

Implement:
- Answer validation.
- Duplicate-submission prevention.
- Result recording.
- Normal score calculation.
- Question resolution.

**Acceptance criteria:** Repeated submissions cannot duplicate scoring or resolve the same question twice.

## Checkpoint 5 — Implement timers

Implement:
- Question deadlines.
- Feedback duration.
- Intermission countdown.
- Pause/resume timing.

**Acceptance criteria:** Timers remain correct when clients become inactive, reconnect, or receive delayed events.

## Checkpoint 6 — Implement administrative commands

Implement:
- Start.
- Pause/resume.
- Skip question.
- Reveal answer.
- Skip intermission.
- Grant/deduct points.
- End game.
- Restart.

**Acceptance criteria:**
- Unauthorized commands are rejected.
- Invalid state transitions are rejected.
- Point adjustments are validated and auditable.
- Repeated commands cannot execute the same operation twice.

## Checkpoint 7 — Integrate the UI

Connect the game UI to the authoritative state.

Display:
- Current question.
- Up to four answer choices.
- Question countdown.
- Correct-answer announcement.
- Intermission countdown.
- Scores and results.
- Admin controls for authorized users.

**Acceptance criteria:** UI state always reflects the authoritative game state.

## Checkpoint 8 — Test concurrent interactions

Test:
- Two simultaneous answer submissions.
- A submission racing against a timeout.
- A submission racing against an admin reveal.
- Two administrators attempting the same skip.
- Repeated point-grant requests.
- A client reconnecting during intermission.
- Pausing and resuming at different stages.

**Acceptance criteria:** No duplicate scores, inconsistent question indices, or invalid state transitions occur.

## Checkpoint 9 — Final verification

Run the existing:
- TypeScript checks.
- Linter.
- Build.
- Unit tests.
- Integration tests.

Manually verify the complete game lifecycle.

Do not claim tests have passed unless they have actually been executed.

---

# 16. Final Acceptance Criteria

The implementation is complete when:

- [ ] Each question has between two and four answer choices.
- [ ] Only one correct option is defined per question.
- [ ] Players can answer only during `question_active`.
- [ ] Question deadlines are enforced by the backend.
- [ ] The correct answer can be revealed early by an authorized administrator.
- [ ] Revealing the answer prevents further submissions.
- [ ] Authorized administrators can skip questions.
- [ ] Skipped questions do not receive ordinary answer points by default.
- [ ] The inter-question countdown operates independently of the question timer.
- [ ] Pause/resume preserves the remaining timer duration.
- [ ] Point grants and deductions are validated and auditable.
- [ ] Duplicate commands cannot apply the same scoring adjustment twice.
- [ ] Invalid transitions are rejected.
- [ ] Concurrent actions cannot corrupt the game state.
- [ ] Reconnecting clients recover the authoritative state.
- [ ] Existing team rules and scoring behavior are preserved.
- [ ] The UI does not independently control authoritative gameplay.
- [ ] The complete lifecycle has automated test coverage.

**Final principle:** Every player action and administrative command must be validated against the authoritative game state, and every accepted action must produce a consistent, auditable result.