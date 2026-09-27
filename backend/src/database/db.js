import pg from 'pg';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
const sslEnabled = String(process.env.DATABASE_SSL || '').toLowerCase() === 'true';

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: sslEnabled ? { rejectUnauthorized: false } : false,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err);
});

export function assertDatabaseConfigured() {
  if (!databaseUrl) {
    const err = new Error('DATABASE_URL no está configurada. Cree backend/.env o configure la variable de entorno.');
    err.status = 503;
    throw err;
  }
}

export async function query(text, values = []) {
  assertDatabaseConfigured();
  return pool.query(text, values);
}

export async function withTransaction(callback) {
  assertDatabaseConfigured();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closeDatabase() {
  await pool.end();
}
