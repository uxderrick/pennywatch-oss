-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_sms TEXT NOT NULL,
  sms_hash VARCHAR(64) NOT NULL UNIQUE,
  amount DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  direction VARCHAR(6) NOT NULL CHECK (direction IN ('credit', 'debit')),
  type VARCHAR(10) NOT NULL DEFAULT 'expense' CHECK (type IN ('expense', 'income', 'transfer')),
  merchant TEXT,
  category VARCHAR(50) NOT NULL,
  source VARCHAR(50) NOT NULL,
  sender TEXT,
  transfer_group_id UUID,
  transaction_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions (category);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions (type);
CREATE INDEX IF NOT EXISTS idx_transactions_transfer_group ON transactions (transfer_group_id) WHERE transfer_group_id IS NOT NULL;

-- Budgets table
CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) NOT NULL UNIQUE,
  monthly_limit DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Category overrides table
CREATE TABLE IF NOT EXISTS category_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  original_category VARCHAR(50) NOT NULL,
  new_category VARCHAR(50) NOT NULL,
  merchant TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Budget alerts sent table
CREATE TABLE IF NOT EXISTS budget_alerts_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) NOT NULL,
  threshold INTEGER NOT NULL CHECK (threshold IN (80, 100)),
  month VARCHAR(7) NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category, threshold, month)
);

-- SMS audit log
CREATE TABLE IF NOT EXISTS sms_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sms_body TEXT NOT NULL,
  sender TEXT,
  received_at TEXT,
  status VARCHAR(20) NOT NULL,
  transaction_id UUID,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Balance snapshots
CREATE TABLE IF NOT EXISTS balance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(50) NOT NULL,
  balance DECIMAL(12, 2) NOT NULL,
  raw_sms TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
