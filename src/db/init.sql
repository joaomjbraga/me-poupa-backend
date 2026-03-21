-- ============================================
-- Me Poupa - Schema do Banco de Dados
-- ============================================

-- Tabela de usuários
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  avatar_color VARCHAR(7) DEFAULT '#22c55e',
  avatar_image VARCHAR(255),
  family_id UUID,
  invite_code UUID DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de categorias
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  family_id UUID,
  name VARCHAR(100) NOT NULL,
  icon VARCHAR(50) DEFAULT '📦',
  color VARCHAR(7) DEFAULT '#22c55e',
  type VARCHAR(10) CHECK (type IN ('income', 'expense')) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de contas (banco, carteira, etc.)
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  family_id UUID,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) CHECK (type IN ('checking', 'savings', 'cash', 'investment', 'credit')) NOT NULL,
  balance DECIMAL(15, 2) DEFAULT 0.00,
  color VARCHAR(7) DEFAULT '#22c55e',
  icon VARCHAR(50) DEFAULT '🏦',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de transações
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  family_id UUID,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  type VARCHAR(10) CHECK (type IN ('income', 'expense', 'transfer')) NOT NULL,
  amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
  description VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurring_interval VARCHAR(20) CHECK (recurring_interval IN ('daily', 'weekly', 'monthly', 'yearly')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de orçamentos
CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  family_id UUID,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
  month INTEGER CHECK (month BETWEEN 1 AND 12) NOT NULL,
  year INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, category_id, month, year)
);

-- Tabela de metas financeiras
CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  family_id UUID,
  name VARCHAR(100) NOT NULL,
  target_amount DECIMAL(15, 2) NOT NULL CHECK (target_amount > 0),
  current_amount DECIMAL(15, 2) DEFAULT 0.00,
  deadline DATE,
  icon VARCHAR(50) DEFAULT '🎯',
  color VARCHAR(7) DEFAULT '#22c55e',
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_family_id ON transactions(family_id);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_categories_user_id ON categories(user_id);
CREATE INDEX idx_categories_family_id ON categories(family_id);
CREATE INDEX idx_accounts_user_id ON accounts(user_id);
CREATE INDEX idx_accounts_family_id ON accounts(family_id);
CREATE INDEX idx_users_invite_code ON users(invite_code);

-- Tabela de notificações
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  family_id UUID,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_family_id ON notifications(family_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER accounts_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER transactions_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER goals_updated_at BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
