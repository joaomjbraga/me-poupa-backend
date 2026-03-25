import pg from 'pg';
import type { QueryResult, Pool as PgPool, PoolClient } from 'pg';

const { Pool } = pg;

const isProd = process.env.NODE_ENV === 'production';

const pool: PgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProd ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err: Error) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export interface DbRow {
  [key: string]: unknown;
}

export const query = <T extends DbRow = DbRow>(
  text: string, 
  params?: unknown[]
): Promise<QueryResult<T>> => pool.query<T>(text, params);

export const getClient = (): Promise<PoolClient> => pool.connect();

export default pool;
