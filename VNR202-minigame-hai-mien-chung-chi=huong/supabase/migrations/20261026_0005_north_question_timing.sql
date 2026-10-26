BEGIN;

ALTER TABLE public.question_bank
    ADD COLUMN IF NOT EXISTS duration_seconds integer NOT NULL DEFAULT 15
        CHECK (duration_seconds > 0),
    ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 1
        CHECK (points > 0);

COMMIT;
