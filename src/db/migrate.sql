-- Script de migracao para remover tabelas nao utilizadas
-- Executar apos atualizar o schema

-- Remover tabelas desnecessarias (execute apenas se quiser remover os dados)
-- DROP TABLE IF EXISTS budgets CASCADE;
-- DROP TABLE IF EXISTS goals CASCADE;
-- DROP TABLE IF EXISTS accounts CASCADE;

-- Remover colunas desnecessarias das transacoes
ALTER TABLE transactions DROP COLUMN IF EXISTS account_id;
ALTER TABLE transactions DROP COLUMN IF EXISTS is_recurring;
ALTER TABLE transactions DROP COLUMN IF EXISTS recurring_interval;

-- Remover indices desnecessarios
DROP INDEX IF EXISTS idx_accounts_user_id;
DROP INDEX IF EXISTS idx_accounts_family_id;

-- Remover triggers desnecessarias
DROP TRIGGER IF EXISTS accounts_updated_at ON accounts;
DROP TRIGGER IF EXISTS goals_updated_at ON goals;
