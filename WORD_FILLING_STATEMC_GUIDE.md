# Word-Filling Minigame — State Machine Implementation Guide

## 1. Objective

Implement a simple, predictable state machine for a word-filling minigame using TypeScript.

The state machine must control the gameplay lifecycle, including:
- Starting a game.
- Displaying a question.
- Accepting player input.
- Validating an answer.
- Showing feedback.
- Advancing to the next question.
- Completing or restarting the game.

The implementation should be easy to test, maintain, and extend without unnecessarily complicating a small minigame.

**Core principle:** The state machine controls what the player can do at any moment. The UI displays the current state and sends events to the state machine.

Do not allow UI components to independently manage conflicting gameplay states.

---

# 2. Define the Game Rules First

Before implementation, establish these assumptions:

1. A game contains a finite list of questions.
2. Each question has an expected answer.
3. The player enters an answer and submits it.
4. The game evaluates the submitted answer.
5. The game displays whether the answer is correct.
6. The player proceeds to the next question.
7. The game ends when all questions have been completed.
8. The player can restart a completed game.

For the initial implementation:
- Allow one submission per question.
- Ignore submissions containing only whitespace.
- Compare answers according to an explicitly defined normalization rule.
- Give each question one attempt.
- Do not implement timers, hints, multiplayer synchronization, or persistence unless required by the existing specification.

These assumptions intentionally keep the initial state machine small.

If the actual game allows multiple attempts, automatic advancement, or different scoring rules, adjust the transitions without adding unrelated complexity.

---

# 3. State Definitions

Use five primary states.

| State | Meaning | Allowed player actions |
|---|---|---|
| `ready` | The game has not started. | Start the game |
| `answering` | The current question is active. | Enter and submit an answer |
| `feedback` | The submitted answer is being displayed. | Continue to the next question |
| `completed` | All questions have been completed. | Restart the game |
| `error` | The game cannot continue because of an unrecoverable gameplay or data error. | Return to a safe state or restart, where possible |

The `error` state is optional for a truly minimal implementation. If the application already has an established error-handling mechanism, reuse it rather than introducing a competing system.

### State 1: `ready`

The initial state.

Expected behavior:
- Display the game introduction.
- Do not accept answer submissions.
- Wait for the player to start.

Transition:

`ready → answering` when the player starts and a valid question list is available.

If no questions are available, the game must not enter `answering`.

### State 2: `answering`

The player is answering the current question.

Expected behavior:
- Display the question.
- Allow text input.
- Allow submission when the answer is nonempty.
- Prevent submission while the answer is empty or whitespace-only.

Transition:

`answering → feedback` when a valid answer is submitted.

At submission:
1. Normalize the answer.
2. Compare it with the expected answer.
3. Record the result.
4. Update the score according to the game rules.
5. Enter `feedback`.

The submitted answer must be evaluated exactly once.

### State 3: `feedback`

The player has submitted an answer and the game displays the result.

Expected behavior:
- Display whether the answer is correct.
- Optionally reveal the correct answer.
- Prevent further editing or submission for the current question.
- Allow the player to continue.

Transitions:

- `feedback → answering` if another question exists.
- `feedback → completed` if the current question was the last question.

Do not evaluate another answer while in this state.

### State 4: `completed`

The game has ended.

Expected behavior:
- Display the final score.
- Display the number of correct answers.
- Disable answer submission.
- Offer a restart action.

Transition:

`completed → answering` when the player restarts and the question list is valid.

Restarting must reset all game-specific state.

### State 5: `error`

Use this state only when an error prevents the game from continuing normally.

Examples:
- Invalid or missing question data.
- A corrupted game session.
- A question index that cannot be resolved.

Expected behavior:
- Display a clear, user-friendly error message.
- Prevent invalid gameplay actions.
- Offer recovery if recovery is possible.

Do not use `error` for ordinary incorrect answers. Incorrect answers belong in `feedback`.

---

# 4. State Transition Diagram

The normal gameplay lifecycle is:

```text
              START
                |
                v
             [ready]
                |
                v
           [answering]
                |
          SUBMIT ANSWER
                |
                v
            [feedback]
             /       \
            /         \
    MORE QUESTIONS   LAST QUESTION
          /               \
         v                 v
    [answering]        [completed]
                            |
                         RESTART
                            |
                            v
                       [answering]
```

