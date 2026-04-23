-- Content columns (text, transcript) store ciphertext (bytea).
-- Supabase sees row metadata but never plaintext content.

CREATE TABLE IF NOT EXISTS entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  device TEXT NOT NULL,
  content BYTEA NOT NULL,  -- encrypted
  source TEXT NOT NULL CHECK (source IN ('text', 'voice', 'share', 'notif_reply')),
  salience_score REAL NOT NULL DEFAULT 0,
  cluster_id UUID,
  pair_id TEXT NOT NULL  -- device pair identifier
);

CREATE TABLE IF NOT EXISTS clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label BYTEA NOT NULL,  -- encrypted
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  occurrence_count INT NOT NULL DEFAULT 1,
  pushed_count INT NOT NULL DEFAULT 0,
  done_count INT NOT NULL DEFAULT 0,
  dropped_count INT NOT NULL DEFAULT 0,
  confirmed BOOLEAN NOT NULL DEFAULT false,
  pair_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS glossary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  meaning BYTEA NOT NULL,  -- encrypted
  learned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pair_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date TEXT NOT NULL,
  summary BYTEA,  -- encrypted
  transcript BYTEA,  -- encrypted
  llm_used BOOLEAN NOT NULL DEFAULT false,
  duration_s INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pair_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_events (
  id BIGSERIAL PRIMARY KEY,
  pair_id TEXT NOT NULL,
  device TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload BYTEA NOT NULL,  -- encrypted event payload
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_entries_pair ON entries(pair_id, created_at);
CREATE INDEX idx_clusters_pair ON clusters(pair_id);
CREATE INDEX idx_sync_events_pair ON sync_events(pair_id, id);

-- Row Level Security: authenticated users can only access their own data.
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE glossary ENABLE ROW LEVEL SECURITY;
ALTER TABLE reflections ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY entries_pair ON entries FOR ALL TO authenticated
  USING (pair_id = auth.uid()::text)
  WITH CHECK (pair_id = auth.uid()::text);
CREATE POLICY clusters_pair ON clusters FOR ALL TO authenticated
  USING (pair_id = auth.uid()::text)
  WITH CHECK (pair_id = auth.uid()::text);
CREATE POLICY glossary_pair ON glossary FOR ALL TO authenticated
  USING (pair_id = auth.uid()::text)
  WITH CHECK (pair_id = auth.uid()::text);
CREATE POLICY reflections_pair ON reflections FOR ALL TO authenticated
  USING (pair_id = auth.uid()::text)
  WITH CHECK (pair_id = auth.uid()::text);
CREATE POLICY sync_events_pair ON sync_events FOR ALL TO authenticated
  USING (pair_id = auth.uid()::text)
  WITH CHECK (pair_id = auth.uid()::text);

-- Enable realtime for sync_events
ALTER PUBLICATION supabase_realtime ADD TABLE sync_events;
