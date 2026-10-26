BEGIN;

GRANT SELECT (id, code, status), INSERT (code, status, admin_profile_id)
ON public.game_sessions TO authenticated;

CREATE POLICY "authenticated_users_create_lobby_sessions"
ON public.game_sessions
FOR INSERT
WITH CHECK (
    status = 'LOBBY'
    AND admin_profile_id = auth.uid()
);

CREATE POLICY "authenticated_users_discover_open_lobbies"
ON public.game_sessions
FOR SELECT
USING (status = 'LOBBY');

GRANT SELECT (id, display_name, role), INSERT, UPDATE
ON public.profiles TO authenticated;

GRANT SELECT, INSERT, UPDATE
ON public.team_members TO authenticated;

CREATE POLICY "members_update_own_membership"
ON public.team_members
FOR UPDATE
USING (profile_id = auth.uid())
WITH CHECK (profile_id = auth.uid());

DROP FUNCTION IF EXISTS public.create_lobby_room();
DROP FUNCTION IF EXISTS public.join_lobby_room(text, text, public.team_role);

COMMIT;
