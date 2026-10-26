BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE public.team_role AS ENUM ('north', 'south');
CREATE TYPE public.question_kind AS ENUM ('multiple_choice', 'fill_blank');
CREATE TYPE public.game_status AS ENUM ('LOBBY', 'ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE public.question_state AS ENUM ('draft', 'active', 'locked', 'completed');
CREATE TYPE public.key_state AS ENUM ('not_awarded', 'awarded', 'submitted');

CREATE TABLE public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name text NOT NULL,
    role text NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'admin')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.game_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    status public.game_status NOT NULL DEFAULT 'LOBBY',
    started_at timestamptz,
    ended_at timestamptz,
    duration_minutes integer NOT NULL DEFAULT 10 CHECK (duration_minutes > 0),
    admin_profile_id uuid REFERENCES public.profiles(id),
    south_team_points integer NOT NULL DEFAULT 0 CHECK (south_team_points >= 0),
    north_support_points integer NOT NULL DEFAULT 0 CHECK (north_support_points >= 0),
    south_progress numeric(5,2) NOT NULL DEFAULT 0 CHECK (south_progress >= 0 AND south_progress <= 1),
    south_key_status public.key_state NOT NULL DEFAULT 'not_awarded',
    north_key_status public.key_state NOT NULL DEFAULT 'not_awarded',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (status = 'ACTIVE' AND started_at IS NOT NULL) OR status <> 'ACTIVE'
    )
);

CREATE TABLE public.team_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    team public.team_role NOT NULL,
    is_admin boolean NOT NULL DEFAULT false,
    joined_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (session_id, profile_id)
);

CREATE TABLE public.team_states (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
    team public.team_role NOT NULL,
    shared_points integer NOT NULL DEFAULT 0 CHECK (shared_points >= 0),
    support_points integer NOT NULL DEFAULT 0 CHECK (support_points >= 0),
    key_status public.key_state NOT NULL DEFAULT 'not_awarded',
    south_progress numeric(5,2) DEFAULT 0 CHECK (south_progress >= 0 AND south_progress <= 1),
    UNIQUE (session_id, team)
);

CREATE TABLE public.questions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
    owner_team public.team_role NOT NULL,
    kind public.question_kind NOT NULL,
    prompt text NOT NULL CHECK (length(prompt) > 0),
    unlock_cost integer NOT NULL DEFAULT 0 CHECK (unlock_cost >= 0),
    support_reward_base integer NOT NULL DEFAULT 0 CHECK (support_reward_base >= 0),
    state public.question_state NOT NULL DEFAULT 'draft',
    created_by uuid NOT NULL REFERENCES public.profiles(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz
);

CREATE TABLE public.question_secret_answers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id uuid NOT NULL UNIQUE REFERENCES public.questions(id) ON DELETE CASCADE,
    correct_answer text NOT NULL,
    normalization jsonb NOT NULL DEFAULT '{"trim": true, "caseInsensitive": true, "collapseWhitespace": true}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.question_unlocks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
    question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    unlocked_by uuid NOT NULL REFERENCES public.profiles(id),
    unlocked_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (session_id, question_id)
);

CREATE TABLE public.question_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
    question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    created_by uuid NOT NULL REFERENCES public.profiles(id),
    team public.team_role NOT NULL,
    submitted_answer text NOT NULL,
    normalized_answer text NOT NULL,
    is_correct boolean NOT NULL,
    points_delta integer NOT NULL DEFAULT 0,
    support_reward integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    response_nonce text NOT NULL,
    UNIQUE (session_id, question_id, created_by, response_nonce)
);

