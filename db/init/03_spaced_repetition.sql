-- Create new sr_card_state table with FSRS columns
CREATE TABLE sr_card_state (
  user_id text NOT NULL,
  card_id uuid NOT NULL,
  stability double precision NOT NULL DEFAULT 1.0,
  difficulty double precision NOT NULL DEFAULT 0.3,
  elapsed_days integer NOT NULL DEFAULT 0,
  scheduled_days integer NOT NULL DEFAULT 1,
  reps integer NOT NULL DEFAULT 0,
  state text NOT NULL DEFAULT 'new',
  last_review timestamp with time zone DEFAULT NOW(),
  next_review timestamp with time zone DEFAULT NOW() + INTERVAL '1 day',
  PRIMARY KEY (user_id, card_id)
);