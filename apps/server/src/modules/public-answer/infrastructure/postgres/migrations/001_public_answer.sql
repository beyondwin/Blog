CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public_answer_release_bindings (
  binding_id uuid PRIMARY KEY,
  content_release_id text NOT NULL,
  answer_release_id text NOT NULL,
  content_manifest_hash text NOT NULL,
  answer_manifest_hash text NOT NULL,
  answer_artifact_hash text NOT NULL,
  embedding_model text NOT NULL CHECK (embedding_model = 'text-embedding-3-large'),
  embedding_dimensions integer NOT NULL CHECK (embedding_dimensions = 3072),
  embedding_source text NOT NULL CHECK (embedding_source IN ('fixture','provider')),
  embedding_receipt_hash text NOT NULL,
  chunk_count integer NOT NULL CHECK (chunk_count >= 0),
  index_checksum text NOT NULL,
  state text NOT NULL CHECK (state IN ('building', 'ready', 'active', 'retired')),
  created_at timestamptz NOT NULL,
  activated_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS public_answer_one_active_binding
  ON public_answer_release_bindings ((state)) WHERE state = 'active';

CREATE TABLE IF NOT EXISTS public_answer_chunks (
  binding_id uuid NOT NULL REFERENCES public_answer_release_bindings(binding_id) ON DELETE CASCADE,
  answer_release_id text NOT NULL,
  chunk_id text NOT NULL,
  chunk_checksum text NOT NULL,
  record_id text NOT NULL,
  canonical_path text NOT NULL,
  title text NOT NULL,
  heading_path text[] NOT NULL,
  body text NOT NULL,
  search_text text NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', search_text)) STORED,
  embedding_model text NOT NULL CHECK (embedding_model = 'text-embedding-3-large'),
  embedding_dimensions integer NOT NULL CHECK (embedding_dimensions = 3072),
  embedding vector(3072) NOT NULL,
  PRIMARY KEY(binding_id, chunk_id)
);

CREATE INDEX IF NOT EXISTS public_answer_chunks_search_vector
  ON public_answer_chunks USING gin (search_vector);
CREATE INDEX IF NOT EXISTS public_answer_chunks_search_trigram
  ON public_answer_chunks USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS public_answer_chunks_exact_vector_scan
  ON public_answer_chunks (binding_id, chunk_id);

CREATE TABLE IF NOT EXISTS public_answer_embedding_cache (
  chunk_checksum text NOT NULL,
  embedding_model text NOT NULL CHECK (embedding_model = 'text-embedding-3-large'),
  embedding_dimensions integer NOT NULL CHECK (embedding_dimensions = 3072),
  embedding_source text NOT NULL CHECK (embedding_source IN ('fixture','provider')),
  embedding_receipt_hash text NOT NULL,
  embedding vector(3072) NOT NULL,
  PRIMARY KEY(chunk_checksum, embedding_model, embedding_dimensions, embedding_source, embedding_receipt_hash)
);

CREATE TABLE IF NOT EXISTS public_answer_tombstones (
  entity_kind text NOT NULL CHECK (entity_kind IN ('record','evidence')),
  entity_id text NOT NULL,
  reason_code text NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY(entity_kind, entity_id)
);

CREATE TABLE IF NOT EXISTS public_answer_deletion_receipts (
  deletion_receipt_hash text PRIMARY KEY,
  entity_kind text NOT NULL CHECK (entity_kind IN ('record','evidence')),
  entity_id text NOT NULL,
  tombstone_hash text NOT NULL,
  affected_answer_release_id text NOT NULL,
  affected_answer_artifact_hash text NOT NULL,
  replacement_answer_release_id text NOT NULL,
  replacement_binding_id uuid NOT NULL REFERENCES public_answer_release_bindings(binding_id),
  active_index_absent_at timestamptz NOT NULL,
  artifact_purge_evidence_checksum text NOT NULL,
  backup_evidence_checksum text NOT NULL,
  backup_expires_at timestamptz NOT NULL,
  verified_at timestamptz NOT NULL,
  UNIQUE(entity_kind, entity_id, tombstone_hash, replacement_answer_release_id)
);

CREATE TABLE IF NOT EXISTS public_answer_events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  request_id text NOT NULL,
  content_release_prefix varchar(12) NOT NULL,
  answer_release_prefix varchar(12) NOT NULL,
  result_kind text NOT NULL,
  error_kind text,
  latency_bucket text NOT NULL,
  retrieved_count smallint NOT NULL,
  provider_input_bucket text NOT NULL,
  provider_output_bucket text NOT NULL,
  rate_bucket text NOT NULL
);

CREATE TABLE IF NOT EXISTS public_answer_daily_aggregates (
  day date NOT NULL,
  result_kind text NOT NULL,
  count bigint NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(day, result_kind)
);
