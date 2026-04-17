-- Wrong UNIQUE(date) causes duplicate key errors across users and blocks delete-then-insert.
-- Canonical uniqueness is (user_id, date) per migration 002.
ALTER TABLE public.daily_deficit DROP CONSTRAINT IF EXISTS daily_deficit_date_key;
