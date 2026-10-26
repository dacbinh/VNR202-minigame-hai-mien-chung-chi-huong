BEGIN;

GRANT SELECT ON public.game_sessions, public.team_members, public.profiles TO authenticated;

CREATE POLICY "session_admins_select_member_profiles"
ON public.profiles
FOR SELECT
USING (
    EXISTS (
        SELECT 1
        FROM public.team_members tm
        JOIN public.game_sessions gs ON gs.id = tm.session_id
        WHERE tm.profile_id = public.profiles.id
          AND gs.admin_profile_id = auth.uid()
    )
);

CREATE OR REPLACE FUNCTION public.create_lobby_room()
RETURNS TABLE (session_id uuid, room_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_session_id uuid;
    v_room_code text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication is required to create a room.';
    END IF;

    INSERT INTO public.profiles (id, display_name, role)
    VALUES (auth.uid(), 'Chủ phòng', 'admin')
    ON CONFLICT (id) DO UPDATE
    SET role = 'admin', updated_at = now();

    LOOP
        v_room_code := pg_catalog.upper(
            pg_catalog.substr(
                pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''),
                1,
                6
            )
        );

        BEGIN
            INSERT INTO public.game_sessions (code, status, admin_profile_id)
            VALUES (v_room_code, 'LOBBY', auth.uid())
            RETURNING id INTO v_session_id;
            EXIT;
        EXCEPTION WHEN unique_violation THEN
            CONTINUE;
        END;
    END LOOP;

    INSERT INTO public.team_members (session_id, profile_id, team, is_admin)
    VALUES (v_session_id, auth.uid(), 'north', true)
    ON CONFLICT (session_id, profile_id) DO UPDATE
    SET is_admin = true;

    RETURN QUERY SELECT v_session_id, v_room_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_lobby_room(
    p_code text,
    p_display_name text,
    p_team public.team_role
)
RETURNS TABLE (session_id uuid, room_code text, session_status public.game_status)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_session public.game_sessions%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication is required to join a room.';
    END IF;

     IF pg_catalog.length(pg_catalog.btrim(p_display_name)) = 0
         OR pg_catalog.length(pg_catalog.btrim(p_display_name)) > 30 THEN
        RAISE EXCEPTION 'Display name must be between 1 and 30 characters.';
    END IF;

    SELECT gs.*
    INTO v_session
    FROM public.game_sessions gs
    WHERE pg_catalog.upper(gs.code) = pg_catalog.upper(pg_catalog.btrim(p_code))
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Room code was not found.';
    END IF;

    IF v_session.status <> 'LOBBY' THEN
        RAISE EXCEPTION 'This room is no longer accepting players.';
    END IF;

    INSERT INTO public.profiles (id, display_name, role)
    VALUES (auth.uid(), pg_catalog.btrim(p_display_name), 'player')
    ON CONFLICT (id) DO UPDATE
    SET display_name = EXCLUDED.display_name, updated_at = now();

    INSERT INTO public.team_members (session_id, profile_id, team, is_admin)
    VALUES (v_session.id, auth.uid(), p_team, false)
    ON CONFLICT (session_id, profile_id) DO UPDATE
    SET team = EXCLUDED.team;

    RETURN QUERY SELECT v_session.id, v_session.code, v_session.status;
END;
$$;

REVOKE ALL ON FUNCTION public.create_lobby_room() FROM public;
REVOKE ALL ON FUNCTION public.join_lobby_room(text, text, public.team_role) FROM public;
GRANT EXECUTE ON FUNCTION public.create_lobby_room() TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_lobby_room(text, text, public.team_role) TO authenticated;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_members;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END;
$$;

COMMIT;