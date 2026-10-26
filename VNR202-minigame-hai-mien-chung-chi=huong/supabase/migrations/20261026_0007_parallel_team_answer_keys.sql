BEGIN;

DROP POLICY IF EXISTS "read_active_question_answer_keys" ON public.question_bank_answers;
CREATE POLICY "read_active_question_answer_keys"
ON public.question_bank_answers
FOR SELECT
TO anon, authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.question_bank qb
        WHERE qb.id = question_bank_answers.question_id
          AND qb.is_active = true
          AND (
              (qb.owner_team = 'north' AND qb.kind = 'multiple_choice')
              OR (qb.owner_team = 'south' AND qb.kind = 'fill_blank')
          )
    )
);

COMMIT;
