BEGIN;

CREATE TABLE IF NOT EXISTS public.question_bank (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_team public.team_role NOT NULL,
    kind public.question_kind NOT NULL,
    prompt text NOT NULL CHECK (length(prompt) > 0),
    choices jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(choices) = 'array'),
    unlock_cost integer NOT NULL DEFAULT 0 CHECK (unlock_cost >= 0),
    support_reward_base integer NOT NULL DEFAULT 0 CHECK (support_reward_base >= 0),
    is_active boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.question_bank_answers (
    question_id uuid PRIMARY KEY REFERENCES public.question_bank(id) ON DELETE CASCADE,
    correct_answer text NOT NULL,
    normalization jsonb NOT NULL DEFAULT '{"trim": true, "caseInsensitive": true, "collapseWhitespace": true}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_bank_answers ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.question_bank TO anon, authenticated;
REVOKE ALL ON public.question_bank_answers FROM anon, authenticated;

CREATE POLICY "read_active_question_bank"
ON public.question_bank
FOR SELECT
TO anon, authenticated
USING (is_active);

DROP POLICY IF EXISTS "authenticated_users_create_lobby_sessions" ON public.game_sessions;
DROP POLICY IF EXISTS "authenticated_users_discover_open_lobbies" ON public.game_sessions;
DROP POLICY IF EXISTS "members_update_own_membership" ON public.team_members;
DROP POLICY IF EXISTS "session_admins_select_member_profiles" ON public.profiles;

REVOKE ALL ON public.game_sessions, public.team_members, public.team_states,
    public.profiles, public.questions, public.question_secret_answers,
    public.question_unlocks, public.question_attempts, public.game_events
FROM anon, authenticated;

DROP FUNCTION IF EXISTS public.create_lobby_room();
DROP FUNCTION IF EXISTS public.join_lobby_room(text, text, public.team_role);

COMMIT;