An invalid game configuration may transition to `error` instead of starting.

The key restriction is that a player cannot transition directly from `answering` to the next question without passing through `feedback`, unless the game rules explicitly support automatic advancement.

---

# 5. TypeScript Data Model

Define the question and game-state types before implementing transitions.

## 5.1 Question type

```ts
export interface WordQuestion {
  id: string;
  prompt: string;
  expectedAnswer: string;
}
```

Each question must have a stable identifier and a nonempty expected answer.

The `prompt` may contain the word or sentence with a blank, depending on how the existing UI represents missing content.

Do not place UI-specific state, such as whether an input is focused, inside the question data.

## 5.2 Game state

Use a discriminated union so that each state has only the data it needs.

```ts
export interface GameResult {
  questionId: string;
  submittedAnswer: string;
  correct: boolean;
}

export interface GameContext {
  questions: WordQuestion[];
  currentIndex: number;
  draftAnswer: string;
  results: GameResult[];
  errorMessage?: string;
}

export type GameState =
  | {
      status: "ready";
      context: GameContext;
    }
  | {
      status: "answering";
      context: GameContext;
    }
  | {
      status: "feedback";
      context: GameContext;
      lastResult: GameResult;
    }
  | {
      status: "completed";
      context: GameContext;
    }
  | {
      status: "error";
      context: GameContext;
      message: string;
    };
```

This design makes the current status explicit and gives TypeScript the ability to narrow the state type.

For example, `lastResult` exists only in the `feedback` state.

Do not maintain separate booleans such as:

```ts
// Avoid this approach.
isPlaying: boolean;
isShowingFeedback: boolean;
isCompleted: boolean;
```

Independent booleans can create contradictory combinations, such as a game being marked both completed and actively answering.

Use the single `status` field instead.

---

# 6. Define the Event Model

The UI should communicate with the state machine through explicit events.

```ts
export type GameEvent =
  | { type: "START" }
  | { type: "ANSWER_CHANGED"; value: string }
  | { type: "SUBMIT_ANSWER" }
  | { type: "NEXT_QUESTION" }
  | { type: "RESTART" };
```

Each event represents an intention, not an arbitrary mutation of game state.

Examples:
- Clicking Start sends `START`.
- Typing sends `ANSWER_CHANGED`.
- Clicking Submit sends `SUBMIT_ANSWER`.
- Clicking Continue sends `NEXT_QUESTION`.
- Clicking Play Again sends `RESTART`.

The UI must not directly change `currentIndex`, append results, or determine whether the game is completed.

Those responsibilities belong to the state machine.

---

# 7. Answer Normalization and Validation

Define the answer-comparison rules centrally.

For a Vietnamese word-filling game, decide whether capitalization, whitespace, and diacritics affect correctness.

A sensible default is:
- Ignore leading and trailing whitespace.
- Compare case-insensitively.
- Preserve Vietnamese diacritics.
- Do not automatically treat accented and unaccented Vietnamese text as equivalent.

For example, `Hà Nội` and `hà nội` should match, but `Ha Noi` should not automatically match `Hà Nội`.

Example implementation:

```ts
export function normalizeAnswer(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .toLocaleLowerCase("vi-VN");
}
```

Then compare normalized values:

```ts
export function isAnswerCorrect(
  submittedAnswer: string,
  expectedAnswer: string,
): boolean {
  return (
    normalizeAnswer(submittedAnswer) ===
    normalizeAnswer(expectedAnswer)
  );
}
```

If the game uses English vocabulary, choose the appropriate locale and normalization rules.

Do not normalize away meaningful characters or punctuation unless the game specification explicitly allows it.

### Submission validation

A submission is valid only when:
1. The game is in `answering`.
2. The current question exists.
3. The submitted answer contains non-whitespace characters.

An invalid submission must not:
- Increment the score.
- Append a result.
- Advance the question index.
- Change the current state.

The UI should normally disable the Submit button for an empty answer, but the state machine must enforce the same restriction independently.

---

# 8. Implement the Transition Function

Use a pure reducer-style function.

A pure function receives the current state and an event, then returns the next state without directly modifying the original state.

Example:

