-- daily_deficit_date_key = UNIQUE(date) breaks multi-user rows and causes duplicate key on sync.
-- Canonical: one row per user per day.
ALTER TABLE public.daily_deficit DROP CONSTRAINT IF EXISTS daily_deficit_date_key;

-- If the table somehow lost composite uniqueness, restore it (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'daily_deficit'
      AND c.contype = 'u'
      AND array_length(c.conkey, 1) = 2
  ) THEN
    ALTER TABLE public.daily_deficit
      ADD CONSTRAINT daily_deficit_user_id_date_key UNIQUE (user_id, date);
  END IF;
END $$;
