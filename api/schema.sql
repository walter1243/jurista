-- Execute este arquivo no SQL Editor do Neon (console.neon.tech)
-- Menu: SQL Editor → New Query → cole e execute

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS clients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  cpf_cnpj    TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS debtors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id),
  name        TEXT NOT NULL,
  cpf         TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS debts (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id              UUID NOT NULL REFERENCES clients(id),
  debtor_id              UUID NOT NULL REFERENCES debtors(id),
  principal_amount       NUMERIC(12,2) NOT NULL,
  interest_rate_monthly  NUMERIC(5,2) NOT NULL,
  fine_rate              NUMERIC(5,2) NOT NULL DEFAULT 2,
  due_date               DATE NOT NULL,
  payment_date           DATE,
  paid_amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
  description            TEXT,
  status                 TEXT NOT NULL DEFAULT 'pending',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id       UUID NOT NULL REFERENCES debts(id),
  amount        NUMERIC(12,2) NOT NULL,
  payment_date  DATE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices para melhor performance
CREATE INDEX IF NOT EXISTS idx_debtors_client_id ON debtors(client_id);
CREATE INDEX IF NOT EXISTS idx_debts_client_id   ON debts(client_id);
CREATE INDEX IF NOT EXISTS idx_debts_debtor_id   ON debts(debtor_id);
CREATE INDEX IF NOT EXISTS idx_debts_due_date    ON debts(due_date);
CREATE INDEX IF NOT EXISTS idx_payments_debt_id  ON payments(debt_id);