```ts
export function transition(
  state: GameState,
  event: GameEvent,
): GameState {
  switch (event.type) {
    case "START": {
      if (state.status !== "ready") {
        return state;
      }

      if (state.context.questions.length === 0) {
        return {
          status: "error",
          context: state.context,
          message: "Không có câu hỏi để bắt đầu.",
        };
      }

      return {
        status: "answering",
        context: {
          ...state.context,
          currentIndex: 0,
          draftAnswer: "",
          results: [],
        },
      };
    }

    case "ANSWER_CHANGED": {
      if (state.status !== "answering") {
        return state;
      }

      return {
        status: "answering",
        context: {
          ...state.context,
          draftAnswer: event.value,
        },
      };
    }

    case "SUBMIT_ANSWER": {
      if (state.status !== "answering") {
        return state;
      }

      const question =
        state.context.questions[state.context.currentIndex];

      if (
        !question ||
        normalizeAnswer(state.context.draftAnswer) === ""
      ) {
        return state;
      }

      const result: GameResult = {
        questionId: question.id,
        submittedAnswer: state.context.draftAnswer,
        correct: isAnswerCorrect(
          state.context.draftAnswer,
          question.expectedAnswer,
        ),
      };

      const context: GameContext = {
        ...state.context,
        results: [...state.context.results, result],
      };

      return {
        status: "feedback",
        context,
        lastResult: result,
      };
    }

    case "NEXT_QUESTION": {
      if (state.status !== "feedback") {
        return state;
      }

      const nextIndex = state.context.currentIndex + 1;

      if (nextIndex >= state.context.questions.length) {
        return {
          status: "completed",
          context: state.context,
        };
      }

      return {
        status: "answering",
        context: {
          ...state.context,
          currentIndex: nextIndex,
          draftAnswer: "",
        },
      };
    }

    case "RESTART": {
      if (state.status !== "completed") {
        return state;
      }

      if (state.context.questions.length === 0) {
        return {
          status: "error",
          context: state.context,
          message: "Không có câu hỏi để bắt đầu.",
        };
      }

      return {
        status: "answering",
        context: {
          ...state.context,
          currentIndex: 0,
          draftAnswer: "",
          results: [],
          errorMessage: undefined,
        },
      };
    }

    default: {
      return state;
    }
  }
}
```

### Implementation notes

This reducer is a starting implementation, not a complete production framework.

Before integrating it:

- Validate the question data at initialization.
- Decide whether restarting should be allowed from every state or only from `completed`.
- Ensure the question list cannot change unexpectedly during a game.
- Consider whether the final feedback must remain visible before completion.
- Use the project's existing state-management conventions where appropriate.

An invalid current question should ideally be detected during initialization or through a defined recovery path rather than silently leaving the player stuck.

The important requirement is that all gameplay transitions remain explicit and testable.

---

# 9. Scoring Rules

For the initial version, use a simple scoring model:

- Each question is worth one point.
- A correct answer awards one point.
- An incorrect answer awards zero points.
- Each question can produce only one result.
- The final score is calculated from recorded results.

Calculate the score from the results rather than maintaining a separate score variable that can become inconsistent.

```ts
export function calculateScore(
  results: GameResult[],
): number {
  return results.filter((result) => result.correct).length;
}
```

The completion percentage can be derived from the question count:

```ts
export function calculateCompletion(
  completedCount: number,
  totalCount: number,
): number {
  if (totalCount <= 0) {
    return 0;
  }

  return Math.round((completedCount / totalCount) * 100);
}
```

Do not calculate a completion percentage when the total question count is zero without handling that case.

If the game later adds weighted questions, penalties, or partial credit, update the scoring model independently from the UI.

---

# 10. UI Integration Rules

The UI renders the current state and dispatches events.

It must not become a second state machine.

| Game state | UI behavior |
|---|---|
| `ready` | Show introduction and Start button |
| `answering` | Show the current question, input, and Submit button |
| `feedback` | Show answer feedback and Continue button |
| `completed` | Show final score and Restart button |
| `error` | Show an error message and available recovery actions |

### Important rules

**Input**
- Only editable during `answering`.
- Preserve the draft while the player is answering.
- Clear it when advancing to the next question.
- Clear it when restarting.

**Submit**
- Enabled only when the game is answering and the draft is nonempty.
- Must not submit twice.
- Must not submit during feedback or after completion.