CREATE TABLE public.game_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
    event_type text NOT NULL,
    event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid REFERENCES public.profiles(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.current_user_is_session_admin(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.game_sessions gs
        WHERE gs.id = p_session_id
          AND gs.admin_profile_id = auth.uid()
    );
$$;

CREATE INDEX idx_game_sessions_code ON public.game_sessions (code);
CREATE INDEX idx_team_members_session_team ON public.team_members (session_id, team);
CREATE INDEX idx_questions_session_state ON public.questions (session_id, state);
CREATE INDEX idx_question_unlocks_session_id ON public.question_unlocks (session_id);
CREATE INDEX idx_question_attempts_session_question ON public.question_attempts (session_id, question_id, created_at DESC);
CREATE INDEX idx_game_events_session_created_at ON public.game_events (session_id, created_at DESC);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_secret_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_manage_own_row"
ON public.profiles
FOR ALL
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE POLICY "sessions_select_members_or_admin"
ON public.game_sessions
FOR SELECT
USING (
    admin_profile_id = auth.uid()
    OR EXISTS (
        SELECT 1
        FROM public.team_members tm
        WHERE tm.session_id = public.game_sessions.id
          AND tm.profile_id = auth.uid()
    )
);

CREATE POLICY "sessions_update_only_admin"
ON public.game_sessions
FOR UPDATE
USING (public.current_user_is_session_admin(id))
WITH CHECK (public.current_user_is_session_admin(id));

CREATE POLICY "members_select_self_or_session_admin"
ON public.team_members
FOR SELECT
USING (
    profile_id = auth.uid()
    OR EXISTS (
        SELECT 1
        FROM public.game_sessions gs
        WHERE gs.id = public.team_members.session_id
          AND gs.admin_profile_id = auth.uid()
    )
);

CREATE POLICY "members_manage_own_membership"
ON public.team_members
FOR INSERT
WITH CHECK (profile_id = auth.uid());

CREATE POLICY "team_states_select_members_or_admin"
ON public.team_states
FOR SELECT
USING (
    EXISTS (
        SELECT 1
        FROM public.team_members tm
        WHERE tm.session_id = public.team_states.session_id
          AND tm.profile_id = auth.uid()
    )
    OR public.current_user_is_session_admin(public.team_states.session_id)
);

CREATE POLICY "questions_select_members_or_admin"
ON public.questions
FOR SELECT
USING (
    EXISTS (
        SELECT 1
        FROM public.team_members tm
        WHERE tm.session_id = public.questions.session_id
          AND tm.profile_id = auth.uid()
    )
    OR public.current_user_is_session_admin(public.questions.session_id)
);

CREATE POLICY "secret_answers_select_admin_only"
ON public.question_secret_answers
FOR SELECT
USING (
    EXISTS (
        SELECT 1
        FROM public.questions q
        WHERE q.id = public.question_secret_answers.question_id
          AND public.current_user_is_session_admin(q.session_id)
    )
);

CREATE POLICY "unlocks_select_members_or_admin"
ON public.question_unlocks
FOR SELECT
USING (
    unlocked_by = auth.uid()
    OR EXISTS (
        SELECT 1
        FROM public.team_members tm
        WHERE tm.session_id = public.question_unlocks.session_id
          AND tm.profile_id = auth.uid()
    )
    OR public.current_user_is_session_admin(public.question_unlocks.session_id)
);

CREATE POLICY "attempts_select_members_or_admin"
ON public.question_attempts
FOR SELECT
USING (
    created_by = auth.uid()
    OR EXISTS (
        SELECT 1
        FROM public.team_members tm
        WHERE tm.session_id = public.question_attempts.session_id
          AND tm.profile_id = auth.uid()
    )
    OR public.current_user_is_session_admin(public.question_attempts.session_id)
);

CREATE POLICY "events_select_members_or_admin"
ON public.game_events
FOR SELECT
USING (
    created_by = auth.uid()
    OR EXISTS (
        SELECT 1
        FROM public.team_members tm
        WHERE tm.session_id = public.game_events.session_id
          AND tm.profile_id = auth.uid()
    )
    OR public.current_user_is_session_admin(public.game_events.session_id)
);

REVOKE ALL ON public.question_secret_answers FROM public;
REVOKE ALL ON public.game_sessions FROM public;
REVOKE ALL ON public.questions FROM public;

COMMIT;
