import { Pool } from 'pg';
import { getAppConfig } from '@/server/config';

type DatabaseStatus = {
  configured: boolean;
  connected: boolean;
  database?: string;
  error?: string;
};

declare global {
  var __lapalomaPgPool: Pool | undefined;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(getAppConfig().database.url);
}

function getPool(): Pool {
  if (globalThis.__lapalomaPgPool) {
    return globalThis.__lapalomaPgPool;
  }

  const connectionString = getAppConfig().database.url;

  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured');
  }

  globalThis.__lapalomaPgPool = new Pool({
    connectionString,
    max: 10,
    ssl:
      connectionString.includes('localhost') ||
      connectionString.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false },
  });

  return globalThis.__lapalomaPgPool;
}

export async function query<T extends Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function checkDatabaseConnection(): Promise<DatabaseStatus> {
  if (!isDatabaseConfigured()) {
    return {
      configured: false,
      connected: false,
    };
  }

  try {
    const rows = await query<{ current_database: string }>(
      'SELECT current_database()',
    );

    return {
      configured: true,
      connected: true,
      database: rows[0]?.current_database,
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      error:
        error instanceof Error ? error.message : 'Unknown database error',
    };
  }
}
