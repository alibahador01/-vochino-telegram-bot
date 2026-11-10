-- Vochino Mini App: idempotent wallet requests + receipt notification state + support ticket compatibility.
-- Safe to run more than once. Run against the same PostgreSQL DATABASE_URL used by the Telegram bot.

ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS card_number TEXT;
ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS receipt_file_id TEXT;
ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS commission NUMERIC DEFAULT 0;
ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS payout_amount NUMERIC DEFAULT 0;
ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS tracking_code TEXT;
ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS gateway TEXT;
ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS admin_notified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS admin_notified_at TIMESTAMPTZ;
ALTER TABLE wallet_requests ADD COLUMN IF NOT EXISTS reject_reason TEXT;

-- The existing bot's wallet_gold_verify handler inserts this request type.
-- The original table CHECK omitted it, which can silently break gold verification on a fresh schema.
ALTER TABLE wallet_requests DROP CONSTRAINT IF EXISTS wallet_requests_type_check;
ALTER TABLE wallet_requests ADD CONSTRAINT wallet_requests_type_check
  CHECK (type IN ('deposit', 'withdraw', 'internal_transfer', 'gold_verify'));

-- Do not add a UNIQUE index here: legacy rows may contain duplicate tracking codes.
-- New Mini App codes are generated with a cryptographically random suffix.
CREATE INDEX IF NOT EXISTS wallet_requests_user_created_idx
  ON wallet_requests (telegram_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_requests_pending_idx
  ON wallet_requests (status, created_at DESC) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS webapp_wallet_idempotency (
  telegram_id TEXT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_hash CHAR(64) NOT NULL,
  wallet_request_id INTEGER REFERENCES wallet_requests(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (telegram_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS webapp_wallet_idempotency_created_idx
  ON webapp_wallet_idempotency (created_at);

CREATE TABLE IF NOT EXISTS ai_support_tickets (
  id SERIAL PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  ticket_code TEXT NOT NULL UNIQUE,
  order_tracking_code TEXT,
  question TEXT,
  status TEXT DEFAULT 'open',
  admin_response TEXT,
  reminder_sent BOOLEAN DEFAULT FALSE,
  answered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE ai_support_tickets ADD COLUMN IF NOT EXISTS order_tracking_code TEXT;
ALTER TABLE ai_support_tickets ADD COLUMN IF NOT EXISTS question TEXT;
ALTER TABLE ai_support_tickets ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open';
ALTER TABLE ai_support_tickets ADD COLUMN IF NOT EXISTS admin_response TEXT;
ALTER TABLE ai_support_tickets ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE ai_support_tickets ADD COLUMN IF NOT EXISTS answered_at TIMESTAMP;
ALTER TABLE ai_support_tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
CREATE INDEX IF NOT EXISTS ai_support_tickets_user_created_idx
  ON ai_support_tickets (telegram_id, id DESC);
CREATE INDEX IF NOT EXISTS ai_support_tickets_open_user_idx
  ON ai_support_tickets (telegram_id, id DESC)
  WHERE status IN ('open', 'answered');

-- Wise manual-deposit settings. Disabled by default; the admin must add details explicitly.
INSERT INTO settings (key, value, updated_at)
VALUES ('wise_deposit_details', '', NOW())
ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value, updated_at)
VALUES ('wise_deposit_enabled', '0', NOW())
ON CONFLICT (key) DO NOTHING;

-- Shared PostgreSQL cache across Render instances (one CoinGecko fetch per TTL).
CREATE TABLE IF NOT EXISTS webapp_market_cache (
  cache_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS webapp_market_cache_fetched_idx
  ON webapp_market_cache (fetched_at DESC);