**Feedback**
- Display the result associated with the most recent submission.
- Do not recalculate or append the same result when rendering.
- Show the correct answer when appropriate.

**Completion**
- Display the final score using the recorded results.
- Do not allow more questions to be submitted.
- Reset all session-specific data when restarting.

Do not use effects to derive ordinary state transitions when the reducer can perform them directly.

---

# 11. Testing Strategy

Test the state machine independently of React.

The transition function should be testable without rendering a page or interacting with the DOM.

Use the repository's existing testing framework.

## Test group A — Initialization

Verify:
- The initial state is `ready`.
- The current question index is initialized correctly.
- The result list is empty.
- An empty question list cannot start a game.

## Test group B — Starting

Verify:
- `START` moves a valid game to `answering`.
- The first question becomes active.
- Starting does not duplicate or mutate the question list.
- `START` is ignored when the game is already answering.

## Test group C — Answer input

Verify:
- `ANSWER_CHANGED` updates the draft in `answering`.
- Empty submissions are rejected.
- Whitespace-only submissions are rejected.
- Answer changes are ignored during feedback.
- Answer changes are ignored after completion.

## Test group D — Answer submission

Verify:
- A correct answer produces a correct result.
- An incorrect answer produces an incorrect result.
- The game transitions to `feedback`.
- One submission appends exactly one result.
- Repeated submission events cannot append duplicate results.
- Vietnamese case-insensitive comparison works as specified.
- Vietnamese diacritics remain significant.

## Test group E — Advancing

Verify:
- `NEXT_QUESTION` advances to the next question.
- The draft answer is cleared.
- The question index advances exactly once.
- The last question transitions to `completed`.
- Advancing is ignored when the game is not in `feedback`.

## Test group F — Restarting

Verify:
- Restart resets the question index.
- Restart clears prior results.
- Restart clears the draft.
- The game returns to the first question.
- Restart is rejected in states where it is not supported.

## Test group G — Invariants

Verify that:
- `currentIndex` never points to a nonexistent active question.
- The result count never exceeds the number of questions.
- Every question is evaluated at most once per game session.
- The score equals the number of correct results.
- Completed games cannot accept new answers.
- Invalid events do not mutate the existing state.

---

# 12. AI Agent Implementation Checkpoints

Implement the system incrementally.

### Checkpoint 1 — Define types

Create:
- `WordQuestion`.
- `GameResult`.
- `GameContext`.
- `GameState`.
- `GameEvent`.

**Acceptance criteria:** TypeScript compilation succeeds.

### Checkpoint 2 — Implement answer utilities

Create:
- `normalizeAnswer`.
- `isAnswerCorrect`.
- `calculateScore`.
- `calculateCompletion`.

**Acceptance criteria:** Unit tests cover normal answers, whitespace, capitalization, and Vietnamese diacritics.

### Checkpoint 3 — Implement the transition function

Implement the five states and their valid transitions.

**Acceptance criteria:** Unit tests cover every event and every state.

Do not integrate the UI yet.

### Checkpoint 4 — Connect the game UI

Connect existing components to the transition function using the project's established state-management approach.

**Acceptance criteria:** A player can start, answer, view feedback, continue, finish, and restart.

### Checkpoint 5 — Test invalid interactions

Test repeated submissions, empty answers, invalid events, and attempts to advance from the wrong state.

**Acceptance criteria:** Invalid events do not corrupt the game state.

### Checkpoint 6 — Verify the complete game

Run the existing TypeScript checks, tests, and build.

Manually test the full gameplay lifecycle on desktop and mobile.

**Acceptance criteria:** The game behaves consistently and existing gameplay requirements remain intact.

---

# 13. Out of Scope for the Initial Version

Do not implement the following unless required by the actual game specification:

- Timers.
- Hints.
- Multiple attempts.
- Persistent scores.
- Multiplayer synchronization.
- Network requests.
- Complex animation state machines.
- Undo and redo.
- Dynamic question loading during an active session.

These features introduce additional transitions and edge cases. Add them only when their requirements are clear.

---

# Final Implementation Principle

**The state machine owns the gameplay lifecycle; the UI renders the state; utility functions handle deterministic calculations.**

Keep these responsibilities separate.

A small, explicit state machine is preferable to a large framework or a collection of unrelated booleans. The goal is to make every possible gameplay transition understandable, testable, and predictable.