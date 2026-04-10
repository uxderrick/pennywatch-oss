import pg from 'pg';

import { config } from '../config.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
});

export const readonlyPool = new pg.Pool({
  connectionString: config.databaseReadonlyUrl,
});

export async function query<T extends pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function readonlyQuery<T extends pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return readonlyPool.query<T>(text, params);
}
