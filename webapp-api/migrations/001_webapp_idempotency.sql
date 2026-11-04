-- Vochino Mini App: request idempotency for trade creation.
-- Run once against the same PostgreSQL database used by the Telegram bot.

CREATE TABLE IF NOT EXISTS webapp_idempotency (
    telegram_id TEXT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    idempotency_key VARCHAR(128) NOT NULL,
    request_hash CHAR(64) NOT NULL,
    response_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (telegram_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS webapp_idempotency_created_at_idx
    ON webapp_idempotency (created_at);

-- Query support for Mini App history, same-code duplicate checks, and daily limits.
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_telegram_created_at_idx
    ON orders (telegram_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS sell_orders_telegram_created_at_idx
    ON sell_orders (telegram_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS wallet_requests_telegram_created_at_idx
    ON wallet_requests (telegram_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS transaction_logs_telegram_created_at_idx
    ON transaction_logs (telegram_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS sell_orders_voucher_code_normalized_idx
    ON sell_orders (lower(btrim(voucher_code)))
    WHERE voucher_code IS NOT NULL AND btrim(voucher_code) <> '';
