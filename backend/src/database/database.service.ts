import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, QueryResultRow } from 'pg';
import { AppConfig } from '../config/env.config';

type DatabaseStatus = {
  configured: boolean;
  connected: boolean;
  database?: string;
  error?: string;
};

@Injectable()
export class DatabaseService {
  private pool: Pool | null = null;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  isConfigured(): boolean {
    return Boolean(this.configService.get('database.url', { infer: true }));
  }

  private getPool(): Pool {
    if (this.pool) {
      return this.pool;
    }

    const connectionString = this.configService.get('database.url', {
      infer: true,
    });

    if (!connectionString) {
      throw new Error('DATABASE_URL is not configured');
    }

    this.pool = new Pool({
      connectionString,
      max: 10,
      ssl:
        connectionString.includes('localhost') ||
        connectionString.includes('127.0.0.1')
          ? false
          : { rejectUnauthorized: false },
    });

    return this.pool;
  }

  async query<T extends QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const result = await this.getPool().query<T>(text, params);
    return result.rows;
  }

  async checkConnection(): Promise<DatabaseStatus> {
    if (!this.isConfigured()) {
      return {
        configured: false,
        connected: false,
      };
    }

    try {
      const rows = await this.query<{ current_database: string }>(
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
}
